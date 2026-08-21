import assert from "node:assert/strict";
import test from "node:test";

import { Conversation, Message, Role, err, ok, type Result } from "@agent/core";
import {
  decodeOpenAIModelCatalog,
  OPENAI_PROVIDER_LIMITS,
  OpenAIModelCatalog,
  OpenAISubscriptionModel,
  type OpenAICatalogCapture,
  type OpenAIProviderTransport,
  type OpenAITransportError,
  type OpenAITransportRequest,
  type OpenAITransportStream,
} from "@agent/provider-openai-subscription";
import type { CancellationSignal } from "@agent/runtime";
import { ListSchema, ObjectSchema, StringSchema, ToolDescriptor } from "@agent/tools";

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
  readCalls = 0;

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
    this.readCalls += 1;
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
  catalogCalls = 0;
  request: OpenAITransportRequest | undefined;

  constructor(
    stream: Result<OpenAITransportStream, OpenAITransportError>,
    capture: Result<OpenAICatalogCapture, OpenAITransportError> = ok(Object.freeze({
      body: ascii('{"models":[{"slug":"model-alpha","visibility":"list","supported_in_api":true}]}'),
      cleanupFailed: false,
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
    this.catalogCalls += 1;
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

function response(
  status: "completed" | "in_progress",
  output: readonly unknown[] = Object.freeze([]),
  usage: unknown = undefined,
) {
  return Object.freeze({
    id: "response-alpha",
    object: "response",
    output,
    status,
    ...(usage === undefined ? Object.freeze({}) : Object.freeze({ usage })),
  });
}

function textEvents(
  text: string,
  output?: readonly unknown[],
  preTerminalUsage: unknown = undefined,
  terminalUsage: unknown = undefined,
): string {
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
  return event("response.created", {
    response: response("in_progress", Object.freeze([]), preTerminalUsage),
  }) +
    event("response.in_progress", {
      response: response("in_progress", Object.freeze([]), preTerminalUsage),
    }) +
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
    event("response.completed", {
      response: response(
        "completed",
        output ?? Object.freeze([completed]),
        terminalUsage,
      ),
    });
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

function discriminatedDescriptor(): ToolDescriptor {
  const operation = StringSchema.create(4, 16);
  const path = StringSchema.create(1, 4_096);
  assert.ok(operation.ok && path.ok);
  const input = ObjectSchema.create([
    {
      description: "Exact namespace operation.",
      name: "operation",
      required: true,
      schema: operation.value,
    },
    {
      description: "Workspace-relative namespace path.",
      name: "path",
      required: true,
      schema: path.value,
    },
    {
      description: "Destination required only for move.",
      name: "destination",
      required: false,
      schema: path.value,
    },
  ], undefined, {
    field: "operation",
    variants: Object.freeze([
      Object.freeze({
        fields: Object.freeze(["operation", "path"]),
        value: "create_directory",
      }),
      Object.freeze({
        fields: Object.freeze(["operation", "path", "destination"]),
        value: "move",
      }),
      Object.freeze({
        fields: Object.freeze(["operation", "path"]),
        value: "remove",
      }),
    ]),
  });
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "manage_path",
    "Manage one workspace path.",
    "write",
    input.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "operation" }),
      Object.freeze({ mode: "exact" as const, name: "path" }),
      Object.freeze({ mode: "exact" as const, name: "destination" }),
    ]),
  );
  assert.ok(tool.ok);
  return tool.value;
}

function constrainedDescriptor(): ToolDescriptor {
  const text = StringSchema.create(0, 447, Object.freeze({
    maximumProjectionCodeUnits: 896,
    maximumUtf8Bytes: 1_024,
    rejectNul: true,
  }));
  assert.ok(text.ok);
  const texts = ListSchema.create(text.value, 1, 4, Object.freeze({
    maximumTextCodeUnits: 1_024,
    maximumTextUtf8Bytes: 2_048,
  }));
  assert.ok(texts.ok);
  const input = ObjectSchema.create([
    {
      description: "One bounded text value.",
      name: "text",
      required: true,
      schema: text.value,
    },
    {
      description: "A bounded text collection.",
      name: "texts",
      required: true,
      schema: texts.value,
    },
  ], Object.freeze({
    fields: Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "text" }),
      Object.freeze({ mode: "size" as const, name: "texts" }),
    ]),
    maximumCodeUnits: 8_192,
  }));
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "search_text",
    "Search with exact owned string constraints.",
    "read",
    input.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "text" }),
      Object.freeze({ mode: "size" as const, name: "texts" }),
    ]),
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
    cleanupFailed: false,
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

test("snapshots each catalog capture field exactly once", async () => {
  const admittedBody = ascii(JSON.stringify({ models: [
    { slug: MODEL, visibility: "list", supported_in_api: true },
  ] }));
  const replacementBody = ascii(JSON.stringify({ models: [
    { slug: "model-replaced", visibility: "list", supported_in_api: true },
  ] }));
  let bodyReads = 0;
  let cleanupReads = 0;
  let contentTypeReads = 0;
  let statusReads = 0;
  const capture = Object.create(null) as OpenAICatalogCapture;
  Object.defineProperties(capture, {
    body: {
      get(): Uint8Array {
        bodyReads += 1;
        return bodyReads === 1 ? admittedBody : replacementBody;
      },
    },
    cleanupFailed: {
      get(): boolean {
        cleanupReads += 1;
        return false;
      },
    },
    contentType: {
      get(): string {
        contentTypeReads += 1;
        return "application/json";
      },
    },
    statusCode: {
      get(): number {
        statusReads += 1;
        return 200;
      },
    },
  });
  const transport = new FakeTransport(ok(new FakeStream([])), ok(capture));
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(new Cancellation()), {
    ok: true,
    value: [MODEL],
  });
  assert.deepEqual(
    { bodyReads, cleanupReads, contentTypeReads, statusReads },
    { bodyReads: 1, cleanupReads: 1, contentTypeReads: 1, statusReads: 1 },
  );
});

