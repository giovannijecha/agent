import { err, ok, type Conversation, type Result } from "@agent/core";
import type {
  CancellationSignal,
  ModelStream,
  ModelStreamEvent,
  ModelTurnOptions,
  StreamingModel,
  ThinkingEffort,
} from "@agent/runtime";
import type { ToolDescriptor } from "@agent/tools";

import type {
  OllamaCloudCreateError,
  OllamaCloudError,
  OllamaCloudFailureOperation,
  OllamaCloudFailureReason,
} from "./errors.js";
import { OLLAMA_CLOUD_LIMITS } from "./limits.js";
import { isOllamaCloudModelId, type OllamaCloudModelId } from "./models.js";
import { NdjsonDecoder } from "./ndjson.js";
import type {
  OllamaCloudTransport,
  OllamaCloudTransportError,
  OllamaCloudTransportErrorKind,
  OllamaCloudTransportRequest,
  OllamaCloudTransportStream,
} from "./transport.js";
import { Utf8Decoder } from "./utf8.js";
import { encodeRequest, OllamaChatDecoder, type WireError } from "./wire.js";

type TransportOpen = OllamaCloudTransport["open"];
type OwnedTransportStream = Readonly<{
  close: OllamaCloudTransportStream["close"];
  contentType: string | undefined;
  read: OllamaCloudTransportStream["read"];
  statusCode: number;
}>;

function createError(kind: OllamaCloudCreateError["kind"]): OllamaCloudCreateError {
  return Object.freeze({ kind });
}

function modelError(
  operation: OllamaCloudFailureOperation,
  reason: OllamaCloudFailureReason,
  cleanupFailed: boolean = false,
): OllamaCloudError {
  return Object.freeze({ cleanupFailed, kind: "ollamaCloud" as const, operation, reason });
}

function validTransportErrorKind(value: unknown): value is OllamaCloudTransportErrorKind {
  return value === "cancelled" || value === "closed" ||
    value === "concurrentRead" || value === "connection" ||
    value === "limit" || value === "protocol" || value === "timeout";
}

