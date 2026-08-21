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
  pauses = 0;
  resumes = 0;

  constructor(statusCode = 200, contentType = "application/json") {
    this.statusCode = statusCode;
    this.headers = Object.freeze({ "content-type": contentType });
  }

  destroy(): void { this.destroyed += 1; }
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
  ended = 0;
  timeoutMilliseconds: number | undefined;
  timeoutListener: (() => void) | undefined;
  writes: string[] = [];

  constructor(onEnd: () => void) { this.#onEnd = onEnd; }
  destroy(): void { this.destroyed += 1; }
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

  constructor(...responses: FakeResponse[]) { this.responses = [...responses]; }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    const response = this.responses.shift();
    assert.ok(response !== undefined);
    this.options.push(options);
    const request = new FakeRequest(() => onResponse(response));
    this.requests.push(request);
    return request;
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
    error: { kind: "concurrentRead" },
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
  assert.deepEqual(await pending, { error: { kind: "cancelled" }, ok: false });
  assert.equal(response.destroyed, 1);
  assert.equal(client.requests.at(0)?.destroyed, 1);
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
  assert.deepEqual(await pending, { error: { kind: "connection" }, ok: false });
  assert.equal(response.destroyed, 1);
});

test("does not read non-success or non-JSON catalog bodies", async () => {
  for (const response of [
    new FakeResponse(401, "application/json"),
    new FakeResponse(200, "text/plain"),
  ]) {
    const client = new FakeClient(response);
    const result = await create(client).catalog(new Cancellation());
    assert.ok(result.ok);
    assert.equal(result.value.body.length, 0);
    assert.equal(response.resumes, 0);
    assert.equal(response.destroyed, 1);
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
  assert.deepEqual(await pendingCatalog, { error: { kind: "limit" }, ok: false });
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
  assert.deepEqual(await pendingRead, { error: { kind: "limit" }, ok: false });
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
    error: { kind: "protocol" },
    ok: false,
  });
  assert.equal(client.options.length, 0);
});