test("copies catalog bytes without consulting an overridden iterator", async () => {
  const body = ascii(JSON.stringify({ models: [
    { slug: MODEL, visibility: "list", supported_in_api: true },
  ] }));
  const replacement = ascii(JSON.stringify({ models: [
    { slug: "model-replaced", visibility: "list", supported_in_api: true },
  ] }));
  let iteratorCalls = 0;
  Object.defineProperty(body, Symbol.iterator, {
    value: () => {
      iteratorCalls += 1;
      return replacement.values();
    },
  });
  const transport = new FakeTransport(ok(new FakeStream([])), ok(Object.freeze({
    body,
    cleanupFailed: false,
    contentType: "application/json",
    statusCode: 200,
  })));
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(new Cancellation()), {
    ok: true,
    value: [MODEL],
  });
  assert.equal(iteratorCalls, 0);
});

test("contains hostile catalog byte-bound access", () => {
  const body = ascii(JSON.stringify({ models: [
    { slug: MODEL, visibility: "list", supported_in_api: true },
  ] }));
  let lengthReads = 0;
  Object.defineProperty(body, "length", {
    get: () => {
      lengthReads += 1;
      throw new Error("private catalog byte-bound failure");
    },
  });
  let escaped = false;
  let decoded: unknown;
  try {
    decoded = decodeOpenAIModelCatalog(body);
  } catch (_cause: unknown) {
    escaped = true;
  }
  assert.equal(escaped, false);
  assert.deepEqual(decoded, {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "catalog",
      reason: "limit",
    },
    ok: false,
  });
  assert.equal(lengthReads, 1);
});

test("rejects a non-boolean catalog cancellation snapshot", async () => {
  const cancellation = Object.freeze({
    requested: 0,
    whenRequested: () => new Promise<void>(() => undefined),
  }) as unknown as CancellationSignal;
  const transport = new FakeTransport(ok(new FakeStream([])));
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(cancellation), {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "catalog",
      reason: "protocol",
    },
    ok: false,
  });
  assert.equal(transport.catalogCalls, 0);
});

test("preserves a catalog transport reason when cleanup also fails", async () => {
  const transport = new FakeTransport(
    ok(new FakeStream([])),
    err(Object.freeze({ cleanupFailed: true, kind: "timeout" as const })),
  );
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(new Cancellation()), {
    error: {
      cleanupFailed: true,
      kind: "openaiSubscription",
      operation: "catalog",
      reason: "transportTimeout",
    },
    ok: false,
  });
});

