import assert from "node:assert/strict";
import test from "node:test";

import {
  Conversation,
  err,
  Message,
  ok,
  type Result,
  Role,
  StructuredObject,
  structuredValueFromUnknown,
  ToolCall,
  ToolExchange,
  ToolResult,
} from "@agent/core";
import {
  OpenCodeGoModel,
  OPENCODE_GO_LIMITS,
  OPENCODE_GO_MODEL,
  type OpenCodeGoError,
  type OpenCodeGoTransport,
  type OpenCodeGoTransportError,
  type OpenCodeGoTransportRequest,
  type OpenCodeGoTransportStream,
} from "@agent/provider-opencode-go";
import {
  AgentRuntime,
  type CancellationSignal,
  type ModelStream,
  type ModelStreamEvent,
} from "@agent/runtime";
import {
  ObjectSchema,
  LiteralStringSchema,
  StringSchema,
  TOOL_ENGINE_LIMITS,
  ToolDescriptor,
  UnionSchema,
} from "@agent/tools";

class Cancellation implements CancellationSignal {
  readonly #promise: Promise<void>;
  #resolve: () => void = () => undefined;
  #requested = false;

  constructor() {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
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

class Deferred<T> {
  readonly promise: Promise<T>;
  #resolve: (value: T) => void = () => undefined;

  constructor() {
    this.promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  resolve(value: T): void {
    this.#resolve(value);
  }
}

class FakeStream implements OpenCodeGoTransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  readonly #chunks: Result<Uint8Array | null, OpenCodeGoTransportError>[];
  closeCalls = 0;
  closeResult: Result<void, OpenCodeGoTransportError> = ok(undefined);

  constructor(
    chunks: Result<Uint8Array | null, OpenCodeGoTransportError>[],
    statusCode: number = 200,
    contentType: string | undefined = "text/event-stream; charset=utf-8",
  ) {
    this.#chunks = [...chunks];
    this.statusCode = statusCode;
    this.contentType = contentType;
  }

  async read(): Promise<Result<Uint8Array | null, OpenCodeGoTransportError>> {
    return this.#chunks.shift() ?? ok(null);
  }

  async close(): Promise<Result<void, OpenCodeGoTransportError>> {
    this.closeCalls += 1;
    return this.closeResult;
  }
}

class FakeTransport implements OpenCodeGoTransport {
  readonly #opened: Result<OpenCodeGoTransportStream, OpenCodeGoTransportError>;
  cancellation: CancellationSignal | undefined;
  request: OpenCodeGoTransportRequest | undefined;

  constructor(
    opened: Result<OpenCodeGoTransportStream, OpenCodeGoTransportError>,
  ) {
    this.#opened = opened;
  }

  async open(
    request: OpenCodeGoTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenCodeGoTransportStream, OpenCodeGoTransportError>> {
    this.request = request;
    this.cancellation = cancellation;
    return this.#opened;
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

function combine(...parts: readonly Uint8Array[]): Uint8Array {
  const bytes: number[] = [];
  for (const part of parts) {
    bytes.push(...part);
  }
  return Uint8Array.from(bytes);
}

function frame(data: string): Uint8Array {
  return ascii("data: " + data + "\n\n");
}

function completion(
  delta: Readonly<Record<string, unknown>>,
  finishReason: string | null = null,
): string {
  return JSON.stringify({
    choices: [
      {
        delta,
        finish_reason: finishReason,
        index: 0,
      },
    ],
  });
}

function conversation(content: string = "Inspect the project."): Conversation {
  const message = Message.create(Role.User, content);
  assert.ok(message.ok);
  return Conversation.empty().append(message.value);
}

function descriptor(): ToolDescriptor {
  const path = StringSchema.create(1, 4_096);
  assert.ok(path.ok);
  const input = ObjectSchema.create([
    {
      description: "Workspace-relative path.",
      name: "path",
      required: true,
      schema: path.value,
    },
  ]);
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

function literalDescriptor(): ToolDescriptor {
  const program = LiteralStringSchema.create("node");
  assert.ok(program.ok);
  const input = ObjectSchema.create([
    {
      description: "Registered program token.",
      name: "program",
      required: true,
      schema: program.value,
    },
  ]);
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "run_process",
    "Run one registered program.",
    "execute",
    input.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "program" }),
    ]),
  );
  assert.ok(tool.ok);
  return tool.value;
}

function unionDescriptor(): ToolDescriptor {
  const create = LiteralStringSchema.create("create_directory");
  const remove = LiteralStringSchema.create("remove");
  const path = StringSchema.create(1, 4_096);
  assert.ok(create.ok && remove.ok && path.ok);
  const createRequest = ObjectSchema.create([
    {
      description: "Namespace operation.",
      name: "operation",
      required: true,
      schema: create.value,
    },
    {
      description: "Workspace-relative path.",
      name: "path",
      required: true,
      schema: path.value,
    },
  ]);
  const removeRequest = ObjectSchema.create([
    {
      description: "Namespace operation.",
      name: "operation",
      required: true,
      schema: remove.value,
    },
    {
      description: "Workspace-relative path.",
      name: "path",
      required: true,
      schema: path.value,
    },
  ]);
  assert.ok(createRequest.ok && removeRequest.ok);
  const request = UnionSchema.create([
    createRequest.value,
    removeRequest.value,
  ]);
  assert.ok(request.ok);
  const approvalFields = Object.freeze([
    Object.freeze({ mode: "exact" as const, name: "request" }),
  ]);
  const input = ObjectSchema.create([
    {
      description: "Exact namespace request.",
      name: "request",
      required: true,
      schema: request.value,
    },
  ], {
    fields: approvalFields,
    maximumCodeUnits: TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits,
  });
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "manage_path",
    "Manage one workspace namespace entry.",
    "write",
    input.value,
    approvalFields,
  );
  assert.ok(tool.ok);
  return tool.value;
}

