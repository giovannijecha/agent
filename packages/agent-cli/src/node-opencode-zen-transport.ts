import {
  request as nodeHttpsRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:https";

import { err, ok, type Result } from "@agent/core";
import {
  OPENCODE_ZEN_LIMITS,
  type OpenCodeZenTransport,
  type OpenCodeZenTransportError,
  type OpenCodeZenTransportErrorKind,
  type OpenCodeZenTransportRequest,
  type OpenCodeZenTransportStream,
} from "@agent/provider-opencode-zen";
import type { CancellationSignal } from "@agent/runtime";

import { isValidOpenCodeZenCredential } from "./provider-configuration.js";

export const OPENCODE_ZEN_TRANSPORT_LIMITS = Object.freeze({
  headerBytes: 16_384,
  inactivityMilliseconds: 120_000,
  responseChunkBytes: 65_536,
});

export const OPENCODE_ZEN_ORIGIN = "https://opencode.ai";
export const OPENCODE_ZEN_CHAT_PATH = "/zen/v1/chat/completions";

type HttpsResponse = IncomingMessage;
type HttpsRequest = ClientRequest;
type RequestHttps = HttpsClient["request"];

export interface HttpsClient {
  request(
    options: RequestOptions,
    onResponse: (response: HttpsResponse) => void,
  ): HttpsRequest;
}

export type NodeOpenCodeZenTransportCreateError = Readonly<{
  kind: "invalidConfiguration";
}>;

const NODE_HTTPS_CLIENT: HttpsClient = Object.freeze({
  request: nodeHttpsRequest,
});

function failure(
  kind: OpenCodeZenTransportErrorKind,
): OpenCodeZenTransportError {
  return Object.freeze({ kind });
}

function contentType(response: HttpsResponse): string | undefined {
  const value = response.headers["content-type"];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.length === 1) {
    return value.at(0);
  }
  return undefined;
}

class NodeOpenCodeZenStream implements OpenCodeZenTransportStream {
  readonly contentType: string | undefined;
  readonly #response: HttpsResponse;
  readonly statusCode: number;
  #closed = false;
  #ended = false;
  #failure: OpenCodeZenTransportError | undefined;
  #pending:
    | ((result: Result<Uint8Array | null, OpenCodeZenTransportError>) => void)
    | undefined;
  #queued: Uint8Array | undefined;

  constructor(response: HttpsResponse, statusCode: number) {
    this.#response = response;
    this.statusCode = statusCode;
    this.contentType = contentType(response);
    response.on("aborted", this.#onAborted);
    response.on("data", this.#onData);
    response.on("end", this.#onEnd);
    response.on("error", this.#onError);
    response.pause();
  }

  read(): Promise<Result<Uint8Array | null, OpenCodeZenTransportError>> {
    if (this.#closed) {
      return Promise.resolve(err(failure("closed")));
    }
    if (this.#pending !== undefined) {
      return Promise.resolve(err(failure("concurrentRead")));
    }
    if (this.#failure !== undefined) {
      return Promise.resolve(err(this.#failure));
    }
    if (this.#queued !== undefined) {
      const chunk = this.#queued;
      this.#queued = undefined;
      return Promise.resolve(ok(chunk));
    }
    if (this.#ended) {
      return Promise.resolve(ok(null));
    }
    const operation = new Promise<Result<Uint8Array | null, OpenCodeZenTransportError>>(
      (resolve) => {
        this.#pending = resolve;
      },
    );
    this.#response.resume();
    return operation;
  }

  close(): Promise<Result<void, OpenCodeZenTransportError>> {
    if (this.#closed) {
      return Promise.resolve(ok(undefined));
    }
    this.#closed = true;
    this.#detach();
    const pending = this.#pending;
    this.#pending = undefined;
    this.#queued = undefined;
    pending?.(err(failure("closed")));
    try {
      this.#response.destroy();
      return Promise.resolve(ok(undefined));
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("connection")));
    }
  }

  timeout(): void {
    this.#fail("timeout");
  }

  readonly #onAborted = (): void => {
    this.#fail("connection");
  };

  readonly #onData = (chunk: Uint8Array): void => {
    this.#response.pause();
    if (
      !(chunk instanceof Uint8Array) ||
      chunk.length === 0 ||
      chunk.length > OPENCODE_ZEN_TRANSPORT_LIMITS.responseChunkBytes
    ) {
      this.#fail("limit");
      return;
    }
    const owned = Uint8Array.from(chunk);
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(ok(owned));
      return;
    }
    if (this.#queued !== undefined) {
      this.#fail("limit");
      return;
    }
    this.#queued = owned;
  };

  readonly #onEnd = (): void => {
    this.#ended = true;
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(ok(null));
    }
  };

  readonly #onError = (_cause: unknown): void => {
    this.#fail("connection");
  };

  #fail(kind: OpenCodeZenTransportErrorKind): void {
    if (this.#closed || this.#failure !== undefined) {
      return;
    }
    this.#response.pause();
    this.#failure = failure(kind);
    this.#queued = undefined;
    this.#detach();
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(err(this.#failure));
    }
    try {
      this.#response.destroy();
    } catch (_cause: unknown) {
      // The original typed failure remains authoritative.
    }
  }

  #detach(): void {
    this.#response.off("aborted", this.#onAborted);
    this.#response.off("data", this.#onData);
    this.#response.off("end", this.#onEnd);
    this.#response.off("error", this.#onError);
  }
}

