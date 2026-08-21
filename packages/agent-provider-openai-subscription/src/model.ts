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
  OpenAICreateError,
  OpenAIError,
  OpenAIFailureOperation,
  OpenAIFailureReason,
} from "./errors.js";
import { OPENAI_PROVIDER_LIMITS } from "./limits.js";
import { isOpenAIModelId, type OpenAIModelId } from "./models.js";
import { SseDecoder } from "./sse.js";
import type {
  OpenAIProviderTransport,
  OpenAITransportError,
  OpenAITransportErrorKind,
  OpenAITransportRequest,
  OpenAITransportStream,
} from "./transport.js";
import { Utf8Decoder } from "./utf8.js";
import {
  encodeOpenAIRequest,
  OpenAIResponsesDecoder,
  type OpenAIWireError,
} from "./wire.js";

type TransportOpen = OpenAIProviderTransport["open"];
type OwnedTransportCloser = Readonly<{
  close: OpenAITransportStream["close"];
}>;
type OwnedTransportStream = OwnedTransportCloser & Readonly<{
  contentType: string | undefined;
  read: OpenAITransportStream["read"];
  statusCode: number;
}>;

function createError(kind: OpenAICreateError["kind"]): OpenAICreateError {
  return Object.freeze({ kind });
}

function modelError(
  operation: OpenAIFailureOperation,
  reason: OpenAIFailureReason,
  cleanupFailed: boolean = false,
): OpenAIError {
  return Object.freeze({
    cleanupFailed,
    kind: "openaiSubscription" as const,
    operation,
    reason,
  });
}

function validTransportErrorKind(value: unknown): value is OpenAITransportErrorKind {
  return value === "cancelled" || value === "closed" || value === "concurrentRead" ||
    value === "connection" || value === "limit" || value === "protocol" ||
    value === "timeout";
}