function model(
  stream: OpenCodeGoTransportStream,
): Readonly<{ model: OpenCodeGoModel; transport: FakeTransport }> {
  const transport = new FakeTransport(ok(stream));
  const created = OpenCodeGoModel.create(
    transport,
    "You are agent, one single coding agent.",
  );
  assert.ok(created.ok);
  return Object.freeze({ model: created.value, transport });
}

async function open(
  provider: OpenCodeGoModel,
  cancellation: Cancellation = new Cancellation(),
  tools: readonly ToolDescriptor[] = [],
): Promise<ModelStream<OpenCodeGoError>> {
  const opened = await provider.open(conversation(), cancellation, tools);
  assert.ok(opened.ok);
  return opened.value;
}

async function read(
  stream: ModelStream<OpenCodeGoError>,
): Promise<ModelStreamEvent> {
  const result = await stream.read();
  assert.ok(result.ok);
  return result.value;
}

test("validates construction without retaining hostile values", () => {
  const invalidInstructions = OpenCodeGoModel.create(
    new FakeTransport(err(Object.freeze({ kind: "connection" as const }))),
    "private\u0000instruction",
  );
  assert.deepEqual(invalidInstructions, {
    ok: false,
    error: { kind: "invalidInstructions" },
  });

  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, "open", {
    get(): never {
      throw new Error("private-transport-getter");
    },
  });
  const invalidTransport = OpenCodeGoModel.create(
    hostile as unknown as OpenCodeGoTransport,
    "You are agent.",
  );
  assert.deepEqual(invalidTransport, {
    ok: false,
    error: { kind: "invalidTransport" },
  });
  assert.equal(
    JSON.stringify([invalidInstructions, invalidTransport]).includes("private"),
    false,
  );
});

