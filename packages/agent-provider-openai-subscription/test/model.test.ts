import assert from "node:assert/strict";
import test from "node:test";

import { Conversation, Message, Role, ok, type Result } from "@agent/core";
import {
  decodeOpenAIModelCatalog,
  OpenAIModelCatalog,
  OpenAISubscriptionModel,
  type OpenAICatalogCapture,
  type OpenAIProviderTransport,
  type OpenAITransportError,
  type OpenAITransportRequest,
  type OpenAITransportStream,
} from "@agent/provider-openai-subscription";
import type { CancellationSignal } from "@agent/runtime";
import { ObjectSchema, StringSchema, ToolDescriptor } from "@agent/tools";

const MODEL = "model-alpha";

class Cancellation implements CancellationSignal {
  readonly #promise: Promise<void>;
  #resolve: () => void = () => undefined;
  #requested = false;

  constructor() {
    this.#promise = new Promise((resolve) => { this.#resolve = resolve; });
  }

  get requested(): boolean {
    return this.#requested;
  }

  whenRequested(): Promise<void> {
    return this.#promise;
  }

  request(): void {
    this.#requested = true;
    this.#resolve();
  }
}

class FakeStream implements OpenAITransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  readonly #chunks: Result<Uint8Array | null, OpenAITransportError>[];
  closeCalls = 0;

  constructor(
    chunks: Result<Uint8Array | null, OpenAITransportError>[],
    statusCode = 200,
    contentType: string | undefined = "text/event-stream; charset=utf-8",
  ) {
    this.#chunks = [...chunks];
    this.statusCode = statusCode;
    this.contentType = contentType;
  }

  read(): Promise<Result<Uint8Array | null, OpenAITransportError>> {
    return Promise.resolve(this.#chunks.shift() ?? ok(null));
  }

  close(): Promise<Result<void, OpenAITransportError>> {
    this.closeCalls += 1;
    return Promise.resolve(ok(undefined));
  }
}

class FakeTransport implements OpenAIProviderTransport {
  readonly #capture: Result<OpenAICatalogCapture, OpenAITransportError>;
  readonly #stream: Result<OpenAITransportStream, OpenAITransportError>;
  request: OpenAITransportRequest | undefined;

  constructor(
    stream: Result<OpenAITransportStream, OpenAITransportError>,
    capture: Result<OpenAICatalogCapture, OpenAITransportError> = ok(Object.freeze({
      body: ascii('{"models":[{"slug":"model-alpha","visibility":"list","supported_in_api":true}]}'),
      contentType: "application/json",
      statusCode: 200,
    })),
  ) {
    this.#stream = stream;
    this.#capture = capture;
  }

  catalog(
    _cancellation: CancellationSignal,
  ): Promise<Result<OpenAICatalogCapture, OpenAITransportError>> {
    return Promise.resolve(this.#capture);
  }

  open(
    request: OpenAITransportRequest,
    _cancellation: CancellationSignal,
  ): Promise<Result<OpenAITransportStream, OpenAITransportError>> {
    this.request = request;
    return Promise.resolve(this.#stream);
  }
}

function ascii(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    assert.ok(code !== undefined && code <= 0x7f);
    bytes.push(code);
  }
  return Uint8Array.from(bytes);
}

function utf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (const character of value) {
    const code = character.codePointAt(0);
    assert.ok(code !== undefined);
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function event(type: string, fields: Readonly<Record<string, unknown>> = Object.freeze({})) {
  return "event: " + type + "\n" +
    "data: " + JSON.stringify(Object.freeze({ type, ...fields })) + "\n\n";
}

function response(status: "completed" | "in_progress") {
  return Object.freeze({ id: "response-alpha", object: "response", status });
}

function textEvents(text: string): string {
  const inProgress = Object.freeze({
    content: Object.freeze([]),
    id: "message-alpha",
    role: "assistant",
    status: "in_progress",
    type: "message",
  });
  const completed = Object.freeze({
    content: Object.freeze([Object.freeze({ annotations: Object.freeze([]), text, type: "output_text" })]),
    id: "message-alpha",
    role: "assistant",
    status: "completed",
    type: "message",
  });
  const emptyPart = Object.freeze({ annotations: Object.freeze([]), text: "", type: "output_text" });
  const completedPart = Object.freeze({ annotations: Object.freeze([]), text, type: "output_text" });
  return event("response.created", { response: response("in_progress") }) +
    event("response.in_progress", { response: response("in_progress") }) +
    event("response.output_item.added", { item: inProgress, output_index: 0 }) +
    event("response.content_part.added", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 0,
      part: emptyPart,
    }) +
    event("response.output_text.delta", {
      content_index: 0,
      delta: text,
      item_id: "message-alpha",
      output_index: 0,
    }) +
    event("response.output_text.done", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 0,
      text,
    }) +
    event("response.content_part.done", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 0,
      part: completedPart,
    }) +
    event("response.output_item.done", { item: completed, output_index: 0 }) +
    event("response.completed", { response: response("completed") });
}

