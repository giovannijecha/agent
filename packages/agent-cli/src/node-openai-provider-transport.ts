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

function snapshotChunk(value: unknown): Uint8Array | undefined {
  try {
    if (!(value instanceof Uint8Array)) return undefined;
    const length = value.length;
    if (!Number.isSafeInteger(length) || length < 1 ||
      length > OPENAI_PROVIDER_TRANSPORT_LIMITS.responseChunkBytes) return undefined;
    const snapshot = new Uint8Array(length);
    snapshot.set(value);
    return snapshot;
  } catch (_cause: unknown) {
    return undefined;
  }
}

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

function failure(
  kind: OpenAITransportErrorKind,
  cleanupFailed = false,
): OpenAITransportError {
  return Object.freeze({ cleanupFailed, kind });
}

function visibleAscii(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    /^[\x21-\x7E]+$/u.test(value);
}

type ContentTypeSnapshot = Readonly<{
  value: string | undefined;
}>;

function contentType(response: HttpsResponse): ContentTypeSnapshot | undefined {
  const value = response.headers["content-type"];
  if (value === undefined) return Object.freeze({ value: undefined });
  if (typeof value === "string") return Object.freeze({ value });
  if (Array.isArray(value) && value.length === 1) {
    const member = value.at(0);
    if (typeof member === "string") return Object.freeze({ value: member });
  }
  return undefined;
}

type ResponseMetadata = Readonly<{
  contentType: string | undefined;
  statusCode: number;
}>;

type NodeOpenAIStreamAdmissionError = Readonly<{
  cleanupFailed: boolean;
}>;

