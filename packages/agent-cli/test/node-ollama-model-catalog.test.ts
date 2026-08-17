import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClientRequest,
  IncomingMessage,
  RequestOptions,
} from "node:https";

import {
  type HttpsClient,
  NodeOllamaModelCatalog,
  OLLAMA_CLOUD_MODELS_ORIGIN,
  OLLAMA_CLOUD_MODELS_PATH,
  OLLAMA_MODEL_CATALOG_LIMITS,
} from "../dist/node-ollama-model-catalog.js";
import type {
  ScheduledTimer,
  TimerClock,
} from "../dist/timer-clock.js";

type Listener = (() => void) | ((value: unknown) => void);

class FakeResponse implements IncomingMessage {
  readonly headers: IncomingMessage["headers"];
  readonly statusCode: number | undefined;
  readonly #listeners = new Map<string, Listener[]>();
  destroyed = 0;
  resumes = 0;

  constructor(statusCode = 200, contentType = "application/json") {
    this.statusCode = statusCode;
    this.headers = Object.freeze({ "content-type": contentType });
  }

  destroy(): void {
    this.destroyed += 1;
  }

  on(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (listeners !== undefined && index >= 0) {
      listeners.splice(index, 1);
    }
    return this;
  }

  pause(): this {
    return this;
  }

  resume(): this {
    this.resumes += 1;
    return this;
  }

  emit(event: string, value?: unknown): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) {
      listener(value);
    }
  }
}

class FakeRequest implements ClientRequest {
  readonly #listeners: ((cause: unknown) => void)[] = [];
  readonly #onEnd: () => void;
  destroyed = 0;
  ended = 0;
  timeoutMilliseconds: number | undefined;
  timeoutListener: (() => void) | undefined;

  constructor(onEnd: () => void) {
    this.#onEnd = onEnd;
  }

  destroy(): void {
    this.destroyed += 1;
  }

  end(): void {
    this.ended += 1;
    this.#onEnd();
  }

  on(event: "error", listener: (cause: unknown) => void): this {
    void event;
    this.#listeners.push(listener);
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this {
    void event;
    const index = this.#listeners.indexOf(listener);
    if (index >= 0) {
      this.#listeners.splice(index, 1);
    }
    return this;
  }

  setTimeout(milliseconds: number, listener: () => void): this {
    this.timeoutMilliseconds = milliseconds;
    this.timeoutListener = listener;
    return this;
  }

  write(_body: string): boolean {
    return true;
  }
}

class FakeClient implements HttpsClient {
  readonly response: FakeResponse;
  options: RequestOptions | undefined;
  requestValue: FakeRequest | undefined;

  constructor(response: FakeResponse) {
    this.response = response;
  }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    this.options = options;
    this.requestValue = new FakeRequest(() => onResponse(this.response));
    return this.requestValue;
  }
}

class ManualRegistration implements ScheduledTimer {
  cancelled = false;
  readonly listener: () => void;

  constructor(listener: () => void) {
    this.listener = listener;
  }

  cancel(): void {
    this.cancelled = true;
  }

