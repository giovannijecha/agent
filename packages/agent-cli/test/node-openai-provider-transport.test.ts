import assert from "node:assert/strict";
import test from "node:test";

import type { ClientRequest, IncomingMessage, RequestOptions } from "node:https";

import type { CancellationSignal } from "@agent/runtime";

import {
  type HttpsClient,
  NodeOpenAIProviderTransport,
  OPENAI_CATALOG_PATH,
  OPENAI_PROVIDER_ORIGIN,
  OPENAI_PROVIDER_TRANSPORT_LIMITS,
  OPENAI_RESPONSES_PATH,
} from "../dist/node-openai-provider-transport.js";
import type { ScheduledTimer, TimerClock } from "../dist/timer-clock.js";

type Listener = (() => void) | ((value: unknown) => void);
type RequestFailureMethod = "end" | "on" | "setTimeout" | "write";

class FakeResponse implements IncomingMessage {
  readonly headers: IncomingMessage["headers"];
  readonly statusCode: number | undefined;
  readonly #listeners = new Map<string, Listener[]>();
  destroyed = 0;
  destroyFailure = false;
  pauses = 0;
  synchronousRegistrationHook: ((event: string) => void) | undefined;
  synchronousRegistrationEvent: "aborted" | "end" | "error" | undefined;
  resumes = 0;

  constructor(statusCode = 200, contentType = "application/json") {
    this.statusCode = statusCode;
    this.headers = Object.freeze({ "content-type": contentType });
  }

  destroy(): void {
    this.destroyed += 1;
    if (this.destroyFailure) throw new Error("private response cleanup failure");
  }
  pause(): this { this.pauses += 1; return this; }
  resume(): this { this.resumes += 1; return this; }

  on(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    if (this.synchronousRegistrationEvent === event) {
      this.synchronousRegistrationEvent = undefined;
      listener(new Error("synthetic response registration event"));
    }
    this.synchronousRegistrationHook?.(event);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (listeners !== undefined && index >= 0) listeners.splice(index, 1);
    return this;
  }

  emit(event: string, value?: unknown): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) listener(value);
  }

  listenerCount(): number {
    return [...this.#listeners.values()].reduce(
      (count, listeners) => count + listeners.length,
      0,
    );
  }

  retainedListener(event: string): Listener | undefined {
    return this.#listeners.get(event)?.at(0);
  }
}

class FakeRequest implements ClientRequest {
  readonly #listeners: ((cause: unknown) => void)[] = [];
  readonly #onEnd: () => void;
  destroyed = 0;
  destroyFailure = false;
  ended = 0;
  errorDuringTimeoutSetup = false;
  failureMethod: RequestFailureMethod | undefined;
  timeoutMilliseconds: number | undefined;
  timeoutListener: (() => void) | undefined;
  writes: string[] = [];

