import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClientRequest,
  IncomingMessage,
  RequestOptions,
} from "node:https";

import {
  type HttpsClient,
  NodeOpenCodeModelCatalog,
  OPENCODE_GO_MODELS_PATH,
  OPENCODE_MODEL_CATALOG_LIMITS,
  OPENCODE_ZEN_MODELS_PATH,
} from "../dist/node-opencode-model-catalog.js";

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

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

async function complete(
  provider: "opencodeGo" | "opencodeZen",
  client: FakeClient,
) {
  const pending = new NodeOpenCodeModelCatalog(client).list(provider);
  client.response.emit("data", ascii(JSON.stringify({
    data: [{ id: "deepseek-v4-flash-free", object: "model" }],
    object: "list",
  })));
  client.response.emit("end");
  return pending;
}

test("uses exact public Go and Zen catalog requests without authorization", async () => {
  for (const [provider, path] of [
    ["opencodeGo", OPENCODE_GO_MODELS_PATH],
    ["opencodeZen", OPENCODE_ZEN_MODELS_PATH],
  ] as const) {
    const client = new FakeClient(new FakeResponse());
    const listed = await complete(provider, client);
    assert.ok(listed.ok);
    assert.equal(client.options?.hostname, "opencode.ai");
    assert.equal(client.options?.path, path);
    assert.equal(client.options?.method, "GET");
    assert.equal(client.options?.protocol, "https:");
    assert.equal(client.options?.port, 443);
    assert.equal(client.options?.agent, false);
    assert.equal(client.options?.maxHeaderSize, OPENCODE_MODEL_CATALOG_LIMITS.headerBytes);
    const headers = client.options?.headers as Readonly<Record<string, string>>;
    assert.equal(headers.accept, "application/json");
    assert.equal("authorization" in headers, false);
    assert.equal(client.requestValue?.timeoutMilliseconds, 30_000);
    assert.equal(client.response.resumes, 1);
  }
});

test("fails closed on status, content type, and oversized response chunks", async () => {
  for (const response of [
    new FakeResponse(500),
    new FakeResponse(200, "text/plain"),
  ]) {
    const client = new FakeClient(response);
    const result = await new NodeOpenCodeModelCatalog(client).list("opencodeGo");
    assert.equal(result.ok, false);
  }

  const response = new FakeResponse();
  const client = new FakeClient(response);
  const pending = new NodeOpenCodeModelCatalog(client).list("opencodeZen");
  response.emit(
    "data",
    new Uint8Array(OPENCODE_MODEL_CATALOG_LIMITS.responseChunkBytes + 1),
  );
  assert.equal((await pending).ok, false);
  assert.equal(response.destroyed, 1);
});

test("rejects a forged provider identity before opening a request", async () => {
  const client = new FakeClient(new FakeResponse());
  const result = await new NodeOpenCodeModelCatalog(client).list(
    "private-provider" as never,
  );

  assert.deepEqual(result, { error: { kind: "protocol" }, ok: false });
  assert.equal(client.options, undefined);
});