test("snapshots a catalog transport error exactly once", async () => {
  let cleanupReads = 0;
  let errorReads = 0;
  let kindReads = 0;
  let okReads = 0;
  const transportError = Object.create(null) as OpenAITransportError;
  Object.defineProperties(transportError, {
    cleanupFailed: {
      get(): unknown {
        cleanupReads += 1;
        return cleanupReads === 1 ? false : "invalid";
      },
    },
    kind: {
      get(): unknown {
        kindReads += 1;
        return kindReads === 1 ? "timeout" : "connection";
      },
    },
  });
  const transportResult = Object.create(null) as Result<
    OpenAICatalogCapture,
    OpenAITransportError
  >;
  Object.defineProperties(transportResult, {
    error: {
      get(): OpenAITransportError {
        errorReads += 1;
        return transportError;
      },
    },
    ok: {
      get(): boolean {
        okReads += 1;
        return false;
      },
    },
  });
  const transport = new FakeTransport(ok(new FakeStream([])), transportResult);
  const catalog = OpenAIModelCatalog.create(transport);
  assert.ok(catalog.ok);
  assert.deepEqual(await catalog.value.list(new Cancellation()), {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "catalog",
      reason: "transportTimeout",
    },
    ok: false,
  });
  assert.deepEqual(
    { cleanupReads, errorReads, kindReads, okReads },
    { cleanupReads: 1, errorReads: 1, kindReads: 1, okReads: 1 },
  );
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

test("contains malformed cancellation state before opening transport", async () => {
  const throwing = Object.create(null) as CancellationSignal;
  Object.defineProperty(throwing, "requested", {
    get(): never {
      throw new Error("private cancellation cause");
    },
  });
  const malformed = Object.freeze({
    requested: "false",
    whenRequested: () => new Promise<void>(() => undefined),
  }) as unknown as CancellationSignal;
  for (const cancellation of [throwing, malformed]) {
    const transport = new FakeTransport(ok(new FakeStream([])));
    const model = OpenAISubscriptionModel.create(
      transport,
      "Inspect safely.",
      MODEL,
    );
    assert.ok(model.ok);
    assert.deepEqual(await model.value.open(
      conversation(),
      cancellation,
      [],
      Object.freeze({ thinkingEffort: "off" as const }),
    ), {
      error: {
        cleanupFailed: false,
        kind: "openaiSubscription",
        operation: "open",
        reason: "protocol",
      },
      ok: false,
    });
    assert.equal(transport.request, undefined);
  }
});

test("snapshots a model transport error exactly once", async () => {
  let cleanupReads = 0;
  let errorReads = 0;
  let kindReads = 0;
  let okReads = 0;
  const transportError = Object.create(null) as OpenAITransportError;
  Object.defineProperties(transportError, {
    cleanupFailed: {
      get(): unknown {
        cleanupReads += 1;
        return cleanupReads === 1 ? false : "invalid";
      },
    },
    kind: {
      get(): unknown {
        kindReads += 1;
        return kindReads === 1 ? "timeout" : "connection";
      },
    },
  });
  const transportResult = Object.create(null) as Result<
    OpenAITransportStream,
    OpenAITransportError
  >;
  Object.defineProperties(transportResult, {
    error: {
      get(): OpenAITransportError {
        errorReads += 1;
        return transportError;
      },
    },
    ok: {
      get(): boolean {
        okReads += 1;
        return false;
      },
    },
  });
  const transport = new FakeTransport(transportResult);
  const model = OpenAISubscriptionModel.create(transport, "Inspect safely.", MODEL);
  assert.ok(model.ok);
  assert.deepEqual(await model.value.open(
    conversation(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" as const }),
  ), {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "open",
      reason: "transportTimeout",
    },
    ok: false,
  });
  assert.deepEqual(
    { cleanupReads, errorReads, kindReads, okReads },
    { cleanupReads: 1, errorReads: 1, kindReads: 1, okReads: 1 },
  );
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
    [descriptor(), discriminatedDescriptor()],
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
  assert.deepEqual((body.tools as readonly unknown[]).at(1), {
    description: "Manage one workspace path.",
    name: "manage_path",
    parameters: {
      oneOf: [
        {
          additionalProperties: false,
          properties: {
            operation: {
              const: "create_directory",
              description: "Exact namespace operation.",
              type: "string",
            },
            path: {
              description: "Workspace-relative namespace path.",
              maxLength: 4_096,
              minLength: 1,
              type: "string",
              "x-agent-constraints": {
                maximumCodeUnits: 4_096,
                minimumCodeUnits: 1,
                rejectNul: false,
              },
            },
          },
          required: ["operation", "path"],
          type: "object",
        },
        {
          additionalProperties: false,
          properties: {
            destination: {
              description: "Destination required only for move.",
              maxLength: 4_096,
              minLength: 1,
              type: "string",
              "x-agent-constraints": {
                maximumCodeUnits: 4_096,
                minimumCodeUnits: 1,
                rejectNul: false,
              },
            },
            operation: {
              const: "move",
              description: "Exact namespace operation.",
              type: "string",
            },
            path: {
              description: "Workspace-relative namespace path.",
              maxLength: 4_096,
              minLength: 1,
              type: "string",
              "x-agent-constraints": {
                maximumCodeUnits: 4_096,
                minimumCodeUnits: 1,
                rejectNul: false,
              },
            },
          },
          required: ["operation", "path", "destination"],
          type: "object",
        },
        {
          additionalProperties: false,
          properties: {
            operation: {
              const: "remove",
              description: "Exact namespace operation.",
              type: "string",
            },
            path: {
              description: "Workspace-relative namespace path.",
              maxLength: 4_096,
              minLength: 1,
              type: "string",
              "x-agent-constraints": {
                maximumCodeUnits: 4_096,
                minimumCodeUnits: 1,
                rejectNul: false,
              },
            },
          },
          required: ["operation", "path"],
          type: "object",
        },
      ],
    },
    strict: false,
    type: "function",
  });
  assert.deepEqual(await opened.value.read(), {
    ok: true,
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });
  assert.equal((await opened.value.read()).ok, false);
  assert.deepEqual(await opened.value.close(), { ok: true, value: undefined });
});

test("preserves exact owned string and aggregate-text constraints in tool schemas", async () => {
  const transport = new FakeTransport(ok(new FakeStream([
    ok(ascii(textEvents("Done."))),
    ok(null),
  ])));
  const model = OpenAISubscriptionModel.create(
    transport,
    "Follow the owned instruction.",
    MODEL,
  );
  assert.ok(model.ok);
  const opened = await model.value.open(
    conversation(),
    new Cancellation(),
    [constrainedDescriptor()],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  const body = JSON.parse(transport.request?.body ?? "null") as Record<string, unknown>;
  assert.deepEqual((body.tools as readonly unknown[]).at(0), {
    description: "Search with exact owned string constraints.",
    name: "search_text",
    parameters: {
      additionalProperties: false,
      properties: {
        text: {
          description: "One bounded text value.",
          maxLength: 447,
          minLength: 0,
          pattern: "^(?![\\s\\S]*\\u0000)[\\s\\S]*$",
          type: "string",
          "x-agent-constraints": {
            maximumCodeUnits: 447,
            maximumProjectionCodeUnits: 896,
            maximumUtf8Bytes: 1_024,
            minimumCodeUnits: 0,
            rejectNul: true,
          },
        },
        texts: {
          description: "A bounded text collection.",
          items: {
            maxLength: 447,
            minLength: 0,
            pattern: "^(?![\\s\\S]*\\u0000)[\\s\\S]*$",
            type: "string",
            "x-agent-constraints": {
              maximumCodeUnits: 447,
              maximumProjectionCodeUnits: 896,
              maximumUtf8Bytes: 1_024,
              minimumCodeUnits: 0,
              rejectNul: true,
            },
          },
          maxItems: 4,
          minItems: 1,
          type: "array",
          "x-agent-constraints": {
            maximumTextCodeUnits: 1_024,
            maximumTextUtf8Bytes: 2_048,
          },
        },
      },
      required: ["text", "texts"],
      type: "object",
      "x-agent-constraints": {
        projection: {
          fields: [
            { mode: "exact", name: "text" },
            { mode: "size", name: "texts" },
          ],
          maximumCodeUnits: 8_192,
        },
      },
    },
    strict: false,
    type: "function",
  });
});

test("advertises code-unit bounds for a plain string tool field", async () => {
  const transport = new FakeTransport(ok(new FakeStream([
    ok(ascii(textEvents("Done."))),
    ok(null),
  ])));
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
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  const body = JSON.parse(transport.request?.body ?? "null") as {
    readonly tools: readonly [{
      readonly parameters: {
        readonly properties: {
          readonly path: { readonly "x-agent-constraints"?: unknown };
        };
      };
    }];
  };
  assert.deepEqual(
    body.tools.at(0)?.parameters.properties.path["x-agent-constraints"],
    {
      maximumCodeUnits: 4_096,
      minimumCodeUnits: 1,
      rejectNul: false,
    },
  );
});

test("normalizes reasoning before answer and one bounded function-call batch", async () => {
  const reasoningOutput = Object.freeze({
    content: Object.freeze([Object.freeze({ type: "reasoning_text", text: "Internal." })]),
    id: "reasoning-alpha",
    type: "reasoning",
    status: "completed",
    summary: Object.freeze([Object.freeze({ type: "summary_text", text: "Checking." })]),
  });
  const functionOutput = Object.freeze({
    id: "function-alpha",
    type: "function_call",
    status: "completed",
    call_id: "call-alpha",
    name: "read_file",
    arguments: '{"path":"AGENTS.md"}',
  });
  const stream = new FakeStream([ok(ascii(
    event("response.created", { response: response("in_progress") }) +
    event("response.output_item.added", { item: {
      content: [],
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
    event("response.content_part.added", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "reasoning_text", text: "" },
    }) +
    event("response.reasoning_text.delta", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      delta: "Internal.",
    }) +
    event("response.reasoning_text.done", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      text: "Internal.",
    }) +
    event("response.content_part.done", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "reasoning_text", text: "Internal." },
    }) +
    event("response.output_item.done", { item: reasoningOutput, output_index: 0 }) +
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
      arguments: '{"path":"AGENTS.md"}',
    }) +
    event("response.output_item.done", { item: functionOutput, output_index: 1 }) +
    event("response.completed", {
      response: response("completed", Object.freeze([reasoningOutput, functionOutput])),
    }),
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
  assert.deepEqual(await opened.value.read(), {
    ok: true,
    value: { kind: "reasoningDelta", text: "Internal." },
  });
  const completed = await opened.value.read();
  assert.ok(completed.ok && completed.value.kind === "toolCalls");
  assert.equal(completed.value.calls.at(0)?.callId, "call-alpha");
  assert.equal(completed.value.calls.at(0)?.name, "read_file");
});

test("rejects pre-populated or malformed reasoning content on item addition", async () => {
  for (const content of [
    Object.freeze([Object.freeze({ type: "reasoning_text", text: "Preloaded." })]),
    Object.freeze([null]),
  ]) {
    const completed = Object.freeze({
      content: Object.freeze([]),
      id: "reasoning-alpha",
      status: "completed",
      summary: Object.freeze([]),
      type: "reasoning",
    });
    const wire = event("response.created", { response: response("in_progress") }) +
      event("response.output_item.added", { item: {
        content,
        id: "reasoning-alpha",
        status: "in_progress",
        summary: [],
        type: "reasoning",
      }, output_index: 0 }) +
      event("response.output_item.done", { item: completed, output_index: 0 }) +
      event("response.completed", {
        response: response("completed", Object.freeze([completed])),
      });
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
  }
});

test("preserves provider output-index order and rejects a reordered final projection", async () => {
  const completedCall = (id: string, callId: string, path: string) => Object.freeze({
    arguments: JSON.stringify({ path }),
    call_id: callId,
    id,
    name: "read_file",
    status: "completed",
    type: "function_call",
  });
  const added = (id: string, callId: string, outputIndex: number) => event(
    "response.output_item.added",
    {
      item: {
        arguments: "",
        call_id: callId,
        id,
        name: "read_file",
        status: "in_progress",
        type: "function_call",
      },
      output_index: outputIndex,
    },
  );
  const done = (id: string, callId: string, path: string, outputIndex: number) =>
    event("response.function_call_arguments.done", {
      arguments: JSON.stringify({ path }),
      item_id: id,
      output_index: outputIndex,
    }) + event("response.output_item.done", {
      item: completedCall(id, callId, path),
      output_index: outputIndex,
    });
  const zero = completedCall("function-zero", "call-zero", "zero.md");
  const one = completedCall("function-one", "call-one", "one.md");
  const toolEvents = (output: readonly unknown[]) =>
    event("response.created", { response: response("in_progress") }) +
    added("function-zero", "call-zero", 0) +
    added("function-one", "call-one", 1) +
    done("function-one", "call-one", "one.md", 1) +
    done("function-zero", "call-zero", "zero.md", 0) +
    event("response.completed", {
      response: response("completed", output),
    });
  const stream = new FakeStream([
    ok(ascii(toolEvents(Object.freeze([zero, one])))),
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
    [descriptor()],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  const completed = await opened.value.read();
  assert.ok(completed.ok && completed.value.kind === "toolCalls");
  assert.deepEqual(completed.value.calls.map((call) => call.callId), ["call-zero", "call-one"]);

  const reordered = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([
      ok(ascii(toolEvents(Object.freeze([one, zero])))),
      ok(null),
    ]))),
    "Inspect safely.",
    MODEL,
  );
  assert.ok(reordered.ok);
  const rejected = await reordered.value.open(
    conversation(),
    new Cancellation(),
    [descriptor()],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(rejected.ok);
  assert.equal((await rejected.value.read()).ok, false);
});

test("rejects a message whose output index follows a function call", async () => {
  const completedCall = Object.freeze({
    arguments: '{"path":"AGENTS.md"}',
    call_id: "call-alpha",
    id: "function-alpha",
    name: "read_file",
    status: "completed",
    type: "function_call",
  });
  const completedMessage = Object.freeze({
    content: Object.freeze([Object.freeze({
      annotations: Object.freeze([]),
      text: "Too late.",
      type: "output_text",
    })]),
    id: "message-alpha",
    role: "assistant",
    status: "completed",
    type: "message",
  });
  const addedCall = event("response.output_item.added", { item: {
    arguments: "",
    call_id: "call-alpha",
    id: "function-alpha",
    name: "read_file",
    status: "in_progress",
    type: "function_call",
  }, output_index: 0 });
  const addedMessage = event("response.output_item.added", { item: {
    content: [],
    id: "message-alpha",
    role: "assistant",
    status: "in_progress",
    type: "message",
  }, output_index: 1 });
  const completedEvents = event("response.function_call_arguments.done", {
    arguments: '{"path":"AGENTS.md"}',
    item_id: "function-alpha",
    output_index: 0,
  }) + event("response.output_item.done", { item: completedCall, output_index: 0 }) +
    event("response.content_part.added", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 1,
      part: { annotations: [], text: "", type: "output_text" },
    }) + event("response.output_text.delta", {
      content_index: 0,
      delta: "Too late.",
      item_id: "message-alpha",
      output_index: 1,
    }) + event("response.output_text.done", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 1,
      text: "Too late.",
    }) + event("response.content_part.done", {
      content_index: 0,
      item_id: "message-alpha",
      output_index: 1,
      part: { annotations: [], text: "Too late.", type: "output_text" },
    }) + event("response.output_item.done", { item: completedMessage, output_index: 1 }) +
    event("response.completed", {
      response: response("completed", Object.freeze([completedCall, completedMessage])),
    });
  for (const additions of [addedCall + addedMessage, addedMessage + addedCall]) {
    const wire = event("response.created", { response: response("in_progress") }) +
      additions + completedEvents;
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
      "Inspect safely.",
      MODEL,
    );
    assert.ok(model.ok);
    const opened = await model.value.open(
      conversation(),
      new Cancellation(),
      [descriptor()],
      Object.freeze({ thinkingEffort: "off" as const }),
    );
    assert.ok(opened.ok);
    assert.equal((await opened.value.read()).ok, false);
  }
});