test("encodes the fixed model, instructions, conversation, and exact tool schema", async () => {
  const transportStream = new FakeStream([
    ok(frame(completion({ content: "done" }))),
    ok(frame(completion({}, "stop"))),
  ]);
  const fixture = model(transportStream);
  const stream = await open(fixture.model, new Cancellation(), [descriptor()]);

  assert.equal((await read(stream)).kind, "delta");
  const body = fixture.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    messages: Array<{ content: string; role: string }>;
    model: string;
    parallel_tool_calls: boolean;
    stream: boolean;
    tools: Array<{
      function: {
        name: string;
        parameters: {
          additionalProperties: boolean;
          properties: Record<string, unknown>;
        };
      };
    }>;
  };
  assert.equal(parsed.model, OPENCODE_GO_MODEL);
  assert.equal(parsed.stream, true);
  assert.equal(parsed.parallel_tool_calls, true);
  assert.deepEqual(parsed.messages.map((entry) => entry.role), ["system", "user"]);
  assert.equal(parsed.messages.at(0)?.content.includes("single coding agent"), true);
  assert.equal(parsed.messages.at(1)?.content, "Inspect the project.");
  assert.equal(parsed.tools.at(0)?.function.name, "read_file");
  assert.equal(
    parsed.tools.at(0)?.function.parameters.additionalProperties,
    false,
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(
      parsed.tools.at(0)?.function.parameters.properties ?? {},
      "path",
    ),
  );
});

test("encodes exact string literals as closed JSON Schema constants", async () => {
  const transportStream = new FakeStream([
    ok(frame(completion({ content: "done" }))),
    ok(frame(completion({}, "stop"))),
  ]);
  const fixture = model(transportStream);
  const stream = await open(
    fixture.model,
    new Cancellation(),
    [literalDescriptor()],
  );

  assert.equal((await read(stream)).kind, "delta");
  const body = fixture.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    tools: Array<{
      function: {
        parameters: {
          properties: Record<string, unknown>;
        };
      };
    }>;
  };
  assert.deepEqual(
    parsed.tools.at(0)?.function.parameters.properties.program,
    {
      const: "node",
      description: "Registered program token.",
      type: "string",
    },
  );
});

test("encodes closed discriminated unions as JSON Schema oneOf", async () => {
  const transportStream = new FakeStream([
    ok(frame(completion({ content: "done" }))),
    ok(frame(completion({}, "stop"))),
  ]);
  const fixture = model(transportStream);
  const stream = await open(
    fixture.model,
    new Cancellation(),
    [unionDescriptor()],
  );

  assert.equal((await read(stream)).kind, "delta");
  const body = fixture.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    tools: Array<{
      function: {
        parameters: {
          properties: {
            request: {
              description: string;
              oneOf: Array<{
                additionalProperties: boolean;
                properties: {
                  operation: { const: string };
                };
                required: string[];
                type: string;
              }>;
            };
          };
        };
      };
    }>;
  };
  const encoded = parsed.tools.at(0)?.function.parameters.properties.request;
  assert.equal(encoded?.description, "Exact namespace request.");
  assert.deepEqual(
    encoded?.oneOf.map((variant) => variant.properties.operation.const),
    ["create_directory", "remove"],
  );
  assert.deepEqual(
    encoded?.oneOf.map((variant) => variant.additionalProperties),
    [false, false],
  );
  assert.deepEqual(encoded?.oneOf.at(0)?.required, ["operation", "path"]);
  assert.equal(encoded?.oneOf.at(0)?.type, "object");
});