  constructor(onEnd: () => void) { this.#onEnd = onEnd; }
  destroy(): void {
    this.destroyed += 1;
    if (this.destroyFailure) throw new Error("private request cleanup failure");
  }
  end(): void {
    this.ended += 1;
    this.#onEnd();
    if (this.failureMethod === "end") throw new Error("private request end failure");
  }
  write(body: string): boolean {
    if (this.failureMethod === "write") throw new Error("private request write failure");
    this.writes.push(body);
    return true;
  }

  on(event: "error", listener: (cause: unknown) => void): this {
    void event;
    if (this.failureMethod === "on") throw new Error("private request wiring failure");
    this.#listeners.push(listener);
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this {
    void event;
    const index = this.#listeners.indexOf(listener);
    if (index >= 0) this.#listeners.splice(index, 1);
    return this;
  }

  setTimeout(milliseconds: number, listener: () => void): this {
    if (this.failureMethod === "setTimeout") {
      throw new Error("private request timeout failure");
    }
    this.timeoutMilliseconds = milliseconds;
    this.timeoutListener = listener;
    if (this.errorDuringTimeoutSetup) this.emitError();
    return this;
  }

  emitError(): void {
    for (const listener of [...this.#listeners]) listener(new Error("synthetic request failure"));
  }
}

class FakeClient implements HttpsClient {
  readonly #responseCallbacks: ((response: IncomingMessage) => void)[] = [];
  readonly responses: FakeResponse[];
  readonly options: RequestOptions[] = [];
  readonly requests: FakeRequest[] = [];
  readonly #pendingResponses: (() => void)[] = [];
  deferResponses = false;
  errorDuringTimeoutSetup = false;
  requestFailureMethod: RequestFailureMethod | undefined;
  respondDuringRequest = false;

  constructor(...responses: FakeResponse[]) { this.responses = [...responses]; }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    const response = this.responses.shift();
    assert.ok(response !== undefined);
    this.options.push(options);
    this.#responseCallbacks.push(onResponse);
    let responded = false;
    const respond = (): void => {
      if (responded) return;
      responded = true;
      onResponse(response);
    };
    const request = new FakeRequest(() => {
      if (this.deferResponses) this.#pendingResponses.push(respond);
      else respond();
    });
    request.errorDuringTimeoutSetup = this.errorDuringTimeoutSetup;
    request.failureMethod = this.requestFailureMethod;
    this.requests.push(request);
    if (this.respondDuringRequest) respond();
    return request;
  }

  flushResponse(): void {
    this.#pendingResponses.shift()?.();
  }

  respondAgain(response: FakeResponse): void {
    const callback = this.#responseCallbacks.at(-1);
    assert.ok(callback !== undefined);
    callback(response);
  }
}

class ManualRegistration implements ScheduledTimer {
  cancelled = false;
  readonly listener: () => void;
  constructor(listener: () => void) { this.listener = listener; }
  cancel(): void { this.cancelled = true; }
  fire(): void { this.listener(); }
}

class ManualClock implements TimerClock {
  readonly delays: number[] = [];
  readonly registrations: ManualRegistration[] = [];
  schedule(delayMilliseconds: number, listener: () => void): ScheduledTimer {
    this.delays.push(delayMilliseconds);
    const registration = new ManualRegistration(listener);
    this.registrations.push(registration);
    return registration;
  }
}

class Cancellation implements CancellationSignal {
  readonly #promise: Promise<void>;
  #resolve: () => void = () => undefined;
  #requested = false;
  constructor() { this.#promise = new Promise((resolve) => { this.#resolve = resolve; }); }
  get requested(): boolean { return this.#requested; }
  whenRequested(): Promise<void> { return this.#promise; }
  request(): void { this.#requested = true; this.#resolve(); }
}

const INPUT = Object.freeze({
  accessToken: "token-sentinel",
  accountId: "account-sentinel",
});

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function create(client: HttpsClient, clock: TimerClock = new ManualClock()) {
  const result = NodeOpenAIProviderTransport.create(INPUT, client, clock);
  assert.ok(result.ok);
  return result.value;
}

test("uses the exact fixed-origin authenticated catalog request", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const clock = new ManualClock();
  const pending = create(client, clock).catalog(new Cancellation());
  response.emit("data", ascii('{"models":[]}'));
  response.emit("end");
  const result = await pending;
  assert.ok(result.ok);
  assert.equal(OPENAI_PROVIDER_ORIGIN, "https://chatgpt.com");
  const options = client.options.at(0);
  assert.equal(options?.hostname, "chatgpt.com");
  assert.equal(options?.path, OPENAI_CATALOG_PATH);
  assert.equal(options?.method, "GET");
  assert.equal(options?.protocol, "https:");
  assert.equal(options?.port, 443);
  assert.equal(options?.agent, false);
  assert.equal(options?.maxHeaderSize, OPENAI_PROVIDER_TRANSPORT_LIMITS.headerBytes);
  const headers = options?.headers as Readonly<Record<string, string>>;
  assert.deepEqual(headers, {
    accept: "application/json",
    authorization: "Bearer token-sentinel",
    "chatgpt-account-id": "account-sentinel",
    originator: "agent",
    "user-agent": "agent/0.1.0",
  });
  assert.deepEqual(clock.delays, [30_000]);
  assert.equal(client.requests.at(0)?.timeoutMilliseconds, 30_000);
  assert.deepEqual([...result.value.body], [...ascii('{"models":[]}')]);
  assert.equal(clock.registrations.at(0)?.cancelled, true);
});

test("uses the exact fixed-origin Responses request and preserves its body", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  const clock = new ManualClock();
  const opened = await create(client, clock).open(
    Object.freeze({ body: "{\"stream\":true}" }),
    new Cancellation(),
  );
  assert.ok(opened.ok);
  const options = client.options.at(0);
  assert.equal(options?.path, OPENAI_RESPONSES_PATH);
  assert.equal(options?.method, "POST");
  assert.deepEqual(options?.headers, {
    accept: "text/event-stream",
    authorization: "Bearer token-sentinel",
    "chatgpt-account-id": "account-sentinel",
    "content-type": "application/json",
    originator: "agent",
    "user-agent": "agent/0.1.0",
  });
  assert.deepEqual(client.requests.at(0)?.writes, ['{"stream":true}']);
  assert.deepEqual(clock.delays, [600_000]);
  assert.equal(client.requests.at(0)?.timeoutMilliseconds, 120_000);
  const pending = opened.value.read();
  assert.deepEqual(await opened.value.read(), {
    error: { cleanupFailed: false, kind: "concurrentRead" },
    ok: false,
  });
  response.emit("data", ascii("data: {}\n\n"));
  assert.deepEqual(await pending, { ok: true, value: ascii("data: {}\n\n") });
  response.emit("end");
  assert.deepEqual(await opened.value.read(), { ok: true, value: null });
  assert.deepEqual(await opened.value.read(), { ok: true, value: null });
  assert.equal(clock.registrations.at(0)?.cancelled, true);
});

test("cancellation destroys an already-open Responses stream", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  const cancellation = new Cancellation();
  const opened = await create(client).open(Object.freeze({ body: "{}" }), cancellation);
  assert.ok(opened.ok);
  const pending = opened.value.read();
  cancellation.request();
  assert.deepEqual(await pending, {
    error: { cleanupFailed: false, kind: "cancelled" },
    ok: false,
  });
  assert.equal(response.destroyed, 1);
  assert.equal(client.requests.at(0)?.destroyed, 1);
});

test("reports Responses cleanup failure without replacing cancellation", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  const cancellation = new Cancellation();
  const opened = await create(client).open(Object.freeze({ body: "{}" }), cancellation);
  assert.ok(opened.ok);
  const request = client.requests.at(0);
  assert.ok(request !== undefined);
  request.destroyFailure = true;
  const pending = opened.value.read();
  cancellation.request();
  assert.deepEqual(await pending, {
    error: { cleanupFailed: true, kind: "cancelled" },
    ok: false,
  });
});

test("closing a Responses stream destroys request and response with combined cleanup", async () => {
  for (const target of ["request", "response"] as const) {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(
      Object.freeze({ body: "{}" }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    if (target === "request") request.destroyFailure = true;
    else response.destroyFailure = true;
    assert.deepEqual(await opened.value.close(), {
      error: { cleanupFailed: true, kind: "connection" },
      ok: false,
    });
    assert.equal(request.destroyed, 1);
    assert.equal(response.destroyed, 1);
  }
});

test("contains cleanup failures from late catalog and Responses callbacks", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const response = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    response.destroyFailure = true;
    const client = new FakeClient(response);
    client.deferResponses = true;
    const cancellation = new Cancellation();
    const transport = create(client);
    const pending = operation === "catalog"
      ? transport.catalog(cancellation)
      : transport.open(Object.freeze({ body: "{}" }), cancellation);
    cancellation.request();
    assert.deepEqual(await pending, {
      error: { cleanupFailed: false, kind: "cancelled" },
      ok: false,
    });
    let escaped = false;
    try {
      client.flushResponse();
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.equal(response.destroyed, 1);
  }
});

test("contains throwing HTTPS response metadata and destroys both handles", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    for (const property of ["statusCode", "headers"] as const) {
      const response = new FakeResponse(200, operation === "catalog"
        ? "application/json"
        : "text/event-stream");
      let metadataReads = 0;
      Object.defineProperty(response, property, {
        get: () => {
          metadataReads += 1;
          throw new Error("private response metadata failure");
        },
      });
      const client = new FakeClient(response);
      client.deferResponses = true;
      const transport = create(client);
      const pending = operation === "catalog"
        ? transport.catalog(new Cancellation())
        : transport.open(Object.freeze({ body: "{}" }), new Cancellation());
      const request = client.requests.at(0);
      assert.ok(request !== undefined);
      request.destroyFailure = property === "headers";
      let escaped = false;
      try {
        client.flushResponse();
      } catch (_cause: unknown) {
        escaped = true;
      }
      assert.equal(escaped, false);
      assert.deepEqual(await pending, {
        error: { cleanupFailed: property === "headers", kind: "protocol" },
        ok: false,
      });
      assert.equal(metadataReads, 1);
      assert.equal(response.destroyed, 1);
      assert.equal(request.destroyed, 1);
    }
  }
});

test("retains the request before rejecting a synchronous response", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const response = new FakeResponse();
    Object.defineProperty(response, "statusCode", {
      get: () => { throw new Error("private synchronous response failure"); },
    });
    const client = new FakeClient(response);
    client.respondDuringRequest = true;
    const result = await (operation === "catalog"
      ? create(client).catalog(new Cancellation())
      : create(client).open(Object.freeze({ body: "{}" }), new Cancellation()));
    assert.deepEqual(result, {
      error: { cleanupFailed: false, kind: "protocol" },
      ok: false,
    });
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    assert.equal(request.destroyed, 1);
    assert.equal(request.ended, 1);
    assert.equal(response.destroyed, 1);
  }
});

