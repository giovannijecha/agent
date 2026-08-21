import { err, ok, type Result } from "@agent/core";
import type { CancellationSignal } from "@agent/runtime";

import type { OpenAIError, OpenAIFailureReason } from "./errors.js";
import { OPENAI_PROVIDER_LIMITS } from "./limits.js";
import { isOpenAIModelId, type OpenAIModelId } from "./models.js";
import type {
  OpenAICatalogCapture,
  OpenAIProviderTransport,
  OpenAITransportError,
  OpenAITransportErrorKind,
} from "./transport.js";
import { Utf8Decoder } from "./utf8.js";

type CatalogOperation = OpenAIProviderTransport["catalog"];

function failure(reason: OpenAIFailureReason, cleanupFailed = false): OpenAIError {
  return Object.freeze({
    cleanupFailed,
    kind: "openaiSubscription" as const,
    operation: "catalog" as const,
    reason,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function transportKind(value: unknown): value is OpenAITransportErrorKind {
  return value === "cancelled" || value === "closed" ||
    value === "concurrentRead" || value === "connection" || value === "limit" ||
    value === "protocol" || value === "timeout";
}

function transportResult<T>(value: unknown): Result<T, OpenAITransportError> | undefined {
  try {
    if (!isRecord(value)) return undefined;
    if (value.ok === true) return ok(value.value as T);
    if (value.ok === false && isRecord(value.error) &&
      typeof value.error.cleanupFailed === "boolean" && transportKind(value.error.kind)) {
      return err(Object.freeze({
        cleanupFailed: value.error.cleanupFailed,
        kind: value.error.kind,
      }));
    }
    return undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function transportReason(kind: OpenAITransportErrorKind): OpenAIFailureReason {
  if (kind === "cancelled") return "transportCancelled";
  if (kind === "closed") return "transportClosed";
  if (kind === "concurrentRead") return "transportConcurrentRead";
  if (kind === "connection") return "transportConnection";
  if (kind === "limit") return "transportLimit";
  if (kind === "timeout") return "transportTimeout";
  return "transportProtocol";
}

function statusReason(statusCode: number): OpenAIFailureReason {
  if (statusCode >= 400 && statusCode <= 499) {
    if (statusCode >= 401 && statusCode <= 404) return "statusRejected";
    if (statusCode === 408) return "statusTimeout";
    if (statusCode === 413 || statusCode === 429) return "statusLimit";
    return "statusRequest";
  }
  if (statusCode >= 500 && statusCode <= 599) {
    return statusCode === 504 ? "statusTimeout" : "statusConnectivity";
  }
  return "statusProtocol";
}

function validContentType(value: string | undefined): boolean {
  return value !== undefined &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(value);
}

function snapshotCapture(value: unknown): OpenAICatalogCapture | undefined {
  try {
    if (!isRecord(value) || !(value.body instanceof Uint8Array) ||
      value.body.length > OPENAI_PROVIDER_LIMITS.catalogBodyBytes ||
      typeof value.cleanupFailed !== "boolean" ||
      (value.contentType !== undefined && typeof value.contentType !== "string") ||
      !Number.isSafeInteger(value.statusCode) ||
      (value.statusCode as number) < 100 || (value.statusCode as number) > 599) {
      return undefined;
    }
    return Object.freeze({
      body: Uint8Array.from(value.body),
      cleanupFailed: value.cleanupFailed,
      contentType: value.contentType as string | undefined,
      statusCode: value.statusCode as number,
    });
  } catch (_cause: unknown) {
    return undefined;
  }
}

/** Strictly decodes the decision-0095 authenticated catalog projection. */
export function decodeOpenAIModelCatalog(
  bytes: Uint8Array,
): Result<readonly OpenAIModelId[], OpenAIError> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 ||
    bytes.length > OPENAI_PROVIDER_LIMITS.catalogBodyBytes) {
    return err(failure("limit"));
  }
  const utf8 = new Utf8Decoder();
  const decoded = utf8.decode(bytes);
  if (!decoded.ok) return err(failure("encoding"));
  const tail = utf8.finish();
  if (!tail.ok) return err(failure("encoding"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.value + tail.value) as unknown;
  } catch (_cause: unknown) {
    return err(failure("protocolCatalog"));
  }
  if (!isRecord(parsed) || Object.keys(parsed).sort().join(",") !== "models" ||
    !Array.isArray(parsed.models) || parsed.models.length < 1 ||
    parsed.models.length > OPENAI_PROVIDER_LIMITS.catalogModels) {
    return err(failure("protocolCatalog"));
  }
  const seen = new Set<string>();
  const eligible: OpenAIModelId[] = [];
  for (const candidate of parsed.models) {
    if (!isRecord(candidate) || !isOpenAIModelId(candidate.slug) ||
      (candidate.visibility !== "list" && candidate.visibility !== "hide" &&
        candidate.visibility !== "none") ||
      typeof candidate.supported_in_api !== "boolean" || seen.has(candidate.slug)) {
      return err(failure("protocolCatalog"));
    }
    seen.add(candidate.slug);
    if (candidate.visibility === "list" && candidate.supported_in_api) {
      eligible.push(candidate.slug);
    }
  }
  return eligible.length > 0
    ? ok(Object.freeze(eligible))
    : err(failure("protocolCatalog"));
}

/** Inactive catalog adapter; no current product path constructs this class. */
export class OpenAIModelCatalog {
  readonly #catalog: CatalogOperation;

  private constructor(catalog: CatalogOperation) {
    this.#catalog = catalog;
    Object.freeze(this);
  }

  static create(transport: OpenAIProviderTransport): Result<OpenAIModelCatalog, OpenAIError> {
    try {
      if (transport === null || typeof transport !== "object" ||
        typeof transport.catalog !== "function") {
        return err(failure("protocol"));
      }
      return ok(new OpenAIModelCatalog(
        transport.catalog.bind(transport) as CatalogOperation,
      ));
    } catch (_cause: unknown) {
      return err(failure("protocol"));
    }
  }

  async list(
    cancellation: CancellationSignal,
  ): Promise<Result<readonly OpenAIModelId[], OpenAIError>> {
    let requested: boolean;
    try {
      requested = cancellation.requested;
    } catch (_cause: unknown) {
      return err(failure("protocol"));
    }
    if (requested) return err(failure("cancelled"));
    let received: Result<OpenAICatalogCapture, OpenAITransportError> | undefined;
    try {
      received = transportResult<OpenAICatalogCapture>(await this.#catalog(cancellation));
    } catch (_cause: unknown) {
      received = undefined;
    }
    if (received === undefined) return err(failure("transportProtocol"));
    if (!received.ok) {
      return err(failure(
        transportReason(received.error.kind),
        received.error.cleanupFailed,
      ));
    }
    const capture = snapshotCapture(received.value);
    if (capture === undefined) return err(failure("transportProtocol"));
    if (capture.statusCode !== 200) {
      return err(failure(statusReason(capture.statusCode), capture.cleanupFailed));
    }
    if (!validContentType(capture.contentType)) {
      return err(failure("contentType", capture.cleanupFailed));
    }
    const decoded = decodeOpenAIModelCatalog(capture.body);
    return decoded.ok || !capture.cleanupFailed
      ? decoded
      : err(failure(decoded.error.reason, true));
  }
}