test("encodes one complete ordered tool exchange for the next model turn", async () => {
  const values = ["index.html", "script.js"].map((path, index) => {
    const input = structuredValueFromUnknown({ path });
    const output = structuredValueFromUnknown({ text: path });
    assert.ok(input.ok && input.value instanceof StructuredObject);
    assert.ok(output.ok);
    const call = ToolCall.create(
      "call-" + String(index + 1),
      "read_file",
      input.value,
    );
    assert.ok(call.ok);
    const result = ToolResult.create(
      call.value.callId,
      call.value.name,
      "success",
      output.value,
    );
    assert.ok(result.ok);
    return Object.freeze({ call: call.value, result: result.value });
  });
  const exchange = ToolExchange.create(
    undefined,
    values.map((value) => value.call),
    values.map((value) => value.result),
  );
  assert.ok(exchange.ok);
  const user = Message.create(Role.User, "Inspect both files.");
  assert.ok(user.ok);
  const history = Conversation.empty()
    .append(user.value)
    .append(exchange.value);
  const fixture = model(new FakeStream([]));

  const opened = await fixture.model.open(
    history,
    new Cancellation(),
    [descriptor()],
  );
  assert.ok(opened.ok);
  const body = fixture.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    messages: Array<Record<string, unknown>>;
  };
  assert.deepEqual(
    parsed.messages.map((entry) => entry.role),
    ["system", "user", "assistant", "tool", "tool"],
  );
  const assistant = parsed.messages.at(2);
  assert.ok(assistant !== undefined);
  assert.deepEqual(
    (assistant.tool_calls as Array<Record<string, unknown>>).map(
      (call) => call.id,
    ),
    ["call-1", "call-2"],
  );
  assert.deepEqual(
    parsed.messages.slice(3).map((entry) => entry.tool_call_id),
    ["call-1", "call-2"],
  );
});

test("drives one complete runtime turn through the concrete provider adapter", async () => {
  const fixture = model(
    new FakeStream([
      ok(frame(completion({ content: "Owned answer." }))),
      ok(frame(completion({}, "stop"))),
    ]),
  );
  const runtime = new AgentRuntime(fixture.model);
  const started = runtime.startTurn("Owned question.");
  assert.ok(started.ok);

  const delta = await runtime.nextEvent();
  assert.deepEqual(delta, {
    ok: true,
    value: { kind: "assistantDelta", text: "Owned answer.", turnId: 1 },
  });
  const prepared = await runtime.nextEvent();
  assert.ok(prepared.ok);
  assert.equal(prepared.value.kind, "turnPrepared");
  if (prepared.value.kind === "turnPrepared") {
    assert.equal(prepared.value.assistant.content, "Owned answer.");
  }

  assert.deepEqual(runtime.commitTurn(1), {
    ok: true,
    value: { kind: "committed" },
  });
  assert.deepEqual(
    runtime.conversation.entries.map((entry) =>
      entry instanceof Message ? entry.content : "unexpected tool entry"
    ),
    ["Owned question.", "Owned answer."],
  );
  assert.ok((await runtime.stop()).ok);
});

test("decodes fragmented SSE and strict multibyte UTF-8", async () => {
  const prefix = ascii(
    'data: {"choices":[{"delta":{"content":"',
  );
  const suffix = ascii(
    '"},"finish_reason":null,"index":0}]}\r\n\r\n',
  );
  const unicode = Uint8Array.from([0xf0, 0x9f, 0x8c, 0x8d]);
  const payload = combine(prefix, unicode, suffix);
  const fixture = model(
    new FakeStream([
      ok(payload.slice(0, prefix.length + 1)),
      ok(payload.slice(prefix.length + 1, prefix.length + 3)),
      ok(payload.slice(prefix.length + 3)),
      ok(frame(completion({}, "stop"))),
    ]),
  );
  const stream = await open(fixture.model);

  assert.deepEqual(await read(stream), {
    kind: "delta",
    text: "\u{1F30D}",
  });
  assert.deepEqual(await read(stream), { kind: "done" });
});

test("assembles one fragmented structured tool-call batch", async () => {
  const first = completion({
    tool_calls: [
      {
        function: { arguments: '{"path":"src/', name: "read_file" },
        id: "call-1",
        index: 0,
        type: "function",
      },
    ],
  });
  const second = completion({
    tool_calls: [
      {
        function: { arguments: 'index.ts"}' },
        index: 0,
      },
    ],
  });
  const fixture = model(
    new FakeStream([
      ok(frame(first)),
      ok(frame(second)),
      ok(frame(completion({}, "tool_calls"))),
    ]),
  );
  const stream = await open(fixture.model);
  const event = await read(stream);

  assert.equal(event.kind, "toolCalls");
  if (event.kind === "toolCalls") {
    assert.equal(event.calls.length, 1);
    assert.equal(event.calls.at(0)?.callId, "call-1");
    assert.equal(event.calls.at(0)?.name, "read_file");
    assert.equal(event.calls.at(0)?.input.get("path"), "src/index.ts");
  }
});