test("rejects reasoning whose output index follows a function call", async () => {
  const addedCall = event("response.output_item.added", { item: {
    arguments: "",
    call_id: "call-alpha",
    id: "function-alpha",
    name: "read_file",
    status: "in_progress",
    type: "function_call",
  }, output_index: 0 });
  const addedReasoning = event("response.output_item.added", { item: {
    content: [],
    id: "reasoning-alpha",
    status: "in_progress",
    summary: [],
    type: "reasoning",
  }, output_index: 1 });
  const reasoningDelta = event("response.reasoning_summary_part.added", {
    item_id: "reasoning-alpha",
    output_index: 1,
    summary_index: 0,
    part: { text: "", type: "summary_text" },
  }) + event("response.reasoning_summary_text.delta", {
    delta: "Too late.",
    item_id: "reasoning-alpha",
    output_index: 1,
    summary_index: 0,
  });
  for (const additions of [addedCall + addedReasoning, addedReasoning + addedCall]) {
    const wire = event("response.created", { response: response("in_progress") }) +
      additions + reasoningDelta;
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
      "Inspect safely.",
      MODEL,
    );
    assert.ok(model.ok);
    const opened = await model.value.open(
      conversation(),
      new Cancellation(),
      [descriptor()],
      Object.freeze({ thinkingEffort: "low" as const }),
    );
    assert.ok(opened.ok);
    assert.equal((await opened.value.read()).ok, false);
  }
});

