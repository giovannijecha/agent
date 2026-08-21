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

class FakeResponse implements IncomingMessage {
  readonly headers: IncomingMessage["headers"];
  readonly statusCode: number | undefined;
  readonly #listeners = new Map<string, Listener[]>();
  destroyed = 0;
  destroyFailure = false;
  pauses = 0;
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
}

class FakeRequest implements ClientRequest {
  readonly #listeners: ((cause: unknown) => void)[] = [];
  readonly #onEnd: () => void;
  destroyed = 0;
  destroyFailure = false;
  ended = 0;
  timeoutMilliseconds: number | undefined;
  timeoutListener: (() => void) | undefined;
  writes: string[] = [];

  constructor(onEnd: () => void) { this.#onEnd = onEnd; }
  destroy(): void {
    this.destroyed += 1;
    if (this.destroyFailure) throw new Error("private request cleanup failure");
  }
  end(): void { this.ended += 1; this.#onEnd(); }
  write(body: string): boolean { this.writes.push(body); return true; }

  on(event: "error", listener: (cause: unknown) => void): this {
    void event;
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
    this.timeoutMilliseconds = milliseconds;
    this.timeoutListener = listener;
    return this;
  }

  emitError(): void {
    for (const listener of [...this.#listeners]) listener(new Error("synthetic request failure"));
  }
}

class FakeClient implements HttpsClient {
  readonly responses: FakeResponse[];
  readonly options: RequestOptions[] = [];
  readonly requests: FakeRequest[] = [];
  readonly #pendingResponses: (() => void)[] = [];
  deferResponses = false;

  constructor(...responses: FakeResponse[]) { this.responses = [...responses]; }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    const response = this.responses.shift();
    assert.ok(response !== undefined);
    this.options.push(options);
    const respond = (): void => onResponse(response);
    const request = new FakeRequest(() => {
      if (this.deferResponses) this.#pendingResponses.push(respond);
      else respond();
    });
    this.requests.push(request);
    return request;
  }

  flushResponse(): void {
    this.#pendingResponses.shift()?.();
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