test("assembles multiple indexed calls as one ordered terminal event", async () => {
  const fixture = model(
    new FakeStream([
      ok(
        frame(
          completion({
            tool_calls: [
              {
                function: { arguments: '{"path":"index.html"}', name: "read_file" },
                id: "call-1",
                index: 0,
                type: "function",
              },
              {
                function: { arguments: '{"path":"script.js"}', name: "read_file" },
                id: "call-2",
                index: 1,
                type: "function",
              },
            ],
          }),
        ),
      ),
      ok(frame(completion({}, "tool_calls"))),
    ]),
  );
  const stream = await open(fixture.model);
  const event = await read(stream);

  assert.equal(event.kind, "toolCalls");
  if (event.kind === "toolCalls") {
    assert.deepEqual(
      event.calls.map((call) => [call.callId, call.input.get("path")]),
      [
        ["call-1", "index.html"],
        ["call-2", "script.js"],
      ],
    );
    assert.ok(Object.isFrozen(event.calls));
  }
});

test("rejects malformed multi-call assemblies before emitting a batch", async () => {
  const malformed: readonly (readonly Uint8Array[])[] = [
    Object.freeze([
      frame(
        completion({
          tool_calls: [
            {
              function: { arguments: "{}", name: "read_file" },
              id: "call-gap",
              index: 1,
              type: "function",
            },
          ],
        }),
      ),
    ]),
    Object.freeze([
      frame(
        completion({
          tool_calls: [
            { function: { name: "read_file" }, id: "call-1", index: 0 },
            { function: { arguments: "{}" }, index: 0 },
          ],
        }),
      ),
    ]),
    Object.freeze([
      frame(
        completion({
          tool_calls: [
            {
              function: { arguments: "{}", name: "read_file" },
              id: "call-duplicate",
              index: 0,
            },
            {
              function: { arguments: "{}", name: "read_file" },
              id: "call-duplicate",
              index: 1,
            },
          ],
        }),
      ),
      frame(completion({}, "tool_calls")),
    ]),
    Object.freeze([
      frame(
        completion({
          tool_calls: [
            {
              function: { arguments: "{", name: "read_file" },
              id: "call-json",
              index: 0,
            },
          ],
        }),
      ),
      frame(completion({}, "tool_calls")),
    ]),
  ];

  for (const chunks of malformed) {
    const stream = await open(
      model(new FakeStream(chunks.map((chunk) => ok(chunk)))).model,
    );
    const result = await stream.read();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.reason, "protocol");
    }
  }
});

test("bounds aggregate arguments across fragmented calls", async () => {
  const privateArguments = "private-arguments-" + "x".repeat(600_000);
  const stream = await open(
    model(
      new FakeStream([
        ok(
          frame(
            completion({
              tool_calls: [
                {
                  function: { arguments: privateArguments, name: "read_file" },
                  id: "call-1",
                  index: 0,
                },
              ],
            }),
          ),
        ),
        ok(
          frame(
            completion({
              tool_calls: [
                {
                  function: { arguments: privateArguments, name: "read_file" },
                  id: "call-2",
                  index: 1,
                },
              ],
            }),
          ),
        ),
      ]),
    ).model,
  );

  const result = await stream.read();
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.reason, "limit");
  }
  assert.equal(JSON.stringify(result).includes("private-arguments"), false);
});