function snapshotResponseMetadata(
  response: HttpsResponse,
  current: () => boolean,
): ResponseMetadata | undefined {
  const statusCode = response.statusCode;
  if (!current()) return undefined;
  if (statusCode === undefined || !Number.isSafeInteger(statusCode) ||
    statusCode < 100 || statusCode > 599) return undefined;
  const contentTypeSnapshot = contentType(response);
  if (!current()) return undefined;
  if (contentTypeSnapshot === undefined) return undefined;
  return Object.freeze({ contentType: contentTypeSnapshot.value, statusCode });
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
  readonly #destroyRequest: () => boolean;
  readonly #onTerminal: () => void;
  readonly #response: HttpsResponse;
  readonly statusCode: number;
  #closed = false;
  #ended = false;
  #failure: OpenAITransportError | undefined;
  #pending: ((result: Result<Uint8Array | null, OpenAITransportError>) => void) | undefined;
  #queued: Uint8Array | undefined;
  #responseCleanupFailed = false;
  #responseDestroyed = false;
  #terminalSettled = false;

  private constructor(
    response: HttpsResponse,
    statusCode: number,
    responseContentType: string | undefined,
    onTerminal: () => void,
    destroyRequest: () => boolean,
  ) {
    this.#response = response;
    this.statusCode = statusCode;
    this.contentType = responseContentType;
    this.#onTerminal = onTerminal;
    this.#destroyRequest = destroyRequest;
  }

  static create(
    response: HttpsResponse,
    statusCode: number,
    responseContentType: string | undefined,
    onTerminal: () => void,
    destroyRequest: () => boolean,
  ): NodeOpenAIStream {
    return new NodeOpenAIStream(
      response,
      statusCode,
      responseContentType,
      onTerminal,
      destroyRequest,
    );
  }

  admit(): Result<void, NodeOpenAIStreamAdmissionError> {
    const response = this.#response;
    try {
      response.on("aborted", this.#onAborted);
      if (this.#admissionTerminated()) {
        return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
      }
      response.on("data", this.#onData);
      if (this.#admissionTerminated()) {
        return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
      }
      response.on("end", this.#onEnd);
      if (this.#admissionTerminated()) {
        return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
      }
      response.on("error", this.#onError);
      if (this.#admissionTerminated()) {
        return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
      }
      response.pause();
      if (this.#admissionTerminated()) {
        return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
      }
      return ok(undefined);
    } catch (_cause: unknown) {
      return err(Object.freeze({ cleanupFailed: this.#rejectAdmission() }));
    }
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
    if (this.#ended) {
      return Promise.resolve().then(() => this.#completeEnd());
    }
    const operation = new Promise<Result<Uint8Array | null, OpenAITransportError>>(
      (resolve) => { this.#pending = resolve; },
    );
    try {
      this.#response.resume();
    } catch (_cause: unknown) {
      this.#fail("connection");
    }
    return operation;
  }

  close(): Promise<Result<void, OpenAITransportError>> {
    if (this.#closed) return Promise.resolve(ok(undefined));
    this.#closed = true;
    const detachCleanupFailed = this.#detach();
    this.#settleTerminal();
    const pending = this.#pending;
    this.#pending = undefined;
    this.#queued = undefined;
    pending?.(err(failure("closed")));
    return Promise.resolve((this.#destroyTransport() || detachCleanupFailed)
      ? err(failure("connection", true))
      : ok(undefined));
  }

  cancel(earlierCleanupFailed = false): void {
    this.#fail("cancelled", earlierCleanupFailed);
  }

  connection(earlierCleanupFailed = false): void {
    this.#fail("connection", earlierCleanupFailed);
  }

  protocol(earlierCleanupFailed = false): void {
    this.#fail("protocol", earlierCleanupFailed);
  }

  timeout(earlierCleanupFailed = false): void {
    this.#fail("timeout", earlierCleanupFailed);
  }

  readonly #onAborted = (): void => this.#fail("connection");
  readonly #onError = (_cause: unknown): void => this.#fail("connection");

  readonly #onData = (chunk: Uint8Array): void => {
    try {
      this.#response.pause();
    } catch (_cause: unknown) {
      this.#fail("connection");
      return;
    }
    const owned = snapshotChunk(chunk);
    if (owned === undefined) {
      this.#fail("limit");
      return;
    }
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
    const detachCleanupFailed = this.#detach();
    if (detachCleanupFailed) {
      this.#fail("connection", true);
      return;
    }
    this.#ended = true;
    void Promise.resolve().then(() => {
      const pending = this.#pending;
      if (pending === undefined) return;
      this.#pending = undefined;
      pending(this.#completeEnd());
    });
  };

  #completeEnd(): Result<Uint8Array | null, OpenAITransportError> {
    if (this.#failure !== undefined) return err(this.#failure);
    if (this.#closed) return err(failure("closed"));
    this.#settleTerminal();
    return ok(null);
  }

  #admissionTerminated(): boolean {
    return this.#closed || this.#ended || this.#failure !== undefined ||
      this.#terminalSettled;
  }

  #rejectAdmission(): boolean {
    const earlierCleanupFailed = this.#failure?.cleanupFailed ?? false;
    this.#closed = true;
    this.#queued = undefined;
    this.#pending = undefined;
    const detachCleanupFailed = this.#detach();
    this.#settleTerminal();
    const transportCleanupFailed = this.#destroyTransport();
    return earlierCleanupFailed || detachCleanupFailed || transportCleanupFailed;
  }

  #fail(kind: OpenAITransportErrorKind, earlierCleanupFailed = false): void {
    if (this.#closed || this.#terminalSettled || this.#failure !== undefined) return;
    try { this.#response.pause(); } catch (_cause: unknown) { /* destruction follows */ }
    this.#queued = undefined;
    const detachCleanupFailed = this.#detach();
    this.#settleTerminal();
    const cleanupFailed = this.#destroyTransport() || detachCleanupFailed || earlierCleanupFailed;
    this.#failure = failure(kind, cleanupFailed);
    const pending = this.#pending;
    if (pending !== undefined) {
      this.#pending = undefined;
      pending(err(this.#failure));
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

  #destroyTransport(): boolean {
    const requestCleanupFailed = this.#destroyRequest();
    if (!this.#responseDestroyed) {
      this.#responseDestroyed = true;
      try {
        this.#response.destroy();
      } catch (_cause: unknown) {
        this.#responseCleanupFailed = true;
      }
    }
    return requestCleanupFailed || this.#responseCleanupFailed;
  }

  #detach(): boolean {
    let cleanupFailed = false;
    try { this.#response.off("aborted", this.#onAborted); }
    catch (_cause: unknown) { cleanupFailed = true; }
    try { this.#response.off("data", this.#onData); }
    catch (_cause: unknown) { cleanupFailed = true; }
    try { this.#response.off("end", this.#onEnd); }
    catch (_cause: unknown) { cleanupFailed = true; }
    try { this.#response.off("error", this.#onError); }
    catch (_cause: unknown) { cleanupFailed = true; }
    return cleanupFailed;
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
      const access = candidate.accessToken;
      const account = candidate.accountId;
      if (!visibleAscii(access, OPENAI_PROVIDER_TRANSPORT_LIMITS.accessBytes) ||
        !visibleAscii(account, OPENAI_PROVIDER_TRANSPORT_LIMITS.accountBytes) ||
        client === null || typeof client !== "object" || typeof client.request !== "function" ||
        clock === null || typeof clock !== "object" || typeof clock.schedule !== "function") {
        return err(Object.freeze({ kind: "invalidConfiguration" as const }));
      }
      return ok(new NodeOpenAIProviderTransport(
        Object.freeze({ accessToken: access, accountId: account }),
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
    let terminating = false;
    let activeRequest: HttpsRequest | undefined;
    let activeResponse: HttpsResponse | undefined;
    let activeMetadata: ResponseMetadata | undefined;
    let deadline: ScheduledTimer | undefined;
    let requestPrepared = false;
    let responseClaimed = false;
    let stagedResponse: HttpsResponse | undefined;
    let stagedResponseConflict = false;
    let stagedResponseCleanupFailed = false;
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    return new Promise((resolve) => {
      const cancelDeadline = (): void => {
        const retained = deadline;
        deadline = undefined;
        try { retained?.cancel(); } catch (_cause: unknown) { /* inert */ }
      };
      const detach = (): boolean => {
        let cleanupFailed = false;
        try { activeRequest?.off("error", onRequestError); }
        catch (_cause: unknown) { cleanupFailed = true; }
        try { activeResponse?.off("aborted", onAborted); }
        catch (_cause: unknown) { cleanupFailed = true; }
        try { activeResponse?.off("data", onData); }
        catch (_cause: unknown) { cleanupFailed = true; }
        try { activeResponse?.off("end", onEnd); }
        catch (_cause: unknown) { cleanupFailed = true; }
        try { activeResponse?.off("error", onResponseError); }
        catch (_cause: unknown) { cleanupFailed = true; }
        return cleanupFailed;
      };
      const settle = (result: Result<OpenAICatalogCapture, OpenAITransportError>): void => {
        if (settled) return;
        settled = true;
        cancelDeadline();
        resolve(result);
      };
      const destroyResponse = (response: HttpsResponse): boolean => {
        try {
          response.destroy();
          return false;
        } catch (_cause: unknown) {
          return true;
        }
      };
      const destroy = (): boolean => {
        let cleanupFailed = false;
        const response = activeResponse;
        const staged = stagedResponse;
        activeResponse = undefined;
        stagedResponse = undefined;
        if (response !== undefined && destroyResponse(response)) cleanupFailed = true;
        if (staged !== undefined && staged !== response && destroyResponse(staged)) {
          cleanupFailed = true;
        }
        try { activeRequest?.destroy(); } catch (_cause: unknown) { cleanupFailed = true; }
        activeRequest = undefined;
        return cleanupFailed;
      };
      const fail = (
        kind: OpenAITransportErrorKind,
        earlierCleanupFailed = false,
      ): void => {
        if (settled || terminating) return;
        terminating = true;
        const detachCleanupFailed = detach();
        cancelDeadline();
        const cleanupFailed = destroy() || detachCleanupFailed || earlierCleanupFailed;
        settle(err(failure(kind, cleanupFailed)));
      };
      const onAborted = (): void => fail("connection");
      const onRequestError = (_cause: unknown): void => fail("connection");
      const onResponseError = (_cause: unknown): void => fail("connection");
      const onData = (chunk: Uint8Array): void => {
        const owned = snapshotChunk(chunk);
        if (owned === undefined ||
          bytes + owned.length > OPENAI_PROVIDER_LIMITS.catalogBodyBytes) {
          fail("limit");
          return;
        }
        bytes += owned.length;
        chunks.push(owned);
      };
      const onEnd = (): void => {
        const metadata = activeMetadata;
        if (activeResponse === undefined || metadata === undefined) return fail("protocol");
        const body = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.length;
        }
        const cleanupFailed = detach();
        if (cleanupFailed) return fail("protocol", true);
        settle(ok(Object.freeze({
          body,
          cleanupFailed: false,
          contentType: metadata.contentType,
          statusCode: metadata.statusCode,
        })));
      };
      const acceptResponse = (response: HttpsResponse): void => {
        if (settled) {
          destroyResponse(response);
          return;
        }
        if (responseClaimed) {
          fail("protocol", destroyResponse(response));
          return;
        }
        responseClaimed = true;
        activeResponse = response;
        let metadata: ResponseMetadata | undefined;
        try {
          metadata = snapshotResponseMetadata(
            response,
            () => !settled && !terminating,
          );
        } catch (_cause: unknown) {
          if (!settled && !terminating) fail("protocol");
          return;
        }
        if (settled || terminating) return;
        if (metadata === undefined) return fail("protocol");
        if (metadata.statusCode !== 200 || !validJsonContentType(metadata.contentType)) {
          terminating = true;
          const detachCleanupFailed = detach();
          const cleanupFailed = destroy() || detachCleanupFailed;
          settle(ok(Object.freeze({
            body: new Uint8Array(),
            cleanupFailed,
            contentType: metadata.contentType,
            statusCode: metadata.statusCode,
          })));
          return;
        }
        activeMetadata = metadata;
        try {
          response.on("aborted", onAborted);
          if (settled || terminating) return;
          response.on("error", onResponseError);
          if (settled || terminating) return;
          response.on("data", onData);
          if (settled || terminating) return;
          response.on("end", onEnd);
          if (settled || terminating) return;
          response.resume();
        } catch (_cause: unknown) {
          fail("protocol");
        }
      };
      const receiveResponse = (response: HttpsResponse): void => {
        if (requestPrepared) {
          acceptResponse(response);
          return;
        }
        if (stagedResponse === undefined) {
          stagedResponse = response;
          return;
        }
        stagedResponseConflict = true;
        if (destroyResponse(response)) stagedResponseCleanupFailed = true;
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
        const request = this.#requestHttps(
          catalogOptions(this.#credential),
          receiveResponse,
        );
        activeRequest = request;
        if (stagedResponseConflict) {
          fail("protocol", stagedResponseCleanupFailed);
        } else {
          request.on("error", onRequestError);
          if (!terminating) {
            request.setTimeout(
              OPENAI_PROVIDER_TRANSPORT_LIMITS.catalogInactivityMilliseconds,
              () => fail("timeout"),
            );
          }
          if (!terminating) request.end();
          if (!terminating) {
            requestPrepared = true;
            const response = stagedResponse;
            stagedResponse = undefined;
            if (response !== undefined) acceptResponse(response);
          }
        }
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
    let requestCleanupFailed = false;
    let requestDestroyed = false;
    let requestPrepared = false;
    let claimedResponse: HttpsResponse | undefined;
    let responseClaimed = false;
    let responseConflictCleanupFailed = false;
    let stagedResponse: HttpsResponse | undefined;
    let stagedResponseConflict = false;
    let stagedResponseCleanupFailed = false;
    let terminating = false;
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
      const destroyRequest = (): boolean => {
        if (requestDestroyed) return requestCleanupFailed;
        requestDestroyed = true;
        const request = activeRequest;
        activeRequest = undefined;
        try {
          request?.destroy();
        } catch (_cause: unknown) {
          requestCleanupFailed = true;
        }
        return requestCleanupFailed;
      };
      const terminate = (kind: OpenAITransportErrorKind): void => {
        if (lifecycleSettled || terminating) return;
        terminating = true;
        const response = stagedResponse;
        stagedResponse = undefined;
        let cleanupFailed = destroyRequest();
        if (response !== undefined && destroyResponse(response)) cleanupFailed = true;
        if (activeStream === undefined) settle(err(failure(kind, cleanupFailed)));
        else if (kind === "cancelled") activeStream.cancel(cleanupFailed);
        else if (kind === "timeout") activeStream.timeout(cleanupFailed);
        else if (kind === "connection") activeStream.connection(cleanupFailed);
        else activeStream.protocol(cleanupFailed);
      };
      const destroyResponse = (response: HttpsResponse): boolean => {
        try {
          response.destroy();
          return false;
        } catch (_cause: unknown) {
          return true;
        }
      };
      const rejectResponse = (
        response: HttpsResponse,
        kind: OpenAITransportErrorKind,
        earlierCleanupFailed = false,
      ): void => {
        terminating = true;
        if (claimedResponse === response) claimedResponse = undefined;
        let cleanupFailed = destroyRequest() || earlierCleanupFailed;
        if (destroyResponse(response)) cleanupFailed = true;
        settle(err(failure(kind, cleanupFailed)));
      };
      const rejectResponseConflict = (response: HttpsResponse): void => {
        terminating = true;
        let cleanupFailed = destroyResponse(response);
        const stream = activeStream;
        if (stream !== undefined) {
          stream.protocol(cleanupFailed);
          return;
        }
        const claimed = claimedResponse;
        claimedResponse = undefined;
        if (claimed !== undefined && claimed !== response && destroyResponse(claimed)) {
          cleanupFailed = true;
        }
        if (destroyRequest()) cleanupFailed = true;
        responseConflictCleanupFailed = cleanupFailed;
      };
      const acceptResponse = (response: HttpsResponse): void => {
        if (settled) {
          const cleanupFailed = destroyResponse(response);
          if (activeStream !== undefined && !lifecycleSettled) {
            activeStream.protocol(cleanupFailed);
          }
          return;
        }
        if (responseClaimed) {
          rejectResponseConflict(response);
          return;
        }
        responseClaimed = true;
        claimedResponse = response;
        let metadata: ResponseMetadata | undefined;
        try {
          metadata = snapshotResponseMetadata(
            response,
            () => !settled && !terminating,
          );
        } catch (_cause: unknown) {
          if (terminating) {
            settle(err(failure("protocol", responseConflictCleanupFailed)));
            return;
          }
          rejectResponse(response, "protocol");
          return;
        }
        if (terminating) {
          settle(err(failure("protocol", responseConflictCleanupFailed)));
          return;
        }
        if (metadata === undefined) return rejectResponse(response, "protocol");
        const stream = NodeOpenAIStream.create(
          response,
          metadata.statusCode,
          metadata.contentType,
          settleLifecycle,
          destroyRequest,
        );
        activeStream = stream;
        claimedResponse = undefined;
        const admission = stream.admit();
        if (!admission.ok) {
          terminating = true;
          settle(err(failure("protocol", admission.error.cleanupFailed)));
          return;
        }
        settle(ok(stream));
      };
      const receiveResponse = (response: HttpsResponse): void => {
        if (requestPrepared) {
          acceptResponse(response);
          return;
        }
        if (stagedResponse === undefined) {
          stagedResponse = response;
          return;
        }
        stagedResponseConflict = true;
        if (destroyResponse(response)) stagedResponseCleanupFailed = true;
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
        const request = this.#requestHttps(
          responsesOptions(this.#credential),
          receiveResponse,
        );
        activeRequest = request;
        if (stagedResponseConflict) {
          const response = stagedResponse;
          stagedResponse = undefined;
          if (response === undefined) terminate("protocol");
          else rejectResponse(response, "protocol", stagedResponseCleanupFailed);
        } else {
          request.on("error", (_cause: unknown) => terminate("connection"));
          if (!terminating) {
            request.setTimeout(
              OPENAI_PROVIDER_TRANSPORT_LIMITS.responseInactivityMilliseconds,
              () => terminate("timeout"),
            );
          }
          if (!terminating) request.write(body);
          if (!terminating) request.end();
          if (!terminating) {
            requestPrepared = true;
            const response = stagedResponse;
            stagedResponse = undefined;
            if (response !== undefined) acceptResponse(response);
          }
        }
      } catch (_cause: unknown) {
        const response = stagedResponse;
        stagedResponse = undefined;
        if (response === undefined) terminate("connection");
        else rejectResponse(response, "connection", stagedResponseCleanupFailed);
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