function conversation(): Conversation {
  const message = Message.create(Role.User, "Inspect the project.");
  assert.ok(message.ok);
  return Conversation.empty().append(message.value);
}

function descriptor(): ToolDescriptor {
  const path = StringSchema.create(1, 4_096);
  assert.ok(path.ok);
  const input = ObjectSchema.create([{
    description: "Workspace-relative path.",
    name: "path",
    required: true,
    schema: path.value,
  }]);
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "read_file",
    "Read one bounded workspace file.",
    "read",
    input.value,
  );
  assert.ok(tool.ok);
  return tool.value;
}

test("projects only eligible authenticated catalog rows in provider order", async () => {
  const body = ascii(JSON.stringify({ models: [
    { slug: "model-alpha", visibility: "list", supported_in_api: true, extra: 1 },
    { slug: "model-hidden", visibility: "hide", supported_in_api: true },
    { slug: "model-beta", visibility: "list", supported_in_api: true },
  ] }));
  assert.deepEqual(decodeOpenAIModelCatalog(body), {
    ok: true,
    value: ["model-alpha", "model-beta"],
  });
  const transport = new FakeTransport(ok(new FakeStream([])), ok(Object.freeze({
    body,
    contentType: "application/json; charset=utf-8",
    statusCode: 200,
  })));
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(new Cancellation()), {
    ok: true,
    value: ["model-alpha", "model-beta"],
  });
});

test("rejects duplicate, malformed, empty-eligible, and extra-root catalogs", () => {
  for (const value of [
    { models: [
      { slug: MODEL, visibility: "list", supported_in_api: true },
      { slug: MODEL, visibility: "list", supported_in_api: true },
    ] },
    { models: [{ slug: "bad/value", visibility: "list", supported_in_api: true }] },
    { models: [{ slug: MODEL, visibility: "hide", supported_in_api: true }] },
    { models: [{ slug: MODEL, visibility: "list", supported_in_api: true }], extra: true },
  ]) {
    assert.equal(decodeOpenAIModelCatalog(ascii(JSON.stringify(value))).ok, false);
  }
});

test("encodes the exact stateless Responses request without opaque reasoning", async () => {
  const stream = new FakeStream([
    ok(ascii(textEvents("Done."))),
    ok(null),
  ]);
  const transport = new FakeTransport(ok(stream));
  const model = OpenAISubscriptionModel.create(
    transport,
    "Follow the owned instruction.",
    MODEL,
  );
  assert.ok(model.ok);
  const opened = await model.value.open(
    conversation(),
    new Cancellation(),
    [descriptor()],
    Object.freeze({ thinkingEffort: "medium" as const }),
  );
  assert.ok(opened.ok);
  const body = JSON.parse(transport.request?.body ?? "null") as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), [
    "include", "input", "instructions", "model", "parallel_tool_calls",
    "reasoning", "store", "stream", "tool_choice", "tools",
  ]);
  assert.deepEqual(body.reasoning, { effort: "medium", summary: "auto" });
  assert.deepEqual(body.include, []);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(JSON.stringify(body).includes("encrypted_content"), false);
  assert.deepEqual(await opened.value.read(), {
    ok: true,
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });
  assert.equal((await opened.value.read()).ok, false);
  assert.deepEqual(await opened.value.close(), { ok: true, value: undefined });
});

test("normalizes reasoning before answer and one bounded function-call batch", async () => {
  const stream = new FakeStream([ok(ascii(
    event("response.created", { response: response("in_progress") }) +
    event("response.output_item.added", { item: {
      id: "reasoning-alpha",
      type: "reasoning",
      status: "in_progress",
      summary: [],
    }, output_index: 0 }) +
    event("response.reasoning_summary_part.added", {
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
      part: { type: "summary_text", text: "" },
    }) +
    event("response.reasoning_summary_text.delta", {
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
      delta: "Checking.",
    }) +
    event("response.reasoning_summary_text.done", {
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
      text: "Checking.",
    }) +
    event("response.reasoning_summary_part.done", {
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
      part: { type: "summary_text", text: "Checking." },
    }) +
    event("response.output_item.done", { item: {
      id: "reasoning-alpha",
      type: "reasoning",
      status: "completed",
      summary: [{ type: "summary_text", text: "Checking." }],
    }, output_index: 0 }) +
    event("response.output_item.added", { item: {
      id: "function-alpha",
      type: "function_call",
      status: "in_progress",
      call_id: "call-alpha",
      name: "read_file",
      arguments: "",
    }, output_index: 1 }) +
    event("response.function_call_arguments.delta", {
      item_id: "function-alpha",
      output_index: 1,
      delta: '{"path":"AGENTS.md"}',
    }) +
    event("response.function_call_arguments.done", {
      item_id: "function-alpha",
      output_index: 1,
      name: "read_file",
      arguments: '{"path":"AGENTS.md"}',
    }) +
    event("response.output_item.done", { item: {
      id: "function-alpha",
      type: "function_call",
      status: "completed",
      call_id: "call-alpha",
      name: "read_file",
      arguments: '{"path":"AGENTS.md"}',
    }, output_index: 1 }) +
    event("response.completed", { response: response("completed") }),
  )), ok(null)]);
  const transport = new FakeTransport(ok(stream));
  const model = OpenAISubscriptionModel.create(transport, "Inspect safely.", MODEL);
  assert.ok(model.ok);
  const opened = await model.value.open(
    conversation(),
    new Cancellation(),
    [descriptor()],
    Object.freeze({ thinkingEffort: "low" as const }),
  );
  assert.ok(opened.ok);
  assert.deepEqual(await opened.value.read(), {
    ok: true,
    value: { kind: "reasoningDelta", text: "Checking." },
  });
  const completed = await opened.value.read();
  assert.ok(completed.ok && completed.value.kind === "toolCalls");
  assert.equal(completed.value.calls.at(0)?.callId, "call-alpha");
  assert.equal(completed.value.calls.at(0)?.name, "read_file");
});

