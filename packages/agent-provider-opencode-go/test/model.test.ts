import assert from "node:assert/strict";
import test from "node:test";

import {
  Conversation,
  err,
  Message,
  ok,
  type Result,
  Role,
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
  StringSchema,
  ToolDescriptor,
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
  assert.equal(parsed.parallel_tool_calls, false);
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

test("assembles one fragmented structured tool call", async () => {
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

  assert.equal(event.kind, "toolCall");
  if (event.kind === "toolCall") {
    assert.equal(event.callId, "call-1");
    assert.equal(event.name, "read_file");
    assert.equal(event.input.get("path"), "src/index.ts");
  }
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
