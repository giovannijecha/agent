import { err, ok, type Conversation, type Result } from "@agent/core";
import type {
  CancellationSignal,
  ModelStream,
  ModelStreamEvent,
  StreamingModel,
} from "@agent/runtime";
import type { ToolDescriptor } from "@agent/tools";

import type {
  OpenCodeGoCreateError,
  OpenCodeGoError,
  OpenCodeGoFailureOperation,
  OpenCodeGoFailureReason,
} from "./errors.js";
import { OPENCODE_GO_LIMITS } from "./limits.js";
import {
  isOpenCodeGoModelId,
  OPENCODE_GO_MODEL,
  type OpenCodeGoModelId,
} from "./models.js";
import { SseDecoder } from "./sse.js";
import type {
  OpenCodeGoTransport,
  OpenCodeGoTransportError,
  OpenCodeGoTransportErrorKind,
  OpenCodeGoTransportRequest,
  OpenCodeGoTransportStream,
} from "./transport.js";
import { Utf8Decoder } from "./utf8.js";
import {
  ChatCompletionDecoder,
  encodeRequest,
  type WireError,
} from "./wire.js";

type TransportOpen = OpenCodeGoTransport["open"];
type OwnedTransportStream = Readonly<{
  close: OpenCodeGoTransportStream["close"];
  contentType: string | undefined;
  read: OpenCodeGoTransportStream["read"];
  statusCode: number;
}>;

function createError(kind: OpenCodeGoCreateError["kind"]): OpenCodeGoCreateError {
  return Object.freeze({ kind });
}

function modelError(
  operation: OpenCodeGoFailureOperation,
  reason: OpenCodeGoFailureReason,
  cleanupFailed: boolean = false,
): OpenCodeGoError {
  return Object.freeze({
    cleanupFailed,
    kind: "openCodeGo" as const,
    operation,
    reason,
  });
}

function validTransportErrorKind(
  value: unknown,
): value is OpenCodeGoTransportErrorKind {
  return (
    value === "cancelled" ||
    value === "closed" ||
    value === "concurrentRead" ||
    value === "connection" ||
    value === "limit" ||
    value === "protocol" ||
    value === "timeout"
  );
}