test("fails closed on terminal errors, unknown events, and invalid response metadata", async () => {
  for (const wire of [
    event("response.failed"),
    event("response.unknown"),
    event("response.created") + event("response.completed", { response: { status: "failed" } }),
  ]) {
    const transport = new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)])));
    const model = OpenAISubscriptionModel.create(transport, "Inspect safely.", MODEL);
    assert.ok(model.ok);
    const opened = await model.value.open(
      conversation(),
      new Cancellation(),
      [],
      Object.freeze({ thinkingEffort: "off" as const }),
    );
    assert.ok(opened.ok);
    assert.equal((await opened.value.read()).ok, false);
  }
});

test("rejects incomplete and contradictory Responses lifecycle events", async () => {
  const created = event("response.created", { response: response("in_progress") });
  const message = {
    content: [],
    id: "message-alpha",
    role: "assistant",
    status: "in_progress",
    type: "message",
  };
  for (const wire of [
    created + event("response.completed"),
    created + event("response.output_text.delta", {
      content_index: 0,
      delta: "orphaned",
      item_id: "message-alpha",
      output_index: 0,
    }),
    created + event("response.output_item.done", { item: {
      ...message,
      status: "completed",
    }, output_index: 0 }),
    created + event("response.output_item.added", { item: message, output_index: 0 }) +
      event("response.function_call_arguments.delta", {
        delta: "{}",
        item_id: "message-alpha",
        output_index: 0,
    }),
    created + event("response.completed", {
      response: { ...response("completed"), usage: { units: -1 } },
    }),
    created + "id: retained\n" +
      "data: " + JSON.stringify({ type: "response.in_progress" }) + "\n\n",
  ]) {
    const transport = new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)])));
    const model = OpenAISubscriptionModel.create(transport, "Inspect safely.", MODEL);
    assert.ok(model.ok);
    const opened = await model.value.open(
      conversation(),
      new Cancellation(),
      [],
      Object.freeze({ thinkingEffort: "off" as const }),
    );
    assert.ok(opened.ok);
    assert.equal((await opened.value.read()).ok, false);
  }
});

test("decodes CRLF framing and a UTF-8 scalar split across transport chunks", async () => {
  const wire = utf8(textEvents("Caffè.").replaceAll("\n", "\r\n"));
  const split = wire.indexOf(0xc3);
  assert.ok(split >= 0);
  const stream = new FakeStream([
    ok(wire.slice(0, split + 1)),
    ok(wire.slice(split + 1)),
    ok(null),
  ]);
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(stream)),
    "Inspect safely.",
    MODEL,
  );
  assert.ok(model.ok);
  const opened = await model.value.open(
    conversation(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  assert.deepEqual(await opened.value.read(), {
    ok: true,
    value: { kind: "delta", text: "Caffè." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });
});

test("fails closed when the Responses stream ends before completion", async () => {
  const stream = new FakeStream([
    ok(ascii(event("response.created", { response: response("in_progress") }))),
    ok(null),
  ]);
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(stream)),
    "Inspect safely.",
    MODEL,
  );
  assert.ok(model.ok);
  const opened = await model.value.open(
    conversation(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  assert.equal((await opened.value.read()).ok, false);
});

test("rejects status and content type before exposing a model stream", async () => {
  for (const stream of [
    new FakeStream([], 401),
    new FakeStream([], 200, "application/json"),
  ]) {
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(stream)),
      "Inspect safely.",
      MODEL,
    );
    assert.ok(model.ok);
    const opened = await model.value.open(
      conversation(),
      new Cancellation(),
      [],
      Object.freeze({ thinkingEffort: "off" as const }),
    );
    assert.equal(opened.ok, false);
    assert.equal(stream.closeCalls, 1);
  }
});