function transportResult<T>(value: unknown): Result<T, OpenAITransportError> | undefined {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const candidate = value as Readonly<{ error?: unknown; ok?: unknown; value?: unknown }>;
    if (candidate.ok === true) return ok(candidate.value as T);
    if (candidate.ok === false && candidate.error !== null &&
      typeof candidate.error === "object") {
      const kind = (candidate.error as Readonly<{ kind?: unknown }>).kind;
      const cleanupFailed = (candidate.error as Readonly<{
        cleanupFailed?: unknown;
      }>).cleanupFailed;
      return validTransportErrorKind(kind) && typeof cleanupFailed === "boolean"
        ? err(Object.freeze({ cleanupFailed, kind }))
        : undefined;
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

function snapshotResponseChunk(value: Uint8Array): Uint8Array | undefined {
  try {
    const length = value.length;
    if (!Number.isSafeInteger(length) || length < 1 ||
      length > OPENAI_PROVIDER_LIMITS.responseChunkBytes) return undefined;
    const snapshot = new Uint8Array(length);
    snapshot.set(value);
    return snapshot;
  } catch (_cause: unknown) {
    return undefined;
  }
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

function wireReason(error: OpenAIWireError): OpenAIFailureReason {
  return error.kind;
}

function snapshotTransportCloser(value: unknown): OwnedTransportCloser | undefined {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const candidate = value as OpenAITransportStream;
    const close = candidate.close;
    return typeof close === "function"
      ? Object.freeze({ close: close.bind(value) as OpenAITransportStream["close"] })
      : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function snapshotTransportStream(
  value: unknown,
  closer: OwnedTransportCloser,
): OwnedTransportStream | undefined {
  try {
    if (value === null || typeof value !== "object") return undefined;
    const candidate = value as OpenAITransportStream;
    const contentType = candidate.contentType;
    const read = candidate.read;
    const statusCode = candidate.statusCode;
    if (typeof read !== "function" ||
      (contentType !== undefined && typeof contentType !== "string") ||
      !Number.isSafeInteger(statusCode) || statusCode < 100 || statusCode > 599) return undefined;
    return Object.freeze({
      close: closer.close,
      contentType,
      read: read.bind(value) as OpenAITransportStream["read"],
      statusCode,
    });
  } catch (_cause: unknown) {
    return undefined;
  }
}

async function closeTransport(stream: OwnedTransportCloser): Promise<boolean> {
  try {
    const closed = transportResult<void>(await stream.close());
    return closed === undefined || !closed.ok;
  } catch (_cause: unknown) {
    return true;
  }
}

function validContentType(value: string | undefined): boolean {
  return value !== undefined &&
    /^text\/event-stream(?:\s*;\s*charset=utf-8)?$/iu.test(value);
}

class OpenAIStream implements ModelStream<OpenAIError> {
  readonly #events: ModelStreamEvent[] = [];
  readonly #responses: OpenAIResponsesDecoder;
  readonly #sse = new SseDecoder();
  readonly #transport: OwnedTransportStream;
  readonly #utf8 = new Utf8Decoder();
  #closed = false;
  #completion: ModelStreamEvent | undefined;
  #failed = false;
  #reading = false;
  #terminal = false;

  constructor(
    transport: OwnedTransportStream,
    thinkingEffort: ThinkingEffort,
  ) {
    this.#transport = transport;
    this.#responses = new OpenAIResponsesDecoder(thinkingEffort !== "off");
  }

  read(): Promise<Result<ModelStreamEvent, OpenAIError>> {
    if (this.#closed || this.#terminal) {
      return Promise.resolve(err(modelError("read", "closed")));
    }
    if (this.#failed) return Promise.resolve(err(modelError("read", "protocolTerminal")));
    if (this.#reading) return Promise.resolve(err(modelError("read", "concurrentRead")));
    this.#reading = true;
    const operation = this.#read();
    void operation.then(
      () => { this.#reading = false; },
      () => { this.#reading = false; },
    );
    return operation;
  }

  async close(): Promise<Result<void, OpenAIError>> {
    if (this.#closed) return ok(undefined);
    this.#closed = true;
    try {
      const closed = transportResult<void>(await this.#transport.close());
      if (closed === undefined) return err(modelError("close", "transportProtocol"));
      return closed.ok
        ? ok(undefined)
        : err(modelError(
            "close",
            transportReason(closed.error.kind),
            closed.error.cleanupFailed,
          ));
    } catch (_cause: unknown) {
      return err(modelError("close", "transportProtocol"));
    }
  }

  async #read(): Promise<Result<ModelStreamEvent, OpenAIError>> {
    try {
      while (!this.#closed) {
        const queued = this.#events.shift();
        if (queued !== undefined) {
          if (queued.kind === "done" || queued.kind === "toolCalls") {
            if (this.#completion !== undefined) return this.#fail("protocolTerminal");
            this.#completion = queued;
            continue;
          }
          return ok(queued);
        }
        const framed = this.#sse.next();
        if (!framed.ok) {
          return this.#fail(framed.error.kind === "limit" ? "limit" : "protocolFraming");
        }
        if (framed.value.kind === "data") {
          const decoded = this.#responses.accept(framed.value.event);
          if (!decoded.ok) return this.#fail(wireReason(decoded.error));
          this.#events.push(...decoded.value);
          continue;
        }
        if (framed.value.kind === "end") {
          const ended = this.#responses.end();
          if (!ended.ok) return this.#fail(wireReason(ended.error));
          if (this.#events.length !== 0 || this.#completion === undefined) {
            return this.#fail("protocolTerminal");
          }
          const completion = this.#completion;
          this.#completion = undefined;
          this.#terminal = true;
          return ok(completion);
        }
        let received: Result<Uint8Array | null, OpenAITransportError> | undefined;
        try {
          received = transportResult<Uint8Array | null>(await this.#transport.read());
        } catch (_cause: unknown) {
          received = undefined;
        }
        if (received === undefined) return this.#fail("transportProtocol");
        if (!received.ok) {
          return this.#fail(
            transportReason(received.error.kind),
            received.error.cleanupFailed,
          );
        }
        if (received.value === null) {
          const tail = this.#utf8.finish();
          if (!tail.ok) return this.#fail("encoding");
          if (tail.value.length > 0) {
            const pushed = this.#sse.push(tail.value);
            if (!pushed.ok) {
              return this.#fail(pushed.error.kind === "limit" ? "limit" : "protocolFraming");
            }
          }
          this.#sse.finish();
          continue;
        }
        if (!(received.value instanceof Uint8Array)) return this.#fail("transportProtocol");
        const chunk = snapshotResponseChunk(received.value);
        if (chunk === undefined) return this.#fail("limit");
        const text = this.#utf8.decode(chunk);
        if (!text.ok) return this.#fail("encoding");
        if (text.value.length > 0) {
          const pushed = this.#sse.push(text.value);
          if (!pushed.ok) {
            return this.#fail(pushed.error.kind === "limit" ? "limit" : "protocolFraming");
          }
        }
      }
      return err(modelError("read", "closed"));
    } catch (_cause: unknown) {
      return this.#fail("protocol");
    }
  }

  #fail(
    reason: OpenAIFailureReason,
    cleanupFailed = false,
  ): Result<ModelStreamEvent, OpenAIError> {
    this.#failed = true;
    return err(modelError("read", reason, cleanupFailed));
  }
}

/** Node-free inactive StreamingModel implementation for OpenAI subscription. */
export class OpenAISubscriptionModel implements StreamingModel<OpenAIError> {
  readonly #instructions: string;
  readonly #model: OpenAIModelId;
  readonly #openTransport: TransportOpen;

  private constructor(
    openTransport: TransportOpen,
    instructions: string,
    model: OpenAIModelId,
  ) {
    this.#openTransport = openTransport;
    this.#instructions = instructions;
    this.#model = model;
    Object.freeze(this);
  }

  static create(
    transport: OpenAIProviderTransport,
    instructions: string,
    model: OpenAIModelId,
  ): Result<OpenAISubscriptionModel, OpenAICreateError> {
    let openTransport: TransportOpen;
    try {
      if (transport === null || typeof transport !== "object" ||
        typeof transport.open !== "function") {
        return err(createError("invalidTransport"));
      }
      openTransport = transport.open.bind(transport) as TransportOpen;
    } catch (_cause: unknown) {
      return err(createError("invalidTransport"));
    }
    if (typeof instructions !== "string" || instructions.trim().length === 0 ||
      instructions.length > OPENAI_PROVIDER_LIMITS.instructionsCodeUnits ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(instructions)) {
      return err(createError("invalidInstructions"));
    }
    if (!isOpenAIModelId(model)) return err(createError("invalidModel"));
    return ok(new OpenAISubscriptionModel(openTransport, instructions, model));
  }

  async open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
    options: ModelTurnOptions = Object.freeze({ thinkingEffort: "off" }),
  ): Promise<Result<ModelStream<OpenAIError>, OpenAIError>> {
    let cancellationRequested: boolean;
    try {
      const requested = cancellation.requested;
      if (typeof requested !== "boolean") return err(modelError("open", "protocol"));
      cancellationRequested = requested;
    } catch (_cause: unknown) {
      return err(modelError("open", "protocol"));
    }
    if (cancellationRequested) return err(modelError("open", "cancelled"));
    let thinkingEffort: ThinkingEffort;
    try {
      if (options === null || typeof options !== "object" ||
        Object.keys(options).sort().join(",") !== "thinkingEffort") {
        return err(modelError("open", "request"));
      }
      const candidate = (options as Readonly<{ thinkingEffort?: unknown }>).thinkingEffort;
      if (candidate !== "off" && candidate !== "low" && candidate !== "medium" &&
        candidate !== "high") return err(modelError("open", "request"));
      thinkingEffort = candidate;
    } catch (_cause: unknown) {
      return err(modelError("open", "request"));
    }
    const body = encodeOpenAIRequest(
      conversation,
      this.#instructions,
      tools,
      this.#model,
      thinkingEffort,
    );
    if (!body.ok) return err(modelError("open", wireReason(body.error)));
    const request: OpenAITransportRequest = Object.freeze({ body: body.value });
    let opened: Result<OpenAITransportStream, OpenAITransportError> | undefined;
    try {
      opened = transportResult<OpenAITransportStream>(
        await this.#openTransport(request, cancellation),
      );
    } catch (_cause: unknown) {
      opened = undefined;
    }
    if (opened === undefined) return err(modelError("open", "transportProtocol"));
    if (!opened.ok) {
      return err(modelError(
        "open",
        transportReason(opened.error.kind),
        opened.error.cleanupFailed,
      ));
    }
    const closer = snapshotTransportCloser(opened.value);
    if (closer === undefined) return err(modelError("open", "transportProtocol"));
    const stream = snapshotTransportStream(opened.value, closer);
    if (stream === undefined) {
      return err(modelError("open", "transportProtocol", await closeTransport(closer)));
    }
    if (stream.statusCode !== 200) {
      return err(modelError("open", statusReason(stream.statusCode), await closeTransport(stream)));
    }
    if (!validContentType(stream.contentType)) {
      return err(modelError("open", "contentType", await closeTransport(stream)));
    }
    return ok(new OpenAIStream(stream, thinkingEffort));
  }
}