function exactOptions(credential: string): RequestOptions {
  return Object.freeze({
    agent: false as const,
    headers: Object.freeze({
      accept: "text/event-stream",
      authorization: "Bearer " + credential,
      "content-type": "application/json",
      "user-agent": "agent/0.1.0",
    }),
    hostname: "opencode.ai",
    maxHeaderSize: OPENCODE_ZEN_TRANSPORT_LIMITS.headerBytes,
    method: "POST" as const,
    path: OPENCODE_ZEN_CHAT_PATH,
    port: 443 as const,
    protocol: "https:" as const,
  });
}

/** Exact Node HTTPS boundary for the admitted OpenCode Zen origin. */
export class NodeOpenCodeZenTransport implements OpenCodeZenTransport {
  readonly #credential: string;
  readonly #requestHttps: RequestHttps;

  private constructor(credential: string, requestHttps: RequestHttps) {
    this.#credential = credential;
    this.#requestHttps = requestHttps;
  }

  static create(
    credential: unknown,
    client: HttpsClient = NODE_HTTPS_CLIENT,
  ): Result<NodeOpenCodeZenTransport, NodeOpenCodeZenTransportCreateError> {
    try {
      if (!isValidOpenCodeZenCredential(credential) || client === null || typeof client !== "object") {
        return err(Object.freeze({ kind: "invalidConfiguration" as const }));
      }
      const requestHttps = client.request;
      if (typeof requestHttps !== "function") {
        return err(Object.freeze({ kind: "invalidConfiguration" as const }));
      }
      return ok(
        new NodeOpenCodeZenTransport(
          credential,
          requestHttps.bind(client) as RequestHttps,
        ),
      );
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidConfiguration" as const }));
    }
  }

  open(
    request: OpenCodeZenTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenCodeZenTransportStream, OpenCodeZenTransportError>> {
    let body: string;
    let cancellationRequested: boolean;
    let whenCancellationRequested: () => Promise<void>;
    try {
      body = request.body;
      cancellationRequested = cancellation.requested;
      const whenRequested = cancellation.whenRequested;
      if (
        typeof body !== "string" ||
        body.length < 1 ||
        body.length > OPENCODE_ZEN_LIMITS.requestCodeUnits ||
        typeof cancellationRequested !== "boolean" ||
        typeof whenRequested !== "function"
      ) {
        return Promise.resolve(err(failure("protocol")));
      }
      whenCancellationRequested = whenRequested.bind(cancellation) as () => Promise<void>;
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("protocol")));
    }
    if (cancellationRequested) {
      return Promise.resolve(err(failure("cancelled")));
    }
    let settled = false;
    let activeRequest: HttpsRequest | undefined;
    let activeStream: NodeOpenCodeZenStream | undefined;
    const operation = new Promise<
      Result<OpenCodeZenTransportStream, OpenCodeZenTransportError>
    >((resolve) => {
      const settle = (
        result: Result<OpenCodeZenTransportStream, OpenCodeZenTransportError>,
      ): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      const onError = (_cause: unknown): void => {
        settle(err(failure("connection")));
      };
      try {
        activeRequest = this.#requestHttps(exactOptions(this.#credential), (response) => {
          if (settled) {
            try {
              response.destroy();
            } catch (_cause: unknown) {
              return;
            }
            return;
          }
          try {
            const statusCode = response.statusCode;
            if (
              statusCode === undefined ||
              !Number.isSafeInteger(statusCode) ||
              statusCode < 100 ||
              statusCode > 599
            ) {
              settle(err(failure("protocol")));
              response.destroy();
              return;
            }
            activeStream = new NodeOpenCodeZenStream(response, statusCode);
            settle(ok(activeStream));
          } catch (_cause: unknown) {
            settle(err(failure("protocol")));
            try {
              response.destroy();
            } catch (_destroyCause: unknown) {
              return;
            }
          }
        });
        activeRequest.on("error", onError);
        activeRequest.setTimeout(
          OPENCODE_ZEN_TRANSPORT_LIMITS.inactivityMilliseconds,
          () => {
            if (activeStream === undefined) {
              settle(err(failure("timeout")));
            } else {
              activeStream.timeout();
            }
            try {
              activeRequest?.destroy();
            } catch (_cause: unknown) {
              return;
            }
          },
        );
        activeRequest.write(body);
        activeRequest.end();
      } catch (_cause: unknown) {
        settle(err(failure("connection")));
        try {
          activeRequest?.destroy();
        } catch (_destroyCause: unknown) {
          return;
        }
      }
      let requested: Promise<void>;
      try {
        requested = Promise.resolve(whenCancellationRequested());
      } catch (_cause: unknown) {
        settle(err(failure("protocol")));
        return;
      }
      void requested.then(
        () => {
          if (settled) {
            return;
          }
          settle(err(failure("cancelled")));
          try {
            activeRequest?.destroy();
          } catch (_cause: unknown) {
            return;
          }
        },
        () => {
          settle(err(failure("protocol")));
        },
      );
    });
    return operation;
  }
}