test("claims a response before reentrant metadata admission", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const response = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    const duplicate = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    const client = new FakeClient(response);
    client.deferResponses = true;
    Object.defineProperty(response, "statusCode", {
      get: () => {
        client.respondAgain(duplicate);
        return 200;
      },
    });
    const pending = operation === "catalog"
      ? create(client).catalog(new Cancellation())
      : create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    client.flushResponse();
    assert.deepEqual(await pending, {
      error: { cleanupFailed: false, kind: "protocol" },
      ok: false,
    });
    assert.equal(response.listenerCount(), 0);
    assert.equal(duplicate.listenerCount(), 0);
    assert.equal(response.resumes, 0);
    assert.equal(response.destroyed, 1);
    assert.equal(duplicate.destroyed, 1);
    assert.equal(request.destroyed, 1);
  }
});

test("claims the Responses stream candidate before reentrant listener admission", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const duplicate = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  client.deferResponses = true;
  response.synchronousRegistrationHook = (event) => {
    if (event !== "data") return;
    response.synchronousRegistrationHook = undefined;
    client.respondAgain(duplicate);
  };
  const pending = create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
  const request = client.requests.at(0);
  assert.ok(request !== undefined);
  client.flushResponse();
  assert.deepEqual(await pending, {
    error: { cleanupFailed: false, kind: "protocol" },
    ok: false,
  });
  assert.equal(response.listenerCount(), 0);
  assert.equal(duplicate.listenerCount(), 0);
  assert.equal(response.destroyed, 1);
  assert.equal(duplicate.destroyed, 1);
  assert.equal(request.destroyed, 1);
});

