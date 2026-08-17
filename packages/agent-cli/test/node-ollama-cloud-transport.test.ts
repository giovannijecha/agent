import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClientRequest,
  IncomingMessage,
  RequestOptions,
} from "node:https";
import type { CancellationSignal } from "@agent/runtime";

import {
  type HttpsClient,
  NodeOllamaCloudTransport,
  OLLAMA_CLOUD_CHAT_PATH,
  OLLAMA_CLOUD_ORIGIN,
  OLLAMA_CLOUD_TRANSPORT_LIMITS,
} from "../dist/node-ollama-cloud-transport.js";

class FakeCancellation implements CancellationSignal {
  #resolve: () => void = () => undefined;
  readonly #requested: Promise<void>;
  requested = false;

  constructor() {
    this.#requested = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  request(): void {
    this.requested = true;
    this.#resolve();
  }

  whenRequested(): Promise<void> {
    return this.#requested;
  }
}

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

  destroy(): void {
    this.destroyed += 1;
  }

  on(event: "aborted", listener: () => void): this;
  on(event: "data", listener: (chunk: Uint8Array) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  off(event: "aborted", listener: () => void): this;
  off(event: "data", listener: (chunk: Uint8Array) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (listeners !== undefined && index >= 0) {
      listeners.splice(index, 1);
    }
    return this;
  }

  pause(): this {
    this.pauses += 1;
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
  readonly bodies: string[] = [];
  readonly #errorListeners: ((cause: unknown) => void)[] = [];
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
    this.#errorListeners.push(listener);
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this {
    void event;
    const index = this.#errorListeners.indexOf(listener);
    if (index >= 0) {
      this.#errorListeners.splice(index, 1);
    }
    return this;
  }

  setTimeout(milliseconds: number, listener: () => void): this {
    this.timeoutMilliseconds = milliseconds;
    this.timeoutListener = listener;
    return this;
  }

  write(body: string): boolean {
    this.bodies.push(body);
    return true;
  }
}

class FakeClient implements HttpsClient {
  readonly response: FakeResponse | undefined;
  options: RequestOptions | undefined;
  requestValue: FakeRequest | undefined;

  constructor(response?: FakeResponse) {
    this.response = response;
  }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    this.options = options;
    this.requestValue = new FakeRequest(() => {
      if (this.response !== undefined) {
        onResponse(this.response);
      }
    });
    return this.requestValue;
  }
}

function createTransport(client: HttpsClient): NodeOllamaCloudTransport {
  const created = NodeOllamaCloudTransport.create("valid-value", client);
  assert.ok(created.ok);
  return created.value;
}

test("rejects invalid credentials and hostile HTTPS clients without throwing", () => {
  assert.equal(NodeOllamaCloudTransport.create("", new FakeClient()).ok, false);
  const hostile = Object.create(null) as { request?: unknown };
  Object.defineProperty(hostile, "request", {
    get: () => {
      throw new Error("private cause");
    },
  });
  assert.deepEqual(NodeOllamaCloudTransport.create("valid-value", hostile as never), {
    error: { kind: "invalidConfiguration" },
    ok: false,
  });
});

test("uses only the admitted HTTPS origin, path, headers, and request body", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const opened = await createTransport(client).open(
    Object.freeze({ body: "{\"stream\":true}" }),
    new FakeCancellation(),
  );

  assert.ok(opened.ok);
  assert.equal(OLLAMA_CLOUD_ORIGIN, "https://ollama.com");
  assert.equal(client.options?.hostname, "ollama.com");
  assert.equal(client.options?.path, OLLAMA_CLOUD_CHAT_PATH);
  assert.equal(client.options?.method, "POST");
  assert.equal(client.options?.protocol, "https:");
  assert.equal(client.options?.port, 443);
  assert.equal(client.options?.agent, false);
  assert.equal(client.options?.maxHeaderSize, OLLAMA_CLOUD_TRANSPORT_LIMITS.headerBytes);
  assert.equal(client.options?.headers.accept, "application/json");
  assert.equal(client.options?.headers.authorization, "Bearer valid-value");
  assert.deepEqual(client.requestValue?.bodies, ["{\"stream\":true}"]);
  assert.equal(client.requestValue?.timeoutMilliseconds, 120_000);
  assert.equal(opened.value.statusCode, 200);
  assert.equal(opened.value.contentType, "application/json");
});

test("delivers one owned chunk per pull and ends deterministically", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const opened = await createTransport(client).open(
    Object.freeze({ body: "{}" }),
    new FakeCancellation(),
  );
  assert.ok(opened.ok);

  const pending = opened.value.read();
  const original = new Uint8Array([1, 2, 3]);
  response.emit("data", original);
  original[0] = 9;
  assert.deepEqual(await pending, {
    ok: true,
    value: new Uint8Array([1, 2, 3]),
  });
  response.emit("end");
  assert.deepEqual(await opened.value.read(), { ok: true, value: null });
  assert.equal(response.resumes, 1);
  assert.equal(response.pauses >= 2, true);
});

test("rejects concurrent reads and oversized response chunks", async () => {
  const response = new FakeResponse();
  const opened = await createTransport(new FakeClient(response)).open(
    Object.freeze({ body: "{}" }),
    new FakeCancellation(),
  );
  assert.ok(opened.ok);
  const first = opened.value.read();
  assert.deepEqual(await opened.value.read(), {
    error: { kind: "concurrentRead" },
    ok: false,
  });
  response.emit(
    "data",
    new Uint8Array(OLLAMA_CLOUD_TRANSPORT_LIMITS.responseChunkBytes + 1),
  );
  assert.deepEqual(await first, { error: { kind: "limit" }, ok: false });
});

test("settles timeout and cancellation before transport destruction", async () => {
  const timeoutClient = new FakeClient();
  const timeoutOpen = createTransport(timeoutClient).open(
    Object.freeze({ body: "{}" }),
    new FakeCancellation(),
  );
  timeoutClient.requestValue?.timeoutListener?.();
  assert.deepEqual(await timeoutOpen, { error: { kind: "timeout" }, ok: false });
  assert.equal(timeoutClient.requestValue?.destroyed, 1);

  const cancellation = new FakeCancellation();
  const cancelClient = new FakeClient();
  const cancelOpen = createTransport(cancelClient).open(
    Object.freeze({ body: "{}" }),
    cancellation,
  );
  cancellation.request();
  assert.deepEqual(await cancelOpen, {
    error: { kind: "cancelled" },
    ok: false,
  });
  assert.equal(cancelClient.requestValue?.destroyed, 1);
});

test("reports inactivity timeout after the response stream opens", async () => {
  const response = new FakeResponse();
  const client = new FakeClient(response);
  const opened = await createTransport(client).open(
    Object.freeze({ body: "{}" }),
    new FakeCancellation(),
  );
  assert.ok(opened.ok);

  const pending = opened.value.read();
  client.requestValue?.timeoutListener?.();

  assert.deepEqual(await pending, { error: { kind: "timeout" }, ok: false });
  assert.equal(client.requestValue?.destroyed, 1);
  assert.equal(response.destroyed, 1);
});

test("rejects malformed requests without retaining their content", async () => {
  const invalid = await createTransport(new FakeClient()).open(
    Object.freeze({ body: "" }),
    new FakeCancellation(),
  );
  assert.deepEqual(invalid, { error: { kind: "protocol" }, ok: false });
  assert.equal(JSON.stringify(invalid).includes("valid-value"), false);
});
