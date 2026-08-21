import {
  request as nodeHttpsRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:https";

import { err, ok, type Result } from "@agent/core";
import {
  OPENAI_PROVIDER_LIMITS,
  type OpenAICatalogCapture,
  type OpenAIProviderTransport,
  type OpenAITransportError,
  type OpenAITransportErrorKind,
  type OpenAITransportRequest,
  type OpenAITransportStream,
} from "@agent/provider-openai-subscription";
import type { CancellationSignal } from "@agent/runtime";

import { NodeTimerClock } from "./node-timer-clock.js";
import type { ScheduledTimer, TimerClock } from "./timer-clock.js";

export const OPENAI_PROVIDER_ORIGIN = "https://chatgpt.com";
export const OPENAI_CATALOG_PATH =
  "/backend-api/codex/models?client_version=0.1.0";
export const OPENAI_RESPONSES_PATH = "/backend-api/codex/responses";
export const OPENAI_PROVIDER_TRANSPORT_LIMITS = Object.freeze({
  accountBytes: 256,
  catalogDeadlineMilliseconds: 30_000,
  catalogInactivityMilliseconds: 30_000,
  headerBytes: 16_384,
  responseChunkBytes: 65_536,
  responseDeadlineMilliseconds: 600_000,
  responseInactivityMilliseconds: 120_000,
  accessBytes: 32_768,
});

export type OpenAIRequestIdentity = Readonly<{
  accessToken: string;
  accountId: string;
}>;

export type NodeOpenAIProviderTransportCreateError = Readonly<{
  kind: "invalidConfiguration";
}>;

type HttpsResponse = IncomingMessage;
type HttpsRequest = ClientRequest;
type RequestHttps = HttpsClient["request"];

export interface HttpsClient {
  request(
    options: RequestOptions,
    onResponse: (response: HttpsResponse) => void,
  ): HttpsRequest;
}

const NODE_HTTPS_CLIENT: HttpsClient = Object.freeze({ request: nodeHttpsRequest });

function failure(kind: OpenAITransportErrorKind): OpenAITransportError {
  return Object.freeze({ kind });
}

function visibleAscii(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    /^[\x21-\x7E]+$/u.test(value);
}

function contentType(response: HttpsResponse): string | undefined {
  const value = response.headers["content-type"];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1) return value.at(0);
  return undefined;
}

function validJsonContentType(value: string | undefined): boolean {
  return value !== undefined &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(value);
}

function catalogOptions(credential: OpenAIRequestIdentity): RequestOptions {
  return Object.freeze({
    agent: false as const,
    headers: Object.freeze({
      accept: "application/json",
      authorization: "Bearer " + credential.accessToken,
      "chatgpt-account-id": credential.accountId,
      originator: "agent",
      "user-agent": "agent/0.1.0",
    }),
    hostname: "chatgpt.com",
    maxHeaderSize: OPENAI_PROVIDER_TRANSPORT_LIMITS.headerBytes,
    method: "GET" as const,
    path: OPENAI_CATALOG_PATH,
    port: 443 as const,
    protocol: "https:" as const,
  });
}

function responsesOptions(credential: OpenAIRequestIdentity): RequestOptions {
  return Object.freeze({
    agent: false as const,
    headers: Object.freeze({
      accept: "text/event-stream",
      authorization: "Bearer " + credential.accessToken,
      "chatgpt-account-id": credential.accountId,
      "content-type": "application/json",
      originator: "agent",
      "user-agent": "agent/0.1.0",
    }),
    hostname: "chatgpt.com",
    maxHeaderSize: OPENAI_PROVIDER_TRANSPORT_LIMITS.headerBytes,
    method: "POST" as const,
    path: OPENAI_RESPONSES_PATH,
    port: 443 as const,
    protocol: "https:" as const,
  });
}

class NodeOpenAIStream implements OpenAITransportStream {
  readonly contentType: string | undefined;
  readonly #onTerminal: () => void;
  readonly #response: HttpsResponse;
  readonly statusCode: number;
  #closed = false;
  #ended = false;
  #failure: OpenAITransportError | undefined;
  #pending: ((result: Result<Uint8Array | null, OpenAITransportError>) => void) | undefined;
  #queued: Uint8Array | undefined;
  #terminalSettled = false;