test("admits valid synchronous responses only after request setup", async () => {
  {
    const response = new FakeResponse();
    const client = new FakeClient(response);
    client.respondDuringRequest = true;
    const pending = create(client).catalog(new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    assert.equal(request.ended, 1);
    assert.equal(request.timeoutMilliseconds, 30_000);
    response.emit("data", ascii('{"models":[]}'));
    response.emit("end");
    const result = await pending;
    assert.ok(result.ok);
  }
  {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    client.respondDuringRequest = true;
    const opened = await create(client).open(
      Object.freeze({ body: '{"stream":true}' }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    assert.equal(request.ended, 1);
    assert.equal(request.timeoutMilliseconds, 120_000);
    assert.deepEqual(request.writes, ['{"stream":true}']);
    assert.deepEqual(await opened.value.close(), { ok: true, value: undefined });
  }
});

test("destroys staged responses when synchronous request setup fails", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const methods: readonly RequestFailureMethod[] = operation === "catalog"
      ? ["on", "setTimeout", "end"]
      : ["on", "setTimeout", "write", "end"];
    for (const method of methods) {
      const response = new FakeResponse(200, operation === "catalog"
        ? "application/json"
        : "text/event-stream");
      const client = new FakeClient(response);
      client.requestFailureMethod = method;
      client.respondDuringRequest = true;
      const result = await (operation === "catalog"
        ? create(client).catalog(new Cancellation())
        : create(client).open(Object.freeze({ body: "{}" }), new Cancellation()));
      assert.deepEqual(result, {
        error: { cleanupFailed: false, kind: "connection" },
        ok: false,
      });
      const request = client.requests.at(0);
      assert.ok(request !== undefined);
      assert.equal(request.destroyed, 1);
      assert.equal(response.destroyed, 1);
      assert.equal(response.listenerCount(), 0);
    }
  }
});

test("destroys late responses after request setup has failed", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const client = new FakeClient(new FakeResponse());
    client.requestFailureMethod = "on";
    const result = await (operation === "catalog"
      ? create(client).catalog(new Cancellation())
      : create(client).open(Object.freeze({ body: '{"stream":true}' }), new Cancellation()));
    assert.equal(result.ok, false);
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    assert.equal(request.destroyed, 1);

    const late = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    late.destroyFailure = true;
    let cleanupEscaped = false;
    try { client.respondAgain(late); }
    catch (_cause: unknown) { cleanupEscaped = true; }
    assert.equal(cleanupEscaped, false);
    assert.equal(late.destroyed, 1);
    assert.equal(late.listenerCount(), 0);
    assert.equal(request.destroyed, 1);
  }
});

test("stops request setup when a synchronous request error rejects staged response", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const response = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    const client = new FakeClient(response);
    client.errorDuringTimeoutSetup = true;
    client.respondDuringRequest = true;
    const result = await (operation === "catalog"
      ? create(client).catalog(new Cancellation())
      : create(client).open(Object.freeze({ body: "{}" }), new Cancellation()));
    assert.deepEqual(result, {
      error: { cleanupFailed: false, kind: "connection" },
      ok: false,
    });
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    assert.equal(request.destroyed, 1);
    assert.equal(request.ended, 0);
    assert.deepEqual(request.writes, []);
    assert.equal(response.destroyed, 1);
  }
});