function transportResult<T>(
  value: unknown,
): Result<T, OpenCodeGoTransportError> | undefined {
  try {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    const candidate = value as Readonly<{
      error?: unknown;
      ok?: unknown;
      value?: unknown;
    }>;
    if (candidate.ok === true) {
      return ok(candidate.value as T);
    }
    if (
      candidate.ok === false &&
      candidate.error !== null &&
      typeof candidate.error === "object"
    ) {
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

function transportReason(
  kind: OpenCodeGoTransportErrorKind,
): OpenCodeGoFailureReason {
  if (kind === "cancelled") {
    return "transportCancelled";
  }
  if (kind === "closed") {
    return "transportClosed";
  }
  if (kind === "concurrentRead") {
    return "transportConcurrentRead";
  }
  if (kind === "connection") {
    return "transportConnection";
  }
  if (kind === "limit") {
    return "transportLimit";
  }
  if (kind === "timeout") {
    return "transportTimeout";
  }
  return "transportProtocol";
}

function wireReason(error: WireError): OpenCodeGoFailureReason {
  if (error.kind === "finishReason") {
    return "finishReason";
  }
  if (error.kind === "limit") {
    return "limit";
  }
  return error.kind === "request" ? "request" : "protocol";
}

function snapshotTransportStream(value: unknown): OwnedTransportStream | undefined {
  try {
    if (value === null || typeof value !== "object") {
      return undefined;
    }
    const candidate = value as OpenCodeGoTransportStream;
    const close = candidate.close;
    const contentType = candidate.contentType;
    const read = candidate.read;
    const statusCode = candidate.statusCode;
    if (
      typeof close !== "function" ||
      (contentType !== undefined && typeof contentType !== "string") ||
      typeof read !== "function" ||
      !Number.isSafeInteger(statusCode) ||
      statusCode < 100 ||
      statusCode > 599
    ) {
      return undefined;
    }
    return Object.freeze({
      close: close.bind(value) as OpenCodeGoTransportStream["close"],
      contentType,
      read: read.bind(value) as OpenCodeGoTransportStream["read"],
      statusCode,
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

function validEventStream(contentType: string | undefined): boolean {
  return (
    contentType
      ?.split(";")
      .at(0)
      ?.trim()
      .toLowerCase() === "text/event-stream"
  );
}

class OpenCodeGoStream implements ModelStream<OpenCodeGoError> {
  readonly #chat = new ChatCompletionDecoder();
  readonly #events: ModelStreamEvent[] = [];
  readonly #sse = new SseDecoder();
  readonly #transport: OwnedTransportStream;
  readonly #utf8 = new Utf8Decoder();
  #closed = false;
  #reading = false;
  #terminal = false;

  constructor(transport: OwnedTransportStream) {
    this.#transport = transport;
  }

  read(): Promise<Result<ModelStreamEvent, OpenCodeGoError>> {
    if (this.#closed || this.#terminal) {
      return Promise.resolve(err(modelError("read", "closed")));
    }
    if (this.#reading) {
      return Promise.resolve(err(modelError("read", "concurrentRead")));
    }
    this.#reading = true;
    const operation = this.#read();
    void operation.then(
      () => {
        this.#reading = false;
      },
      () => {
        this.#reading = false;
      },
    );
    return operation;
  }

  async close(): Promise<Result<void, OpenCodeGoError>> {
    if (this.#closed) {
      return ok(undefined);
    }
    this.#closed = true;
    try {
      const closed = transportResult<void>(await this.#transport.close());
      if (closed === undefined) {
        return err(modelError("close", "transportProtocol"));
      }
      return closed.ok
        ? ok(undefined)
        : err(modelError("close", transportReason(closed.error.kind)));
    } catch (_cause: unknown) {
      return err(modelError("close", "transportProtocol"));
    }
  }

  async #read(): Promise<Result<ModelStreamEvent, OpenCodeGoError>> {
    try {
      while (!this.#closed) {
        const queued = this.#events.shift();
        if (queued !== undefined) {
          if (queued.kind !== "delta") {
            this.#terminal = true;
          }
          return ok(queued);
        }

        const framed = this.#sse.next();
        if (!framed.ok) {
          return err(modelError("read", framed.error.kind));
        }
        if (framed.value.kind === "data") {
          const decoded = this.#chat.accept(framed.value.data);
          if (!decoded.ok) {
            return err(modelError("read", wireReason(decoded.error)));
          }
          this.#events.push(...decoded.value);
          continue;
        }
        if (framed.value.kind === "end") {
          const ended = this.#chat.end();
          if (!ended.ok) {
            return err(modelError("read", wireReason(ended.error)));
          }
          this.#events.push(...ended.value);
          if (this.#events.length === 0) {
            return err(modelError("read", "protocol"));
          }
          continue;
        }

        let received: Result<Uint8Array | null, OpenCodeGoTransportError> | undefined;
        try {
          received = transportResult<Uint8Array | null>(
            await this.#transport.read(),
          );
        } catch (_cause: unknown) {
          received = undefined;
        }
        if (received === undefined) {
          return err(modelError("read", "transportProtocol"));
        }
        if (!received.ok) {
          return err(
            modelError("read", transportReason(received.error.kind)),
          );
        }
        if (received.value === null) {
          const tail = this.#utf8.finish();
          if (!tail.ok) {
            return err(modelError("read", "encoding"));
          }
          if (tail.value.length > 0) {
            const pushed = this.#sse.push(tail.value);
            if (!pushed.ok) {
              return err(modelError("read", pushed.error.kind));
            }
          }
          this.#sse.finish();
          continue;
        }
        if (!(received.value instanceof Uint8Array)) {
          return err(modelError("read", "transportProtocol"));
        }
        const text = this.#utf8.decode(received.value);
        if (!text.ok) {
          return err(modelError("read", "encoding"));
        }
        if (text.value.length > 0) {
          const pushed = this.#sse.push(text.value);
          if (!pushed.ok) {
            return err(modelError("read", pushed.error.kind));
          }
        }
      }
      return err(modelError("read", "closed"));
    } catch (_cause: unknown) {
      return err(modelError("read", "protocol"));
    }
  }
}

/** Concrete Node-free StreamingModel implementation for OpenCode Go. */
export class OpenCodeGoModel implements StreamingModel<OpenCodeGoError> {
  readonly #instructions: string;
  readonly #model: OpenCodeGoModelId;
  readonly #openTransport: TransportOpen;

  private constructor(
    openTransport: TransportOpen,
    instructions: string,
    model: OpenCodeGoModelId,
  ) {
    this.#openTransport = openTransport;
    this.#instructions = instructions;
    this.#model = model;
    Object.freeze(this);
  }

  static create(
    transport: OpenCodeGoTransport,
    instructions: string,
    model: OpenCodeGoModelId = OPENCODE_GO_MODEL,
  ): Result<OpenCodeGoModel, OpenCodeGoCreateError> {
    let openTransport: TransportOpen;
    try {
      if (transport === null || typeof transport !== "object") {
        return err(createError("invalidTransport"));
      }
      const open = transport.open;
      if (typeof open !== "function") {
        return err(createError("invalidTransport"));
      }
      openTransport = open.bind(transport) as TransportOpen;
    } catch (_cause: unknown) {
      return err(createError("invalidTransport"));
    }
    if (
      typeof instructions !== "string" ||
      instructions.trim().length === 0 ||
      instructions.length > OPENCODE_GO_LIMITS.instructionsCodeUnits ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(instructions)
    ) {
      return err(createError("invalidInstructions"));
    }
    if (!isOpenCodeGoModelId(model)) {
      return err(createError("invalidModel"));
    }
    return ok(new OpenCodeGoModel(openTransport, instructions, model));
  }

  async open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
  ): Promise<Result<ModelStream<OpenCodeGoError>, OpenCodeGoError>> {
    if (cancellation.requested) {
      return err(modelError("open", "cancelled"));
    }
    const body = encodeRequest(
      conversation,
      this.#instructions,
      tools,
      this.#model,
    );
    if (!body.ok) {
      return err(modelError("open", wireReason(body.error)));
    }
    const request: OpenCodeGoTransportRequest = Object.freeze({
      body: body.value,
    });
    let opened: Result<OpenCodeGoTransportStream, OpenCodeGoTransportError> | undefined;
    try {
      opened = transportResult<OpenCodeGoTransportStream>(
        await this.#openTransport(request, cancellation),
      );
    } catch (_cause: unknown) {
      opened = undefined;
    }
    if (opened === undefined) {
      return err(modelError("open", "transportProtocol"));
    }
    if (!opened.ok) {
      return err(modelError("open", transportReason(opened.error.kind)));
    }
    const stream = snapshotTransportStream(opened.value);
    if (stream === undefined) {
      return err(modelError("open", "transportProtocol"));
    }
    if (stream.statusCode !== 200) {
      const cleanupFailed = await closeTransport(stream);
      return err(modelError("open", "status", cleanupFailed));
    }
    if (!validEventStream(stream.contentType)) {
      const cleanupFailed = await closeTransport(stream);
      return err(modelError("open", "contentType", cleanupFailed));
    }
    return ok(new OpenCodeGoStream(stream));
  }
}