test("emits multiple messages only in output-index order", async () => {
  const added = (id: string, outputIndex: number) => event(
    "response.output_item.added",
    {
      item: {
        content: [],
        id,
        role: "assistant",
        status: "in_progress",
        type: "message",
      },
      output_index: outputIndex,
    },
  );
  const completed = (id: string, text: string) => Object.freeze({
    content: Object.freeze([Object.freeze({
      annotations: Object.freeze([]),
      text,
      type: "output_text",
    })]),
    id,
    role: "assistant",
    status: "completed",
    type: "message",
  });
  const lifecycle = (
    id: string,
    outputIndex: number,
    text: string,
    item: Readonly<Record<string, unknown>>,
  ) => event("response.content_part.added", {
    content_index: 0,
    item_id: id,
    output_index: outputIndex,
    part: { annotations: [], text: "", type: "output_text" },
  }) + event("response.output_text.delta", {
    content_index: 0,
    delta: text,
    item_id: id,
    output_index: outputIndex,
  }) + event("response.output_text.done", {
    content_index: 0,
    item_id: id,
    output_index: outputIndex,
    text,
  }) + event("response.content_part.done", {
    content_index: 0,
    item_id: id,
    output_index: outputIndex,
    part: { annotations: [], text, type: "output_text" },
  }) + event("response.output_item.done", { item, output_index: outputIndex });
  const zero = completed("message-zero", "First.");
  const one = completed("message-one", "Second.");
  const additions = added("message-one", 1) + added("message-zero", 0);
  const terminal = event("response.completed", {
    response: response("completed", Object.freeze([zero, one])),
  });
  const open = async (wire: string) => {
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
    return opened.value;
  };
  const prefix = event("response.created", { response: response("in_progress") }) + additions;
  const ordered = await open(
    prefix + lifecycle("message-zero", 0, "First.", zero) +
      lifecycle("message-one", 1, "Second.", one) + terminal,
  );
  assert.deepEqual(await ordered.read(), {
    ok: true,
    value: { kind: "delta", text: "First." },
  });
  assert.deepEqual(await ordered.read(), {
    ok: true,
    value: { kind: "delta", text: "Second." },
  });
  assert.deepEqual(await ordered.read(), { ok: true, value: { kind: "done" } });

  const reversed = await open(
    prefix + lifecycle("message-one", 1, "Second.", one) +
      lifecycle("message-zero", 0, "First.", zero) + terminal,
  );
  assert.equal((await reversed.read()).ok, false);
});