  fire(): void {
    this.listener();
  }
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

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

async function complete(
  client: FakeClient,
  clock: TimerClock = new ManualClock(),
) {
  const pending = new NodeOllamaModelCatalog(client, clock).list(
    "ollamaCloud",
    "valid-value",
  );
  client.response.emit("data", ascii(JSON.stringify({
    models: [{ model: "qwen3-coder:480b-cloud", name: "qwen3-coder:480b-cloud" }],
  })));
  client.response.emit("end");
  return pending;
}

test("uses the exact authenticated Ollama Cloud catalog request", async () => {
  const client = new FakeClient(new FakeResponse());
  const listed = await complete(client);
  assert.ok(listed.ok);
  assert.equal(OLLAMA_CLOUD_MODELS_ORIGIN, "https://ollama.com");
  assert.equal(client.options?.hostname, "ollama.com");
  assert.equal(client.options?.path, OLLAMA_CLOUD_MODELS_PATH);
  assert.equal(client.options?.method, "GET");
  assert.equal(client.options?.protocol, "https:");
  assert.equal(client.options?.port, 443);
  assert.equal(client.options?.agent, false);
  assert.equal(client.options?.maxHeaderSize, OLLAMA_MODEL_CATALOG_LIMITS.headerBytes);
  const headers = client.options?.headers as Readonly<Record<string, string>>;
  assert.equal(headers.accept, "application/json");
  assert.equal(headers.authorization, "Bearer valid-value");
  assert.equal(client.requestValue?.timeoutMilliseconds, 30_000);
  assert.equal(client.response.resumes, 1);
});

test("enforces one absolute deadline despite continuing response data", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const clock = new ManualClock();
  const pending = new NodeOllamaModelCatalog(client, clock).list(
    "ollamaCloud",
    "valid-value",
  );

  assert.deepEqual(clock.delays, [
    OLLAMA_MODEL_CATALOG_LIMITS.deadlineMilliseconds,
  ]);
  response.emit("data", ascii('{"models":['));
  response.emit(
    "data",
    ascii('{"name":"example:cloud","model":"example:cloud"}'),
  );
  clock.registrations.at(0)?.fire();

  assert.deepEqual(await pending, { error: { kind: "timeout" }, ok: false });
  assert.equal(client.requestValue?.destroyed, 1);
  assert.equal(response.destroyed, 1);

  response.emit("data", ascii("]}"));
  response.emit("end");
  clock.registrations.at(0)?.fire();
  assert.equal(client.requestValue?.destroyed, 1);
  assert.equal(response.destroyed, 1);
});

test("cancels the absolute deadline on success and rejects its late callback", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const clock = new ManualClock();

  const result = await complete(client, clock);
  assert.ok(result.ok);
  assert.equal(clock.registrations.at(0)?.cancelled, true);

  clock.registrations.at(0)?.fire();
  assert.equal(client.requestValue?.destroyed, 0);
  assert.equal(response.destroyed, 0);
});

test("fails closed before transport when the absolute deadline cannot arm", async () => {
  const client = new FakeClient(new FakeResponse());
  const clock: TimerClock = Object.freeze({
    schedule(): ScheduledTimer {
      throw new Error("clock unavailable");
    },
  });

  const result = await new NodeOllamaModelCatalog(client, clock).list(
    "ollamaCloud",
    "valid-value",
  );

  assert.deepEqual(result, { error: { kind: "timeout" }, ok: false });
  assert.equal(client.options, undefined);
});

test("contains a synchronously fired absolute deadline before transport", async () => {
  const client = new FakeClient(new FakeResponse());
  const registration = new ManualRegistration(() => undefined);
  const clock: TimerClock = Object.freeze({
    schedule(_delayMilliseconds: number, listener: () => void): ScheduledTimer {
      listener();
      return registration;
    },
  });

  const result = await new NodeOllamaModelCatalog(client, clock).list(
    "ollamaCloud",
    "valid-value",
  );

  assert.deepEqual(result, { error: { kind: "timeout" }, ok: false });
  assert.equal(registration.cancelled, true);
  assert.equal(client.options, undefined);
});

test("fails closed on status, content type, and oversized response chunks", async () => {
  for (const response of [
    new FakeResponse(500),
    new FakeResponse(200, "text/plain"),
  ]) {
    const client = new FakeClient(response);
    const result = await new NodeOllamaModelCatalog(client).list(
      "ollamaCloud",
      "valid-value",
    );
    assert.equal(result.ok, false);
  }

  const response = new FakeResponse();
  const client = new FakeClient(response);
  const pending = new NodeOllamaModelCatalog(client).list(
    "ollamaCloud",
    "valid-value",
  );
  response.emit(
    "data",
    new Uint8Array(OLLAMA_MODEL_CATALOG_LIMITS.responseChunkBytes + 1),
  );
  assert.equal((await pending).ok, false);
  assert.equal(response.destroyed, 1);
});

test("rejects a forged provider identity before opening a request", async () => {
  const client = new FakeClient(new FakeResponse());
  const result = await new NodeOllamaModelCatalog(client).list(
    "private-provider" as never,
    "valid-value",
  );

  assert.deepEqual(result, { error: { kind: "protocol" }, ok: false });
  assert.equal(client.options, undefined);
});

test("rejects missing credentials before opening a request", async () => {
  const client = new FakeClient(new FakeResponse());
  const result = await new NodeOllamaModelCatalog(client).list(
    "ollamaCloud",
    "",
  );

  assert.deepEqual(result, { error: { kind: "protocol" }, ok: false });
  assert.equal(client.options, undefined);
});