  constructor(response: HttpsResponse, statusCode: number, onTerminal: () => void) {
    this.#response = response;
    this.statusCode = statusCode;
    this.contentType = contentType(response);
    this.#onTerminal = onTerminal;
    response.on("aborted", this.#onAborted);
    response.on("data", this.#onData);
    response.on("end", this.#onEnd);
    response.on("error", this.#onError);
    response.pause();
  }

  read(): Promise<Result<Uint8Array | null, OpenAITransportError>> {
    if (this.#closed) return Promise.resolve(err(failure("closed")));
    if (this.#pending !== undefined) return Promise.resolve(err(failure("concurrentRead")));
    if (this.#failure !== undefined) return Promise.resolve(err(this.#failure));
    if (this.#queued !== undefined) {
      const chunk = this.#queued;
      this.#queued = undefined;
      return Promise.resolve(ok(chunk));
    }
    if (this.#ended) return Promise.resolve(ok(null));
    const operation = new Promise<Result<Uint8Array | null, OpenAITransportError>>(
      (resolve) => { this.#pending = resolve; },
    );
    this.#response.resume();
    return operation;
  }

  close(): Promise<Result<void, OpenAITransportError>> {
    if (this.#closed) return Promise.resolve(ok(undefined));
    this.#closed = true;
    this.#detach();
    this.#settleTerminal();
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

  cancel(): void {
    this.#fail("cancelled");
  }

  connection(): void {
    this.#fail("connection");
  }

  protocol(): void {
    this.#fail("protocol");
  }

  timeout(): void {
    this.#fail("timeout");
  }

  readonly #onAborted = (): void => this.#fail("connection");
  readonly #onError = (_cause: unknown): void => this.#fail("connection");

  readonly #onData = (chunk: Uint8Array): void => {
    this.#response.pause();
    if (!(chunk instanceof Uint8Array) || chunk.length < 1 ||
      chunk.length > OPENAI_PROVIDER_TRANSPORT_LIMITS.responseChunkBytes) {
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
    if (this.#closed || this.#ended || this.#failure !== undefined) return;
    this.#ended = true;
    this.#detach();
    this.#settleTerminal();
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(ok(null));
    }
  };

  #fail(kind: OpenAITransportErrorKind): void {
    if (this.#closed || this.#ended || this.#failure !== undefined) return;
    this.#response.pause();
    this.#failure = failure(kind);
    this.#queued = undefined;
    this.#detach();
    this.#settleTerminal();
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(err(this.#failure));
    }
    try {
      this.#response.destroy();
    } catch (_cause: unknown) {
      // The typed terminal failure remains authoritative.
    }
  }

  #settleTerminal(): void {
    if (this.#terminalSettled) return;
    this.#terminalSettled = true;
    try {
      this.#onTerminal();
    } catch (_cause: unknown) {
      // Terminal ownership was already released.
    }
  }

  #detach(): void {
    this.#response.off("aborted", this.#onAborted);
    this.#response.off("data", this.#onData);
    this.#response.off("end", this.#onEnd);
    this.#response.off("error", this.#onError);
  }
}

/** Exact-origin HTTPS transport installed but deliberately not composed. */
export class NodeOpenAIProviderTransport implements OpenAIProviderTransport {
  readonly #credential: OpenAIRequestIdentity;
  readonly #requestHttps: RequestHttps;
  readonly #schedule: TimerClock["schedule"];

  private constructor(
    credential: OpenAIRequestIdentity,
    requestHttps: RequestHttps,
    schedule: TimerClock["schedule"],
  ) {
    this.#credential = credential;
    this.#requestHttps = requestHttps;
    this.#schedule = schedule;
  }

  static create(
    credential: unknown,
    client: HttpsClient = NODE_HTTPS_CLIENT,
    clock: TimerClock = new NodeTimerClock(),
  ): Result<NodeOpenAIProviderTransport, NodeOpenAIProviderTransportCreateError> {
    try {
      if (credential === null || typeof credential !== "object" ||
        Object.keys(credential).sort().join(",") !== "accessToken,accountId") {
        return err(Object.freeze({ kind: "invalidConfiguration" as const }));
      }
      const candidate = credential as Readonly<{ accessToken?: unknown; accountId?: unknown }>;
      if (!visibleAscii(candidate.accessToken, OPENAI_PROVIDER_TRANSPORT_LIMITS.accessBytes) ||
        !visibleAscii(candidate.accountId, OPENAI_PROVIDER_TRANSPORT_LIMITS.accountBytes) ||
        client === null || typeof client !== "object" || typeof client.request !== "function" ||
        clock === null || typeof clock !== "object" || typeof clock.schedule !== "function") {
        return err(Object.freeze({ kind: "invalidConfiguration" as const }));
      }
      return ok(new NodeOpenAIProviderTransport(
        Object.freeze({ accessToken: candidate.accessToken, accountId: candidate.accountId }),
        client.request.bind(client) as RequestHttps,
        clock.schedule.bind(clock) as TimerClock["schedule"],
      ));
    } catch (_cause: unknown) {
      return err(Object.freeze({ kind: "invalidConfiguration" as const }));
    }
  }

  catalog(
    cancellation: CancellationSignal,
  ): Promise<Result<OpenAICatalogCapture, OpenAITransportError>> {
    return this.#captureCatalog(cancellation);
  }

  open(
    request: OpenAITransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenAITransportStream, OpenAITransportError>> {
    let body: string;
    let requested: boolean;
    let whenRequested: () => Promise<void>;
    try {
      body = request.body;
      requested = cancellation.requested;
      if (typeof body !== "string" || body.length < 1 ||
        body.length > OPENAI_PROVIDER_LIMITS.requestCodeUnits ||
        typeof requested !== "boolean" || typeof cancellation.whenRequested !== "function") {
        return Promise.resolve(err(failure("protocol")));
      }
      whenRequested = cancellation.whenRequested.bind(cancellation) as () => Promise<void>;
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("protocol")));
    }
    if (requested) return Promise.resolve(err(failure("cancelled")));
    return this.#openResponses(body, whenRequested);
  }

  #captureCatalog(
    cancellation: CancellationSignal,
  ): Promise<Result<OpenAICatalogCapture, OpenAITransportError>> {
    let requested: boolean;
    let whenRequested: () => Promise<void>;
    try {
      requested = cancellation.requested;
      if (typeof requested !== "boolean" || typeof cancellation.whenRequested !== "function") {
        return Promise.resolve(err(failure("protocol")));
      }
      whenRequested = cancellation.whenRequested.bind(cancellation) as () => Promise<void>;
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("protocol")));
    }
    if (requested) return Promise.resolve(err(failure("cancelled")));
    let settled = false;
    let activeRequest: HttpsRequest | undefined;
    let activeResponse: HttpsResponse | undefined;
    let deadline: ScheduledTimer | undefined;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    return new Promise((resolve) => {
      const cancelDeadline = (): void => {
        const retained = deadline;
        deadline = undefined;
        try { retained?.cancel(); } catch (_cause: unknown) { /* inert */ }
      };
      const detach = (): void => {
        activeRequest?.off("error", onRequestError);
        activeResponse?.off("aborted", onAborted);
        activeResponse?.off("data", onData);
        activeResponse?.off("end", onEnd);
        activeResponse?.off("error", onResponseError);
      };
      const settle = (result: Result<OpenAICatalogCapture, OpenAITransportError>): void => {
        if (settled) return;
        settled = true;
        detach();
        cancelDeadline();
        resolve(result);
      };
      const destroy = (): void => {
        try { activeResponse?.destroy(); } catch (_cause: unknown) { activeResponse = undefined; }
        try { activeRequest?.destroy(); } catch (_cause: unknown) { activeRequest = undefined; }
      };
      const fail = (kind: OpenAITransportErrorKind): void => {
        if (settled) return;
        settle(err(failure(kind)));
        destroy();
      };
      const onAborted = (): void => fail("connection");
      const onRequestError = (_cause: unknown): void => fail("connection");
      const onResponseError = (_cause: unknown): void => fail("connection");
      const onData = (chunk: Uint8Array): void => {
        if (!(chunk instanceof Uint8Array) || chunk.length < 1 ||
          chunk.length > OPENAI_PROVIDER_TRANSPORT_LIMITS.responseChunkBytes ||
          bytes + chunk.length > OPENAI_PROVIDER_LIMITS.catalogBodyBytes) {
          fail("limit");
          return;
        }
        bytes += chunk.length;
        chunks.push(Uint8Array.from(chunk));
      };
      const onEnd = (): void => {
        if (activeResponse === undefined) return fail("protocol");
        const statusCode = activeResponse.statusCode;
        if (statusCode === undefined || !Number.isSafeInteger(statusCode) ||
          statusCode < 100 || statusCode > 599) return fail("protocol");
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.length;
        }
        settle(ok(Object.freeze({ body, contentType: contentType(activeResponse), statusCode })));
      };
      let registration: ScheduledTimer;
      let arming = true;
      let firedSynchronously = false;
      try {
        registration = this.#schedule(
          OPENAI_PROVIDER_TRANSPORT_LIMITS.catalogDeadlineMilliseconds,
          () => {
            if (arming) { firedSynchronously = true; return; }
            if (settled || deadline !== registration) return;
            deadline = undefined;
            fail("timeout");
          },
        );
      } catch (_cause: unknown) {
        fail("timeout");
        return;
      } finally {
        arming = false;
      }
      if (firedSynchronously) {
        try { registration.cancel(); } catch (_cause: unknown) { /* inert */ }
        fail("timeout");
        return;
      }
      deadline = registration;
      try {
        activeRequest = this.#requestHttps(catalogOptions(this.#credential), (response) => {
          if (settled) { response.destroy(); return; }
          activeResponse = response;
          const statusCode = response.statusCode;
          if (statusCode === undefined || !Number.isSafeInteger(statusCode) ||
            statusCode < 100 || statusCode > 599) return fail("protocol");
          response.on("aborted", onAborted);
          response.on("error", onResponseError);
          if (statusCode !== 200 || !validJsonContentType(contentType(response))) {
            settle(ok(Object.freeze({
              body: new Uint8Array(),
              contentType: contentType(response),
              statusCode,
            })));
            response.destroy();
            return;
          }
          response.on("data", onData);
          response.on("end", onEnd);
          response.resume();
        });
        activeRequest.on("error", onRequestError);
        activeRequest.setTimeout(
          OPENAI_PROVIDER_TRANSPORT_LIMITS.catalogInactivityMilliseconds,
          () => fail("timeout"),
        );
        activeRequest.end();
      } catch (_cause: unknown) {
        fail("connection");
      }
      let cancellationPromise: Promise<void>;
      try { cancellationPromise = Promise.resolve(whenRequested()); }
      catch (_cause: unknown) { fail("protocol"); return; }
      void cancellationPromise.then(
        () => fail("cancelled"),
        () => fail("protocol"),
      );
    });
  }

  #openResponses(
    body: string,
    whenRequested: () => Promise<void>,
  ): Promise<Result<OpenAITransportStream, OpenAITransportError>> {
    let settled = false;
    let lifecycleSettled = false;
    let activeRequest: HttpsRequest | undefined;
    let activeStream: NodeOpenAIStream | undefined;
    let deadline: ScheduledTimer | undefined;
    return new Promise((resolve) => {
      const cancelDeadline = (): void => {
        const retained = deadline;
        deadline = undefined;
        try { retained?.cancel(); } catch (_cause: unknown) { /* inert */ }
      };
      const settleLifecycle = (): void => {
        if (lifecycleSettled) return;
        lifecycleSettled = true;
        cancelDeadline();
      };
      const settle = (result: Result<OpenAITransportStream, OpenAITransportError>): void => {
        if (settled) return;
        settled = true;
        if (!result.ok) settleLifecycle();
        resolve(result);
      };
      const terminate = (kind: OpenAITransportErrorKind): void => {
        if (lifecycleSettled) return;
        if (activeStream === undefined) settle(err(failure(kind)));
        else if (kind === "cancelled") activeStream.cancel();
        else if (kind === "timeout") activeStream.timeout();
        else if (kind === "connection") activeStream.connection();
        else activeStream.protocol();
        try { activeRequest?.destroy(); } catch (_cause: unknown) { /* typed failure wins */ }
      };
      let registration: ScheduledTimer;
      let arming = true;
      let firedSynchronously = false;
      try {
        registration = this.#schedule(
          OPENAI_PROVIDER_TRANSPORT_LIMITS.responseDeadlineMilliseconds,
          () => {
            if (arming) { firedSynchronously = true; return; }
            if (lifecycleSettled || deadline !== registration) return;
            deadline = undefined;
            terminate("timeout");
          },
        );
      } catch (_cause: unknown) {
        settle(err(failure("timeout")));
        return;
      } finally {
        arming = false;
      }
      if (firedSynchronously) {
        try { registration.cancel(); } catch (_cause: unknown) { /* inert */ }
        settle(err(failure("timeout")));
        return;
      }
      deadline = registration;
      try {
        activeRequest = this.#requestHttps(responsesOptions(this.#credential), (response) => {
          if (settled) { response.destroy(); return; }
          const statusCode = response.statusCode;
          if (statusCode === undefined || !Number.isSafeInteger(statusCode) ||
            statusCode < 100 || statusCode > 599) {
            settle(err(failure("protocol")));
            response.destroy();
            return;
          }
          activeStream = new NodeOpenAIStream(response, statusCode, settleLifecycle);
          settle(ok(activeStream));
        });
        activeRequest.on("error", (_cause: unknown) => terminate("connection"));
        activeRequest.setTimeout(
          OPENAI_PROVIDER_TRANSPORT_LIMITS.responseInactivityMilliseconds,
          () => terminate("timeout"),
        );
        activeRequest.write(body);
        activeRequest.end();
      } catch (_cause: unknown) {
        settle(err(failure("connection")));
        try { activeRequest?.destroy(); } catch (_destroyCause: unknown) { /* inert */ }
      }
      let cancellationPromise: Promise<void>;
      try { cancellationPromise = Promise.resolve(whenRequested()); }
      catch (_cause: unknown) { terminate("protocol"); return; }
      void cancellationPromise.then(
        () => terminate("cancelled"),
        () => terminate("protocol"),
      );
    });
  }
}