test("rejects a completed response output that omits or contradicts staged items", async () => {
  const contradictory = Object.freeze({
    content: Object.freeze([Object.freeze({
      annotations: Object.freeze([]),
      text: "Different.",
      type: "output_text",
    })]),
    id: "message-alpha",
    role: "assistant",
    status: "completed",
    type: "message",
  });
  for (const output of [Object.freeze([]), Object.freeze([contradictory])]) {
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([
        ok(ascii(textEvents("Done.", output))),
        ok(null),
      ]))),
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
      value: { kind: "delta", text: "Done." },
    });
    assert.equal((await opened.value.read()).ok, false);
  }
});

test("rejects nonempty or malformed pre-terminal response output", async () => {
  const valid = textEvents("Done.");
  const created = event("response.created", { response: response("in_progress") });
  const inProgress = event("response.in_progress", {
    response: response("in_progress"),
  });
  const nonempty = response("in_progress", Object.freeze([Object.freeze({
    arguments: "{}",
    call_id: "call-alpha",
    id: "function-alpha",
    name: "read_file",
    status: "completed",
    type: "function_call",
  })]));
  const malformed = Object.freeze({
    id: "response-alpha",
    object: "response",
    output: Object.freeze({}),
    status: "in_progress",
  });
  const cases = Object.freeze([
    event("response.created", { response: nonempty }) + valid.slice(created.length),
    valid.replace(inProgress, event("response.in_progress", { response: malformed })),
  ]);
  for (const wire of cases) {
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
  }
});

test("accepts null usage only on pre-terminal response snapshots", async () => {
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([
      ok(ascii(textEvents("Done.", undefined, null))),
      ok(null),
    ]))),
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
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });

  const rejected = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([
      ok(ascii(textEvents("Done.", undefined, undefined, null))),
      ok(null),
    ]))),
    "Inspect safely.",
    MODEL,
  );
  assert.ok(rejected.ok);
  const rejectedOpen = await rejected.value.open(
    conversation(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(rejectedOpen.ok);
  assert.deepEqual(await rejectedOpen.value.read(), {
    ok: true,
    value: { kind: "delta", text: "Done." },
  });
  assert.equal((await rejectedOpen.value.read()).ok, false);
});

test("validates trailing frames before publishing terminal completion", async () => {
  const stream = new FakeStream([
    ok(ascii(textEvents("Done.") + event("response.unknown"))),
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
    value: { kind: "delta", text: "Done." },
  });
  assert.equal((await opened.value.read()).ok, false);
});

test("rejects a nonzero index for the sole message content part", async () => {
  const wire = textEvents("Done.").replaceAll(
    '"content_index":0',
    '"content_index":7',
  );
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "read",
      reason: "protocolMessage",
    },
    ok: false,
  });
});