test("fails closed on invalid UTF-8, JSON, choice count, and finish reason", async () => {
  const cases: Array<Readonly<{
    bytes: Uint8Array;
    reason: string;
  }>> = [
    { bytes: Uint8Array.from([0xff]), reason: "encoding" },
    { bytes: frame("{"), reason: "protocol" },
    {
      bytes: frame(JSON.stringify({ choices: [] })),
      reason: "protocol",
    },
    {
      bytes: frame(completion({}, "length")),
      reason: "finishReason",
    },
  ];

  for (const fixture of cases) {
    const provider = model(new FakeStream([ok(fixture.bytes)]));
    const stream = await open(provider.model);
    const result = await stream.read();
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.reason, fixture.reason);
    }
  }
});

test("rejects unexpected status and content type and observes cleanup failure", async () => {
  const status = new FakeStream([], 429);
  status.closeResult = err(Object.freeze({ kind: "connection" }));
  const statusModel = model(status).model;
  const statusResult = await statusModel.open(
    conversation("private-status-content"),
    new Cancellation(),
    [],
  );
  assert.equal(statusResult.ok, false);
  if (!statusResult.ok) {
    assert.deepEqual(statusResult.error, {
      cleanupFailed: true,
      kind: "openCodeGo",
      operation: "open",
      reason: "status",
    });
  }
  assert.equal(status.closeCalls, 1);

  const contentType = new FakeStream([], 200, "application/json");
  const contentResult = await model(contentType).model.open(
    conversation(),
    new Cancellation(),
    [],
  );
  assert.equal(contentResult.ok, false);
  if (!contentResult.ok) {
    assert.equal(contentResult.error.reason, "contentType");
  }
  assert.equal(contentType.closeCalls, 1);
  assert.equal(
    JSON.stringify([statusResult, contentResult]).includes("private-status-content"),
    false,
  );
});

test("rejects a concurrent read and closes idempotently", async () => {
  const pending = new Deferred<Result<Uint8Array | null, OpenCodeGoTransportError>>();
  let readCalls = 0;
  let closeCalls = 0;
  const transportStream: OpenCodeGoTransportStream = {
    contentType: "text/event-stream",
    statusCode: 200,
    async close(): Promise<Result<void, OpenCodeGoTransportError>> {
      closeCalls += 1;
      pending.resolve(err(Object.freeze({ kind: "closed" })));
      return ok(undefined);
    },
    read(): Promise<Result<Uint8Array | null, OpenCodeGoTransportError>> {
      readCalls += 1;
      return pending.promise;
    },
  };
  const stream = await open(model(transportStream).model);
  const first = stream.read();
  await Promise.resolve();

  const concurrent = await stream.read();
  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) {
    assert.equal(concurrent.error.reason, "concurrentRead");
  }
  assert.equal(readCalls, 1);
  assert.ok((await stream.close()).ok);
  assert.ok((await stream.close()).ok);
  assert.equal(closeCalls, 1);
  await first;
});

test("bounds SSE data without retaining model content", async () => {
  const privatePrefix = "private-model-content";
  const oversized =
    "data: " +
    privatePrefix +
    "x".repeat(OPENCODE_GO_LIMITS.sseDataCodeUnits + 1) +
    "\n\n";
  const provider = model(new FakeStream([ok(ascii(oversized))]));
  const stream = await open(provider.model);
  const result = await stream.read();

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.reason, "limit");
  }
  assert.equal(JSON.stringify(result).includes(privatePrefix), false);
});

test("honors cancellation before transport open", async () => {
  let calls = 0;
  const transport: OpenCodeGoTransport = {
    async open(): Promise<Result<OpenCodeGoTransportStream, OpenCodeGoTransportError>> {
      calls += 1;
      return err(Object.freeze({ kind: "connection" }));
    },
  };
  const created = OpenCodeGoModel.create(transport, "You are agent.");
  assert.ok(created.ok);
  const cancellation = new Cancellation();
  cancellation.request();
  const opened = await created.value.open(conversation(), cancellation, []);

  assert.equal(opened.ok, false);
  if (!opened.ok) {
    assert.equal(opened.error.reason, "cancelled");
  }
  assert.equal(calls, 0);
});