function transportResult<T>(
  value: unknown,
): Result<T, OllamaCloudTransportError> | undefined {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const candidate = value as Readonly<{ error?: unknown; ok?: unknown; value?: unknown }>;
    if (candidate.ok === true) return ok(candidate.value as T);
    if (candidate.ok === false && candidate.error !== null && typeof candidate.error === "object") {
      const kind = (candidate.error as Readonly<{ kind?: unknown }>).kind;
      return validTransportErrorKind(kind)
        ? err(Object.freeze({ kind }))
        : undefined;
    }
    return undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function transportReason(kind: OllamaCloudTransportErrorKind): OllamaCloudFailureReason {
  if (kind === "cancelled") return "transportCancelled";
  if (kind === "closed") return "transportClosed";
  if (kind === "concurrentRead") return "transportConcurrentRead";
  if (kind === "connection") return "transportConnection";
  if (kind === "limit") return "transportLimit";
  if (kind === "timeout") return "transportTimeout";
  return "transportProtocol";
}

function wireReason(error: WireError): OllamaCloudFailureReason {
  if (error.kind === "finishReason") return "finishReason";
  if (error.kind === "limit") return "limit";
  if (error.kind === "request") return "request";
  return error.kind;
}

function framingReason(kind: "limit" | "protocol"): OllamaCloudFailureReason {
  return kind === "limit" ? "limit" : "protocolFraming";
}

function statusReason(statusCode: number): OllamaCloudFailureReason {
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

function snapshotTransportStream(value: unknown): OwnedTransportStream | undefined {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const candidate = value as OllamaCloudTransportStream;
    if (
      typeof candidate.close !== "function" ||
      (candidate.contentType !== undefined && typeof candidate.contentType !== "string") ||
      typeof candidate.read !== "function" ||
      !Number.isSafeInteger(candidate.statusCode) ||
      candidate.statusCode < 100 || candidate.statusCode > 599
    ) return undefined;
    return Object.freeze({
      close: candidate.close.bind(value) as OllamaCloudTransportStream["close"],
      contentType: candidate.contentType,
      read: candidate.read.bind(value) as OllamaCloudTransportStream["read"],
      statusCode: candidate.statusCode,
    });
  } catch (_cause: unknown) {
    return undefined;
  }
}

async function closeTransport(stream: OwnedTransportStream): Promise<boolean> {
  try {
    const closed = transportResult<void>(await stream.close());
    return closed === undefined || !closed.ok;
  } catch (_cause: unknown) {
    return true;
  }
}

function validContentType(contentType: string | undefined): boolean {
  return contentType?.split(";").at(0)?.trim().toLowerCase() === "application/json";
}

class OllamaCloudStream implements ModelStream<OllamaCloudError> {
  readonly #chat: OllamaChatDecoder;
  readonly #events: ModelStreamEvent[] = [];
  readonly #ndjson = new NdjsonDecoder();
  readonly #transport: OwnedTransportStream;
  readonly #utf8 = new Utf8Decoder();
  #closed = false;
  #failed = false;
  #reading = false;
  #terminal = false;

  constructor(
    transport: OwnedTransportStream,
    model: OllamaCloudModelId,
    thinkingEffort: ThinkingEffort,
  ) {
    this.#transport = transport;
    this.#chat = new OllamaChatDecoder(model, thinkingEffort !== "off");
  }

  read(): Promise<Result<ModelStreamEvent, OllamaCloudError>> {
    if (this.#closed || this.#terminal) {
      return Promise.resolve(err(modelError("read", "closed")));
    }
    if (this.#failed) {
      return Promise.resolve(err(modelError("read", "protocolTerminal")));
    }
    if (this.#reading) {
      return Promise.resolve(err(modelError("read", "concurrentRead")));
    }
    this.#reading = true;
    const operation = this.#read();
    void operation.then(
      () => { this.#reading = false; },
      () => { this.#reading = false; },
    );
    return operation;
  }

  async close(): Promise<Result<void, OllamaCloudError>> {
    if (this.#closed) return ok(undefined);
    this.#closed = true;
    try {
      const closed = transportResult<void>(await this.#transport.close());
      if (closed === undefined) return err(modelError("close", "transportProtocol"));
      return closed.ok
        ? ok(undefined)
        : err(modelError("close", transportReason(closed.error.kind)));
    } catch (_cause: unknown) {
      return err(modelError("close", "transportProtocol"));
    }
  }

  async #read(): Promise<Result<ModelStreamEvent, OllamaCloudError>> {
    try {
      while (!this.#closed) {
        const queued = this.#events.shift();
        if (queued !== undefined) {
          if (queued.kind === "done" || queued.kind === "toolCalls") {
            this.#terminal = true;
          }
          return ok(queued);
        }

        const framed = this.#ndjson.next();
        if (!framed.ok) {
          return this.#fail(framingReason(framed.error.kind));
        }
        if (framed.value.kind === "data") {
          const decoded = this.#chat.accept(framed.value.data);
          if (!decoded.ok) return this.#fail(wireReason(decoded.error));
          this.#events.push(...decoded.value);
          continue;
        }
        if (framed.value.kind === "end") {
          const ended = this.#chat.end();
          if (!ended.ok) return this.#fail(wireReason(ended.error));
          this.#events.push(...ended.value);
          if (this.#events.length === 0) {
            return this.#fail("protocolTerminal");
          }
          continue;
        }

        let received: Result<Uint8Array | null, OllamaCloudTransportError> | undefined;
        try {
          received = transportResult<Uint8Array | null>(await this.#transport.read());
        } catch (_cause: unknown) {
          received = undefined;
        }
        if (received === undefined) return this.#fail("transportProtocol");
        if (!received.ok) return this.#fail(transportReason(received.error.kind));
        if (received.value === null) {
          const tail = this.#utf8.finish();
          if (!tail.ok) return this.#fail("encoding");
          if (tail.value.length > 0) {
            const pushed = this.#ndjson.push(tail.value);
            if (!pushed.ok) {
              return this.#fail(framingReason(pushed.error.kind));
            }
          }
          this.#ndjson.finish();
          continue;
        }
        if (!(received.value instanceof Uint8Array)) {
          return this.#fail("transportProtocol");
        }
        const text = this.#utf8.decode(received.value);
        if (!text.ok) return this.#fail("encoding");
        if (text.value.length > 0) {
          const pushed = this.#ndjson.push(text.value);
          if (!pushed.ok) {
            return this.#fail(framingReason(pushed.error.kind));
          }
        }
      }
      return err(modelError("read", "closed"));
    } catch (_cause: unknown) {
      return this.#fail("protocol");
    }
  }

  #fail(
    reason: OllamaCloudFailureReason,
  ): Result<ModelStreamEvent, OllamaCloudError> {
    this.#failed = true;
    return err(modelError("read", reason));
  }
}

/** Concrete Node-free StreamingModel implementation for Ollama Cloud. */
export class OllamaCloudModel implements StreamingModel<OllamaCloudError> {
  readonly #instructions: string;
  readonly #model: OllamaCloudModelId;
  readonly #openTransport: TransportOpen;

  private constructor(
    openTransport: TransportOpen,
    instructions: string,
    model: OllamaCloudModelId,
  ) {
    this.#openTransport = openTransport;
    this.#instructions = instructions;
    this.#model = model;
    Object.freeze(this);
  }

  static create(
    transport: OllamaCloudTransport,
    instructions: string,
    model: OllamaCloudModelId,
  ): Result<OllamaCloudModel, OllamaCloudCreateError> {
    let openTransport: TransportOpen;
    try {
      if (transport === null || typeof transport !== "object" || typeof transport.open !== "function") {
        return err(createError("invalidTransport"));
      }
      openTransport = transport.open.bind(transport) as TransportOpen;
    } catch (_cause: unknown) {
      return err(createError("invalidTransport"));
    }
    if (
      typeof instructions !== "string" || instructions.trim().length === 0 ||
      instructions.length > OLLAMA_CLOUD_LIMITS.instructionsCodeUnits ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(instructions)
    ) return err(createError("invalidInstructions"));
    if (!isOllamaCloudModelId(model)) return err(createError("invalidModel"));
    return ok(new OllamaCloudModel(openTransport, instructions, model));
  }

  async open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
    options: ModelTurnOptions = Object.freeze({ thinkingEffort: "off" }),
  ): Promise<Result<ModelStream<OllamaCloudError>, OllamaCloudError>> {
    if (cancellation.requested) return err(modelError("open", "cancelled"));
    let thinkingEffort: ThinkingEffort;
    try {
      if (
        options === null ||
        typeof options !== "object" ||
        Object.keys(options).sort().join(",") !== "thinkingEffort"
      ) {
        return err(modelError("open", "request"));
      }
      const candidate = (options as Readonly<{ thinkingEffort?: unknown }>)
        .thinkingEffort;
      if (
        candidate !== "off" &&
        candidate !== "low" &&
        candidate !== "medium" &&
        candidate !== "high"
      ) {
        return err(modelError("open", "request"));
      }
      thinkingEffort = candidate;
    } catch (_cause: unknown) {
      return err(modelError("open", "request"));
    }
    const body = encodeRequest(
      conversation,
      this.#instructions,
      tools,
      this.#model,
      thinkingEffort,
    );
    if (!body.ok) return err(modelError("open", wireReason(body.error)));
    const request: OllamaCloudTransportRequest = Object.freeze({ body: body.value });
    let opened: Result<OllamaCloudTransportStream, OllamaCloudTransportError> | undefined;
    try {
      opened = transportResult<OllamaCloudTransportStream>(
        await this.#openTransport(request, cancellation),
      );
    } catch (_cause: unknown) {
      opened = undefined;
    }
    if (opened === undefined) return err(modelError("open", "transportProtocol"));
    if (!opened.ok) return err(modelError("open", transportReason(opened.error.kind)));
    const stream = snapshotTransportStream(opened.value);
    if (stream === undefined) return err(modelError("open", "transportProtocol"));
    if (stream.statusCode !== 200) {
      return err(
        modelError(
          "open",
          statusReason(stream.statusCode),
          await closeTransport(stream),
        ),
      );
    }
    if (!validContentType(stream.contentType)) {
      return err(modelError("open", "contentType", await closeTransport(stream)));
    }
    return ok(new OllamaCloudStream(stream, this.#model, thinkingEffort));
  }
}