test("rejects completed reasoning payloads that contradict streamed parts", async () => {
  const summaryEvents = event("response.reasoning_summary_part.added", {
    item_id: "reasoning-alpha",
    output_index: 0,
    summary_index: 0,
    part: { type: "summary_text", text: "" },
  }) + event("response.reasoning_summary_text.delta", {
    item_id: "reasoning-alpha",
    output_index: 0,
    summary_index: 0,
    delta: "Checking.",
  }) + event("response.reasoning_summary_text.done", {
    item_id: "reasoning-alpha",
    output_index: 0,
    summary_index: 0,
    text: "Checking.",
  }) + event("response.reasoning_summary_part.done", {
    item_id: "reasoning-alpha",
    output_index: 0,
    summary_index: 0,
    part: { type: "summary_text", text: "Checking." },
  });
  const contentEvents = event("response.content_part.added", {
    content_index: 0,
    item_id: "reasoning-alpha",
    output_index: 0,
    part: { type: "reasoning_text", text: "" },
  }) + event("response.reasoning_text.delta", {
    content_index: 0,
    item_id: "reasoning-alpha",
    output_index: 0,
    delta: "Internal.",
  }) + event("response.reasoning_text.done", {
    content_index: 0,
    item_id: "reasoning-alpha",
    output_index: 0,
    text: "Internal.",
  }) + event("response.content_part.done", {
    content_index: 0,
    item_id: "reasoning-alpha",
    output_index: 0,
    part: { type: "reasoning_text", text: "Internal." },
  });
  const cases = Object.freeze([
    Object.freeze({
      content: "",
      final: Object.freeze({
        summary: Object.freeze([Object.freeze({ type: "summary_text", text: "Different." })]),
      }),
    }),
    Object.freeze({
      content: "",
      final: Object.freeze({ summary: Object.freeze([null]) }),
    }),
    Object.freeze({
      content: contentEvents,
      final: Object.freeze({
        content: Object.freeze([Object.freeze({ type: "reasoning_text", text: "Different." })]),
        summary: Object.freeze([Object.freeze({ type: "summary_text", text: "Checking." })]),
      }),
    }),
  ]);
  for (const candidate of cases) {
    const wire = event("response.created", { response: response("in_progress") }) +
      event("response.output_item.added", { item: {
        id: "reasoning-alpha",
        type: "reasoning",
        status: "in_progress",
        summary: [],
      }, output_index: 0 }) + summaryEvents + candidate.content +
      event("response.output_item.done", { item: {
        id: "reasoning-alpha",
        type: "reasoning",
        status: "completed",
        ...candidate.final,
      }, output_index: 0 }) +
      event("response.completed", { response: response("completed") });
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
  }
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
    created + event("response.output_item.added", { item: {
      arguments: "",
      call_id: "call-alpha",
      id: "function-alpha",
      name: "read_file",
      status: "in_progress",
      type: "function_call",
    }, output_index: 0 }) + event("response.output_item.done", { item: {
      arguments: "{}",
      call_id: "call-alpha",
      id: "function-alpha",
      name: "read_file",
      status: "completed",
      type: "function_call",
    }, output_index: 0 }) + event("response.completed", {
      response: response("completed", Object.freeze([Object.freeze({
        arguments: "{}",
        call_id: "call-alpha",
        id: "function-alpha",
        name: "read_file",
        status: "completed",
        type: "function_call",
      })])),
    }),
    created + event("response.output_item.added", { item: {
      arguments: "",
      call_id: "call-alpha",
      id: "function-alpha",
      name: "read_file",
      status: "in_progress",
      type: "function_call",
    }, output_index: 0 }) + event("response.output_item.done", { item: {
      arguments: "{}",
      call_id: "call-alpha",
      id: "function-alpha",
      name: "read_file",
      status: "completed",
      type: "function_call",
    }, output_index: 1 }) + event("response.completed", {
      response: response("completed"),
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

test("decodes Responses bytes without consulting an overridden iterator", async () => {
  const wire = ascii(textEvents("Done."));
  const replacement = ascii(event("response.unknown"));
  let iteratorCalls = 0;
  Object.defineProperty(wire, Symbol.iterator, {
    value: () => {
      iteratorCalls += 1;
      return replacement.values();
    },
  });
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([ok(wire), ok(null)]))),
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
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });
  assert.equal(iteratorCalls, 0);
});

test("decodes only the exact length-validated Responses chunk", async () => {
  const wire = ascii(textEvents("Done."));
  const admittedLength = wire.length;
  let lengthReads = 0;
  Object.defineProperty(wire, "length", {
    get: () => {
      lengthReads += 1;
      return lengthReads === 1
        ? admittedLength
        : OPENAI_PROVIDER_LIMITS.responseChunkBytes + 1;
    },
  });
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(new FakeStream([ok(wire), ok(null)]))),
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
    value: { kind: "delta", text: "Done." },
  });
  assert.deepEqual(await opened.value.read(), { ok: true, value: { kind: "done" } });
  assert.equal(lengthReads, 1);
});

test("bounds injected Responses chunks before UTF-8 decoding", async () => {
  const stream = new FakeStream([ok(new Uint8Array(
    OPENAI_PROVIDER_LIMITS.responseChunkBytes + 1,
  ))]);
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
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "read",
      reason: "limit",
    },
    ok: false,
  });
  assert.equal(stream.readCalls, 1);
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