test("fails an active Responses stream on a duplicate response callback", async () => {
  for (const duplicateCleanupFails of [false, true]) {
    const response = new FakeResponse(200, "text/event-stream");
    const duplicate = new FakeResponse(200, "text/event-stream");
    duplicate.destroyFailure = duplicateCleanupFails;
    const client = new FakeClient(response);
    const opened = await create(client).open(
      Object.freeze({ body: "{}" }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const pending = opened.value.read();
    client.respondAgain(duplicate);
    response.emit("data", ascii("unreachable"));
    assert.deepEqual(await pending, {
      error: { cleanupFailed: duplicateCleanupFails, kind: "protocol" },
      ok: false,
    });
    assert.equal(duplicate.destroyed, 1);
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
});

test("fails a duplicate Responses callback before EOF delivery settles", async () => {
  for (const duplicateCleanupFails of [false, true]) {
    const response = new FakeResponse(200, "text/event-stream");
    const duplicate = new FakeResponse(200, "text/event-stream");
    duplicate.destroyFailure = duplicateCleanupFails;
    const client = new FakeClient(response);
    const opened = await create(client).open(
      Object.freeze({ body: "{}" }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const pending = opened.value.read();
    response.emit("end");
    client.respondAgain(duplicate);
    assert.deepEqual(await pending, {
      error: { cleanupFailed: duplicateCleanupFails, kind: "protocol" },
      ok: false,
    });
    assert.equal(duplicate.destroyed, 1);
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
});

test("ignores retained data callbacks after Responses termination", async () => {
  {
    const response = new FakeResponse(200, "text/event-stream");
    const opened = await create(new FakeClient(response)).open(
      Object.freeze({ body: "{}" }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const lateData = response.retainedListener("data");
    assert.ok(lateData !== undefined);
    const pending = opened.value.read();
    response.emit("end");
    const pauses = response.pauses;
    lateData(ascii("late after end"));
    assert.deepEqual(await pending, { ok: true, value: null });
    assert.equal(response.pauses, pauses);
  }
  {
    const response = new FakeResponse(200, "text/event-stream");
    const opened = await create(new FakeClient(response)).open(
      Object.freeze({ body: "{}" }),
      new Cancellation(),
    );
    assert.ok(opened.ok);
    const lateData = response.retainedListener("data");
    assert.ok(lateData !== undefined);
    assert.deepEqual(await opened.value.close(), { ok: true, value: undefined });
    const pauses = response.pauses;
    lateData(ascii("late after close"));
    assert.equal(response.pauses, pauses);
    assert.deepEqual(await opened.value.read(), {
      error: { cleanupFailed: false, kind: "closed" },
      ok: false,
    });
  }
});

test("does not publish synchronous Responses data before resume succeeds", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
  assert.ok(opened.ok);
  Object.defineProperty(response, "resume", {
    value: () => {
      response.emit("data", ascii("unsafe"));
      throw new Error("private resume failure after data");
    },
  });
  assert.deepEqual(await opened.value.read(), {
    error: { cleanupFailed: false, kind: "connection" },
    ok: false,
  });
  assert.equal(response.destroyed, 1);
  assert.equal(client.requests.at(0)?.destroyed, 1);
});

test("rechecks Responses termination after pausing a data event", async () => {
  for (const event of ["end", "error"] as const) {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    const pending = opened.value.read();
    let terminalized = false;
    Object.defineProperty(response, "pause", {
      value: () => {
        if (!terminalized) {
          terminalized = true;
          response.emit(event, new Error("private terminal pause event"));
        }
        return response;
      },
    });
    const chunk = ascii("unsafe");
    let lengthReads = 0;
    Object.defineProperty(chunk, "length", {
      get: () => {
        lengthReads += 1;
        return 6;
      },
    });
    response.emit("data", chunk);
    assert.deepEqual(await pending, event === "end"
      ? { ok: true, value: null }
      : {
          error: { cleanupFailed: false, kind: "connection" },
          ok: false,
        });
    assert.equal(lengthReads, 0);
  }
});

test("rechecks Responses termination after snapshotting a data event", async () => {
  for (const event of ["end", "error"] as const) {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    const pending = opened.value.read();
    const chunk = ascii("unsafe");
    let terminalized = false;
    Object.defineProperty(chunk, "length", {
      get: () => {
        if (!terminalized) {
          terminalized = true;
          response.emit(event, new Error("private terminal snapshot event"));
        }
        return 6;
      },
    });
    response.emit("data", chunk);
    assert.deepEqual(await pending, event === "end"
      ? { ok: true, value: null }
      : {
          error: { cleanupFailed: false, kind: "connection" },
          ok: false,
        });
  }
});

test("rejects a non-string singleton content-type without coercion", async () => {
  for (const operation of ["catalog", "responses"] as const) {
    const response = new FakeResponse();
    let coercions = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, Symbol.toPrimitive, {
      value: () => {
        coercions += 1;
        throw new Error("private content-type coercion");
      },
    });
    Object.freeze(hostile);
    Object.defineProperty(response, "headers", {
      value: Object.freeze({ "content-type": Object.freeze([hostile]) }),
    });
    const client = new FakeClient(response);
    client.deferResponses = true;
    const pending = operation === "catalog"
      ? create(client).catalog(new Cancellation())
      : create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    request.destroyFailure = operation === "responses";
    let escaped = false;
    try {
      client.flushResponse();
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(await pending, {
      error: { cleanupFailed: operation === "responses", kind: "protocol" },
      ok: false,
    });
    assert.equal(coercions, 0);
    assert.equal(response.destroyed, 1);
    assert.equal(request.destroyed, 1);
  }
});

test("contains asynchronous response wiring failures and rolls back listeners", async () => {
  for (const [operation, method] of [
    ["catalog", "on"],
    ["catalog", "resume"],
    ["responses", "on"],
    ["responses", "pause"],
  ] as const) {
    const response = new FakeResponse(200, operation === "catalog"
      ? "application/json"
      : "text/event-stream");
    if (method === "on") {
      const originalOn = response.on.bind(response);
      let onCalls = 0;
      Object.defineProperty(response, "on", {
        value: (event: string, listener: Listener) => {
          onCalls += 1;
          if (onCalls === 2) throw new Error("private response wiring failure");
          return originalOn(event, listener);
        },
      });
    } else {
      Object.defineProperty(response, method, {
        value: () => { throw new Error("private response flow-control failure"); },
      });
    }
    const client = new FakeClient(response);
    client.deferResponses = true;
    const transport = create(client);
    const pending = operation === "catalog"
      ? transport.catalog(new Cancellation())
      : transport.open(Object.freeze({ body: "{}" }), new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    request.destroyFailure = method === "pause" || method === "resume";
    let escaped = false;
    try {
      client.flushResponse();
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(await pending, {
      error: {
        cleanupFailed: method === "pause" || method === "resume",
        kind: "protocol",
      },
      ok: false,
    });
    assert.equal(response.destroyed, 1);
    assert.equal(request.destroyed, 1);
    assert.equal(response.listenerCount(), 0);
  }
});

test("stages synchronous catalog completion until resume succeeds", async () => {
  const body = ascii('{"models":[]}');
  for (const resumeFails of [false, true]) {
    const response = new FakeResponse();
    const client = new FakeClient(response);
    client.deferResponses = true;
    const pending = create(client).catalog(new Cancellation());
    Object.defineProperty(response, "resume", {
      value: () => {
        response.emit("data", body);
        response.emit("end");
        if (resumeFails) throw new Error("private resume failure after catalog end");
        return response;
      },
    });
    client.flushResponse();
    assert.deepEqual(await pending, resumeFails
      ? {
          error: { cleanupFailed: false, kind: "protocol" },
          ok: false,
        }
      : {
          ok: true,
          value: {
            body,
            cleanupFailed: false,
            contentType: "application/json",
            statusCode: 200,
          },
        });
    assert.equal(response.listenerCount(), 0);
    assert.equal(response.destroyed, resumeFails ? 1 : 0);
    assert.equal(client.requests.at(0)?.destroyed, resumeFails ? 1 : 0);
  }
});

test("stops catalog admission after a synchronous terminal registration event", async () => {
  const response = new FakeResponse();
  response.synchronousRegistrationEvent = "error";
  const client = new FakeClient(response);
  client.deferResponses = true;
  const pending = create(client).catalog(new Cancellation());
  const request = client.requests.at(0);
  assert.ok(request !== undefined);
  client.flushResponse();
  assert.deepEqual(await pending, {
    error: { cleanupFailed: false, kind: "connection" },
    ok: false,
  });
  assert.equal(response.resumes, 0);
  assert.equal(response.listenerCount(), 0);
  assert.equal(response.destroyed, 1);
  assert.equal(request.destroyed, 1);
});

test("rejects Responses admission after a synchronous terminal registration event", async () => {
  for (const event of ["aborted", "end"] as const) {
    const response = new FakeResponse(200, "text/event-stream");
    response.synchronousRegistrationEvent = event;
    const client = new FakeClient(response);
    client.deferResponses = true;
    const pending = create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    client.flushResponse();
    assert.deepEqual(await pending, {
      error: { cleanupFailed: false, kind: "protocol" },
      ok: false,
    });
    assert.equal(response.listenerCount(), 0);
    assert.equal(response.destroyed, 1);
    assert.equal(request.destroyed, 1);
  }
});

test("contains admitted response flow-control and detach failures", async () => {
  {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    Object.defineProperty(response, "resume", {
      value: () => { throw new Error("private resume failure"); },
    });
    let escaped = false;
    let result: unknown;
    try {
      result = await opened.value.read();
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(result, {
      error: { cleanupFailed: false, kind: "connection" },
      ok: false,
    });
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
  {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    const pending = opened.value.read();
    Object.defineProperty(response, "pause", {
      value: () => { throw new Error("private pause failure"); },
    });
    let escaped = false;
    try {
      response.emit("data", ascii("unsafe"));
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(await pending, {
      error: { cleanupFailed: false, kind: "connection" },
      ok: false,
    });
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
  {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    let offCalls = 0;
    Object.defineProperty(response, "off", {
      value: () => {
        offCalls += 1;
        throw new Error("private detach failure");
      },
    });
    let escaped = false;
    let result: unknown;
    try {
      result = await opened.value.close();
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(result, {
      error: { cleanupFailed: true, kind: "connection" },
      ok: false,
    });
    assert.equal(offCalls, 4);
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
  for (const event of ["end", "error"] as const) {
    const response = new FakeResponse(200, "text/event-stream");
    const client = new FakeClient(response);
    const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
    assert.ok(opened.ok);
    const pending = opened.value.read();
    let offCalls = 0;
    Object.defineProperty(response, "off", {
      value: () => {
        offCalls += 1;
        throw new Error("private terminal detach failure");
      },
    });
    let escaped = false;
    try {
      response.emit(event, new Error("private response failure"));
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(await pending, {
      error: { cleanupFailed: true, kind: "connection" },
      ok: false,
    });
    assert.equal(offCalls, event === "end" ? 8 : 4);
    assert.equal(response.destroyed, 1);
    assert.equal(client.requests.at(0)?.destroyed, 1);
  }
  for (const target of ["request", "response"] as const) {
    const response = new FakeResponse();
    const client = new FakeClient(response);
    const pending = create(client).catalog(new Cancellation());
    response.emit("data", ascii('{"models":[]}'));
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    let offCalls = 0;
    Object.defineProperty(target === "request" ? request : response, "off", {
      value: () => {
        offCalls += 1;
        throw new Error("private catalog detach failure");
      },
    });
    let escaped = false;
    try {
      response.emit("end");
    } catch (_cause: unknown) {
      escaped = true;
    }
    assert.equal(escaped, false);
    assert.deepEqual(await pending, {
      error: { cleanupFailed: true, kind: "protocol" },
      ok: false,
    });
    assert.equal(offCalls, target === "request" ? 2 : 8);
    assert.equal(response.destroyed, 1);
    assert.equal(request.destroyed, 1);
  }
});

test("reports failed-open response cleanup without replacing protocol failure", async () => {
  const response = new FakeResponse(99, "text/event-stream");
  response.destroyFailure = true;
  const opened = await create(new FakeClient(response)).open(
    Object.freeze({ body: "{}" }),
    new Cancellation(),
  );
  assert.deepEqual(opened, {
    error: { cleanupFailed: true, kind: "protocol" },
    ok: false,
  });
});

test("propagates a request failure after the Responses stream opens", async () => {
  const response = new FakeResponse(200, "text/event-stream");
  const client = new FakeClient(response);
  const opened = await create(client).open(Object.freeze({ body: "{}" }), new Cancellation());
  assert.ok(opened.ok);
  const pending = opened.value.read();
  let settled = false;
  void pending.then(() => { settled = true; });
  client.requests.at(0)?.emitError();
  await Promise.resolve();
  assert.equal(settled, true);
  assert.deepEqual(await pending, {
    error: { cleanupFailed: false, kind: "connection" },
    ok: false,
  });
  assert.equal(response.destroyed, 1);
});

test("does not read non-success or non-JSON catalog bodies", async () => {
  for (const response of [
    new FakeResponse(401, "application/json"),
    new FakeResponse(200, "text/plain"),
  ]) {
    const client = new FakeClient(response);
    client.deferResponses = true;
    const pending = create(client).catalog(new Cancellation());
    const request = client.requests.at(0);
    assert.ok(request !== undefined);
    request.destroyFailure = true;
    client.flushResponse();
    const result = await pending;
    assert.ok(result.ok);
    assert.equal(result.value.body.length, 0);
    assert.equal(result.value.cleanupFailed, true);
    assert.equal(response.resumes, 0);
    assert.equal(response.destroyed, 1);
    assert.equal(request.destroyed, 1);
  }
});

test("bounds catalog capture and response chunks before exposing bytes", async () => {
  const catalogResponse = new FakeResponse();
  const catalogClient = new FakeClient(catalogResponse);
  const pendingCatalog = create(catalogClient).catalog(new Cancellation());
  catalogResponse.emit(
    "data",
    new Uint8Array(OPENAI_PROVIDER_TRANSPORT_LIMITS.responseChunkBytes + 1),
  );
  assert.deepEqual(await pendingCatalog, {
    error: { cleanupFailed: false, kind: "limit" },
    ok: false,
  });
  assert.equal(catalogResponse.destroyed, 1);

  const response = new FakeResponse(200, "text/event-stream");
  const responseClient = new FakeClient(response);
  const opened = await create(responseClient).open(Object.freeze({ body: "{}" }), new Cancellation());
  assert.ok(opened.ok);
  const pendingRead = opened.value.read();
  response.emit(
    "data",
    new Uint8Array(OPENAI_PROVIDER_TRANSPORT_LIMITS.responseChunkBytes + 1),
  );
  assert.deepEqual(await pendingRead, {
    error: { cleanupFailed: false, kind: "limit" },
    ok: false,
  });
});

test("copies HTTPS chunks without consulting overridden iterators", async () => {
  const catalogBody = ascii('{"models":[]}');
  const catalogReplacement = ascii('{"replaced":true}');
  let catalogIteratorCalls = 0;
  Object.defineProperty(catalogBody, Symbol.iterator, {
    value: () => {
      catalogIteratorCalls += 1;
      return catalogReplacement.values();
    },
  });
  const catalogResponse = new FakeResponse();
  const pendingCatalog = create(new FakeClient(catalogResponse)).catalog(new Cancellation());
  catalogResponse.emit("data", catalogBody);
  catalogResponse.emit("end");
  const captured = await pendingCatalog;
  assert.ok(captured.ok);
  assert.deepEqual(captured.value.body, ascii('{"models":[]}'));
  assert.equal(catalogIteratorCalls, 0);

  const responseBody = ascii("owned-response");
  const responseReplacement = ascii("replaced-response");
  let responseIteratorCalls = 0;
  Object.defineProperty(responseBody, Symbol.iterator, {
    value: () => {
      responseIteratorCalls += 1;
      return responseReplacement.values();
    },
  });
  const response = new FakeResponse(200, "text/event-stream");
  const opened = await create(new FakeClient(response)).open(
    Object.freeze({ body: "{}" }),
    new Cancellation(),
  );
  assert.ok(opened.ok);
  const pendingRead = opened.value.read();
  response.emit("data", responseBody);
  assert.deepEqual(await pendingRead, { ok: true, value: ascii("owned-response") });
  assert.equal(responseIteratorCalls, 0);
});

test("reports catalog cleanup failure without replacing the primary failure", async () => {
  for (const target of ["request", "response"] as const) {
    const response = new FakeResponse();
    const client = new FakeClient(response);
    const clock = new ManualClock();
    const pending = create(client, clock).catalog(new Cancellation());
    if (target === "request") {
      const request = client.requests.at(0);
      assert.ok(request !== undefined);
      request.destroyFailure = true;
    } else {
      response.destroyFailure = true;
    }
    clock.registrations.at(0)?.fire();
    assert.deepEqual(await pending, {
      error: { cleanupFailed: true, kind: "timeout" },
      ok: false,
    });
  }

  const response = new FakeResponse(401);
  response.destroyFailure = true;
  assert.deepEqual(await create(new FakeClient(response)).catalog(new Cancellation()), {
    ok: true,
    value: {
      body: new Uint8Array(),
      cleanupFailed: true,
      contentType: "application/json",
      statusCode: 401,
    },
  });
});

test("rejects malformed credential snapshots and requests without network authority", async () => {
  const client = new FakeClient(new FakeResponse());
  for (const value of [
    null,
    { accessToken: "", accountId: "account-sentinel" },
    { accessToken: "token-sentinel", accountId: "bad value" },
    { ...INPUT, refreshToken: "not-admitted" },
  ]) {
    assert.deepEqual(NodeOpenAIProviderTransport.create(value, client), {
      error: { kind: "invalidConfiguration" },
      ok: false,
    });
  }
  assert.equal(client.options.length, 0);
  const transport = create(client);
  assert.deepEqual(await transport.open(Object.freeze({ body: "" }), new Cancellation()), {
    error: { cleanupFailed: false, kind: "protocol" },
    ok: false,
  });
  assert.equal(client.options.length, 0);
});

test("validates and retains one credential property snapshot", async () => {
  let accessReads = 0;
  let accountReads = 0;
  const credential = Object.defineProperties({}, {
    accessToken: {
      enumerable: true,
      get: () => {
        accessReads += 1;
        return accessReads === 1 ? "token-sentinel" : undefined;
      },
    },
    accountId: {
      enumerable: true,
      get: () => {
        accountReads += 1;
        return accountReads === 1 ? "account-sentinel" : "bad value";
      },
    },
  });
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const created = NodeOpenAIProviderTransport.create(credential, client, new ManualClock());
  assert.ok(created.ok);
  assert.equal(accessReads, 1);
  assert.equal(accountReads, 1);
  const pending = created.value.catalog(new Cancellation());
  response.emit("data", ascii('{"models":[]}'));
  response.emit("end");
  assert.ok((await pending).ok);
  const headers = client.options.at(0)?.headers as Readonly<Record<string, string>>;
  assert.equal(headers.authorization, "Bearer token-sentinel");
  assert.equal(headers["chatgpt-account-id"], "account-sentinel");
});
