import { err, ok, type Result } from "@agent/core";

import type { ProviderId } from "./provider-identity.js";
import { decodeUtf8Text } from "./utf8-text.js";

export const PROVIDER_MODEL_CATALOG_LIMITS = Object.freeze({
  bodyBytes: 65_536,
  identifierCodeUnits: 128,
  models: 256,
});

export type ProviderModelCatalogErrorKind =
  | "connection"
  | "contentType"
  | "encoding"
  | "limit"
  | "protocol"
  | "status"
  | "timeout";

export type ProviderModelCatalogError = Readonly<{
  kind: ProviderModelCatalogErrorKind;
}>;

export interface ProviderModelCatalog {
  list(
    provider: ProviderId,
  ): Promise<Result<readonly string[], ProviderModelCatalogError>>;
}

function failure(
  kind: ProviderModelCatalogErrorKind,
): ProviderModelCatalogError {
  return Object.freeze({ kind });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Decodes one bounded public model-list response. */
export function decodeProviderModelCatalog(
  bytes: unknown,
): Result<readonly string[], ProviderModelCatalogError> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < 1 ||
    bytes.length > PROVIDER_MODEL_CATALOG_LIMITS.bodyBytes
  ) {
    return err(failure("limit"));
  }
  const decoded = decodeUtf8Text(bytes, true);
  if (!decoded.ok) {
    return err(failure("encoding"));
  }
  let value: unknown;
  try {
    value = JSON.parse(decoded.value) as unknown;
  } catch (_cause: unknown) {
    return err(failure("protocol"));
  }
  if (!isRecord(value) || value.object !== "list" || !Array.isArray(value.data)) {
    return err(failure("protocol"));
  }
  if (
    value.data.length < 1 ||
    value.data.length > PROVIDER_MODEL_CATALOG_LIMITS.models
  ) {
    return err(failure("limit"));
  }
  const identifiers: string[] = [];
  const seen = new Set<string>();
  for (const entry of value.data) {
    if (
      !isRecord(entry) ||
      entry.object !== "model" ||
      typeof entry.id !== "string" ||
      entry.id.length < 1 ||
      entry.id.length > PROVIDER_MODEL_CATALOG_LIMITS.identifierCodeUnits ||
      !/^[a-z0-9][a-z0-9._-]*$/u.test(entry.id) ||
      seen.has(entry.id)
    ) {
      return err(failure("protocol"));
    }
    seen.add(entry.id);
    identifiers.push(entry.id);
  }
  return ok(Object.freeze(identifiers));
}