test("closes a malformed successful transport stream before rejecting it", async () => {
  let closeCalls = 0;
  const malformed = Object.freeze({
    close: () => {
      closeCalls += 1;
      return Promise.resolve(ok(undefined));
    },
    contentType: "text/event-stream",
    read: undefined,
    statusCode: 200,
  }) as unknown as OpenAITransportStream;
  const model = OpenAISubscriptionModel.create(
    new FakeTransport(ok(malformed)),
    "Inspect safely.",
    MODEL,
  );
  assert.ok(model.ok);
  assert.deepEqual(await model.value.open(
    conversation(),
    new Cancellation(),
    [],
    Object.freeze({ thinkingEffort: "off" as const }),
  ), {
    error: {
      cleanupFailed: false,
      kind: "openaiSubscription",
      operation: "open",
      reason: "transportProtocol",
    },
    ok: false,
  });
  assert.equal(closeCalls, 1);
});

test("enforces function-call retention bounds at argument completion", async () => {
  const added = (index: number) => event("response.output_item.added", {
    item: {
      arguments: "",
      call_id: "call-" + String(index),
      id: "function-" + String(index),
      name: "read_file",
      status: "in_progress",
      type: "function_call",
    },
    output_index: index,
  });
  const argumentsDone = (index: number, argumentsValue: string) =>
    event("response.function_call_arguments.done", {
      arguments: argumentsValue,
      item_id: "function-" + String(index),
      output_index: index,
    });
  const created = event("response.created", { response: response("in_progress") });
  const retained = JSON.stringify({
    value: "x".repeat(Math.floor(OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits / 2)),
  });
  assert.ok(retained.length <= OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits);
  assert.ok(retained.length * 2 > OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits);
  const aggregateBytes = ascii(
    created + added(0) + argumentsDone(0, retained) +
      added(1) + argumentsDone(1, retained),
  );
  const aggregateChunks = Array.from(
    {
      length: Math.ceil(
        aggregateBytes.length / OPENAI_PROVIDER_LIMITS.responseChunkBytes,
      ),
    },
    (_value, index) => ok(aggregateBytes.slice(
      index * OPENAI_PROVIDER_LIMITS.responseChunkBytes,
      (index + 1) * OPENAI_PROVIDER_LIMITS.responseChunkBytes,
    )),
  );
  const aggregate = new FakeStream([
    ...aggregateChunks,
    ok(null),
  ]);
  const callCount = new FakeStream([
    ok(ascii(created + Array.from(
      { length: OPENAI_PROVIDER_LIMITS.toolCallsPerBatch + 1 },
      (_value, index) => added(index) + argumentsDone(index, "{}"),
    ).join(""))),
    ok(null),
  ]);
  for (const [stream, expectedReads] of [
    [aggregate, aggregateChunks.length],
    [callCount, 1],
  ] as const) {
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
    assert.equal(stream.readCalls, expectedReads);
  }
});

test("rejects provider reasoning when thinking effort is off", async () => {
  const created = event("response.created", { response: response("in_progress") });
  const added = event("response.output_item.added", { item: {
    content: [],
    id: "reasoning-alpha",
    status: "in_progress",
    summary: [],
    type: "reasoning",
  }, output_index: 0 });
  const completedSummary = Object.freeze({
    content: Object.freeze([]),
    id: "reasoning-alpha",
    status: "completed",
    summary: Object.freeze([Object.freeze({ type: "summary_text", text: "Hidden." })]),
    type: "reasoning",
  });
  const summary = created + added +
    event("response.reasoning_summary_part.added", {
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "summary_text", text: "" },
      summary_index: 0,
    }) +
    event("response.reasoning_summary_text.delta", {
      delta: "Hidden.",
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
    }) +
    event("response.reasoning_summary_text.done", {
      item_id: "reasoning-alpha",
      output_index: 0,
      summary_index: 0,
      text: "Hidden.",
    }) +
    event("response.reasoning_summary_part.done", {
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "summary_text", text: "Hidden." },
      summary_index: 0,
    }) +
    event("response.output_item.done", { item: completedSummary, output_index: 0 }) +
    event("response.completed", {
      response: response("completed", Object.freeze([completedSummary])),
    });
  const completedContent = Object.freeze({
    content: Object.freeze([Object.freeze({ type: "reasoning_text", text: "Hidden." })]),
    id: "reasoning-alpha",
    status: "completed",
    summary: Object.freeze([]),
    type: "reasoning",
  });
  const content = created + added +
    event("response.content_part.added", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "reasoning_text", text: "" },
    }) +
    event("response.reasoning_text.delta", {
      content_index: 0,
      delta: "Hidden.",
      item_id: "reasoning-alpha",
      output_index: 0,
    }) +
    event("response.reasoning_text.done", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      text: "Hidden.",
    }) +
    event("response.content_part.done", {
      content_index: 0,
      item_id: "reasoning-alpha",
      output_index: 0,
      part: { type: "reasoning_text", text: "Hidden." },
    }) +
    event("response.output_item.done", { item: completedContent, output_index: 0 }) +
    event("response.completed", {
      response: response("completed", Object.freeze([completedContent])),
    });
  for (const wire of [summary, content]) {
    const model = OpenAISubscriptionModel.create(
      new FakeTransport(ok(new FakeStream([ok(ascii(wire)), ok(null)]))),
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
      error: {
        cleanupFailed: false,
        kind: "openaiSubscription",
        operation: "read",
        reason: "protocolMessage",
      },
      ok: false,
    });
  }
});
