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
  OllamaCloudModel,
  OLLAMA_CLOUD_LIMITS,
  type OllamaCloudError,
  type OllamaCloudTransport,
  type OllamaCloudTransportError,
  type OllamaCloudTransportRequest,
  type OllamaCloudTransportStream,
} from "@agent/provider-ollama-cloud";
import type {
  CancellationSignal,
  ModelStream,
  ModelStreamEvent,
  ThinkingEffort,
} from "@agent/runtime";
import {
  ObjectSchema,
  StringSchema,
  ToolDescriptor,
} from "@agent/tools";

const MODEL = "qwen3-coder:480b-cloud";

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

class FakeStream implements OllamaCloudTransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  readonly #chunks: Result<Uint8Array | null, OllamaCloudTransportError>[];
  closeCalls = 0;
  closeResult: Result<void, OllamaCloudTransportError> = ok(undefined);

  constructor(
    chunks: Result<Uint8Array | null, OllamaCloudTransportError>[],
    statusCode: number = 200,
    contentType: string | undefined = "application/json",
  ) {
    this.#chunks = [...chunks];
    this.statusCode = statusCode;
    this.contentType = contentType;
  }

  async read(): Promise<Result<Uint8Array | null, OllamaCloudTransportError>> {
    return this.#chunks.shift() ?? ok(null);
  }

  async close(): Promise<Result<void, OllamaCloudTransportError>> {
    this.closeCalls += 1;
    return this.closeResult;
  }
}

class FakeTransport implements OllamaCloudTransport {
  readonly #opened: Result<
    OllamaCloudTransportStream,
    OllamaCloudTransportError
  >;
  cancellation: CancellationSignal | undefined;
  request: OllamaCloudTransportRequest | undefined;

  constructor(
    opened: Result<OllamaCloudTransportStream, OllamaCloudTransportError>,
  ) {
    this.#opened = opened;
  }

  async open(
    request: OllamaCloudTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OllamaCloudTransportStream, OllamaCloudTransportError>> {
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

function line(value: Readonly<Record<string, unknown>>): Uint8Array {
  return ascii(JSON.stringify(value) + "\n");
}

function response(
  message: Readonly<Record<string, unknown>>,
  done: boolean = false,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    created_at: "2026-08-16T00:00:00Z",
    done,
    model: MODEL,
    message: Object.freeze({ role: "assistant", ...message }),
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

function namespaceDescriptor(): ToolDescriptor {
  const operation = StringSchema.create(4, 16);
  const path = StringSchema.create(1, 512);
  assert.ok(operation.ok && path.ok);
  const input = ObjectSchema.create(
    [
      {
        description: "Exact operation: create_directory, move, or remove.",
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
        description:
          "Absent workspace-relative destination path; required only for move.",
        name: "destination",
        required: false,
        schema: path.value,
      },
    ],
    undefined,
    {
      field: "operation",
      variants: [
        { fields: ["operation", "path"], value: "create_directory" },
        {
          fields: ["operation", "path", "destination"],
          value: "move",
        },
        { fields: ["operation", "path"], value: "remove" },
      ],
    },
  );
  assert.ok(input.ok);
  const tool = ToolDescriptor.create(
    "manage_path",
    "Manage one exact workspace namespace path.",
    "write",
    input.value,
    [
      { mode: "exact", name: "operation" },
      { mode: "exact", name: "path" },
      { mode: "exact", name: "destination" },
    ],
  );
  assert.ok(tool.ok);
  return tool.value;
}

function fixture(stream: OllamaCloudTransportStream): Readonly<{
  model: OllamaCloudModel;
  transport: FakeTransport;
}> {
  const transport = new FakeTransport(ok(stream));
  const created = OllamaCloudModel.create(
    transport,
    "Use the available tools to complete the request.",
    MODEL,
  );
  assert.ok(created.ok);
  return Object.freeze({ model: created.value, transport });
}

async function open(
  model: OllamaCloudModel,
  tools: readonly ToolDescriptor[] = [],
  thinkingEffort: ThinkingEffort = "off",
): Promise<ModelStream<OllamaCloudError>> {
  const opened = await model.open(
    conversation(),
    new Cancellation(),
    tools,
    Object.freeze({ thinkingEffort }),
  );
  assert.ok(opened.ok);
  return opened.value;
}

async function read(
  stream: ModelStream<OllamaCloudError>,
): Promise<ModelStreamEvent> {
  const value = await stream.read();
  assert.ok(value.ok);
  return value.value;
}

test("encodes the exact native Ollama chat request and owned tool schema", async () => {
  const provider = fixture(
    new FakeStream([ok(line(response({ content: "done" }, true)))]),
  );
  const stream = await open(provider.model, [descriptor()]);
  assert.deepEqual(await read(stream), { kind: "delta", text: "done" });
  assert.deepEqual(await read(stream), { kind: "done" });

  const body = provider.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    messages: Array<Record<string, unknown>>;
    model: string;
    stream: boolean;
    think: boolean;
    tools: Array<{
      function: {
        description: string;
        name: string;
        parameters: Record<string, unknown>;
      };
      type: string;
    }>;
  };
  assert.equal(parsed.model, MODEL);
  assert.equal(parsed.stream, true);
  assert.equal(parsed.think, false);
  assert.deepEqual(
    parsed.messages.map((message) => message.role),
    ["system", "user"],
  );
  assert.deepEqual(parsed.tools, [
    {
      function: {
        description: "Read one bounded workspace file.",
        name: "read_file",
        parameters: {
          additionalProperties: false,
          properties: {
            path: {
              description: "Workspace-relative path.",
              maxLength: 4_096,
              minLength: 1,
              type: "string",
            },
          },
          required: ["path"],
          type: "object",
        },
      },
      type: "function",
    },
  ]);
});

test("rejects every malformed thinking-effort option before transport", async () => {
  for (const options of [
    null,
    Object.freeze({}),
    Object.freeze({ thinking: "medium" }),
    Object.freeze({ thinkingEffort: "live" }),
    Object.freeze({ thinkingEffort: "max" }),
    Object.freeze({ thinkingEffort: true }),
    Object.freeze({ extra: true, thinkingEffort: "medium" }),
  ]) {
    const provider = fixture(new FakeStream([]));
    const opened = await provider.model.open(
      conversation(),
      new Cancellation(),
      Object.freeze([]),
      options as never,
    );

    assert.equal(opened.ok, false);
    if (!opened.ok) assert.equal(opened.error.reason, "request");
    assert.equal(provider.transport.request, undefined);
  }
});

test("captures one thinking-effort accessor value for the native request", async () => {
  let reads = 0;
  const options = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(options, "thinkingEffort", {
    enumerable: true,
    get(): unknown {
      reads += 1;
      return reads === 1 ? "off" : "max";
    },
  });
  const provider = fixture(new FakeStream([]));

  const opened = await provider.model.open(
    conversation(),
    new Cancellation(),
    Object.freeze([]),
    options as never,
  );

  assert.ok(opened.ok);
  assert.equal(reads, 1);
  const body = provider.transport.request?.body;
  assert.ok(body !== undefined);
  assert.equal((JSON.parse(body) as { think?: unknown }).think, false);
});

test("projects a discriminated tool as one flat object without wire combinators", async () => {
  const provider = fixture(
    new FakeStream([ok(line(response({ content: "done" }, true)))]),
  );
  const stream = await open(provider.model, [namespaceDescriptor()]);
  assert.deepEqual(await read(stream), { kind: "delta", text: "done" });
  assert.deepEqual(await read(stream), { kind: "done" });

  const body = provider.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as {
    tools: Array<{
      function: { parameters: Record<string, unknown> };
    }>;
  };
  assert.deepEqual(parsed.tools.at(0)?.function.parameters, {
    additionalProperties: false,
    properties: {
      destination: {
        description:
          "Absent workspace-relative destination path; required only for move.",
        maxLength: 512,
        minLength: 1,
        type: "string",
      },
      operation: {
        description: "Exact operation: create_directory, move, or remove.",
        maxLength: 16,
        minLength: 4,
        type: "string",
      },
      path: {
        description: "Workspace-relative namespace path.",
        maxLength: 512,
        minLength: 1,
        type: "string",
      },
    },
    required: ["operation", "path"],
    type: "object",
  });
  assert.equal(body.includes('"request"'), false);
  assert.equal(body.includes('"oneOf"'), false);
});

test("decodes fragmented NDJSON and strict multibyte UTF-8", async () => {
  const prefix = ascii(
    JSON.stringify(response({ content: "Owned " })).slice(0, -3),
  );
  const unicode = Uint8Array.from([0xf0, 0x9f, 0x8c, 0x8d]);
  const suffix = ascii('"}}\n');
  const provider = fixture(
    new FakeStream([
      ok(prefix),
      ok(unicode.slice(0, 2)),
      ok(unicode.slice(2)),
      ok(suffix),
      ok(line(response({ content: "" }, true))),
    ]),
  );
  const stream = await open(provider.model);

  assert.deepEqual(await read(stream), {
    kind: "delta",
    text: "Owned \u{1F30D}",
  });
  assert.deepEqual(await read(stream), { kind: "done" });
});

test("maps native tool calls to deterministic local call identities", async () => {
  const provider = fixture(
    new FakeStream([
      ok(line(response({
        content: "",
        tool_calls: [
          {
            function: {
              arguments: { path: "index.html" },
              index: 0,
              name: "read_file",
            },
            type: "function",
          },
          {
            function: { arguments: { path: "src/index.ts" }, name: "read_file" },
          },
        ],
      }, true))),
    ]),
  );
  const event = await read(await open(provider.model, [descriptor()]));

  assert.equal(event.kind, "toolCalls");
  if (event.kind === "toolCalls") {
    assert.deepEqual(
      event.calls.map((call) => [call.callId, call.name, call.input.get("path")]),
      [
        ["ollama-call-1", "read_file", "index.html"],
        ["ollama-call-2", "read_file", "src/index.ts"],
      ],
    );
  }
});

test("encodes a completed exchange with native assistant and tool messages", async () => {
  const input = structuredValueFromUnknown({ path: "index.html" });
  const output = structuredValueFromUnknown({ text: "owned" });
  assert.ok(input.ok && input.value instanceof StructuredObject);
  assert.ok(output.ok);
  const call = ToolCall.create("ollama-call-1", "read_file", input.value);
  assert.ok(call.ok);
  const result = ToolResult.create(
    call.value.callId,
    call.value.name,
    "success",
    output.value,
  );
  assert.ok(result.ok);
  const exchange = ToolExchange.create(
    undefined,
    [call.value],
    [result.value],
    "inspect the file before replying",
  );
  assert.ok(exchange.ok);
  const history = conversation("Inspect the file.").append(exchange.value);
  const provider = fixture(new FakeStream([]));

  const opened = await provider.model.open(
    history,
    new Cancellation(),
    [descriptor()],
  );
  assert.ok(opened.ok);
  const body = provider.transport.request?.body;
  assert.ok(body !== undefined);
  const parsed = JSON.parse(body) as { messages: Array<Record<string, unknown>> };
  assert.deepEqual(
    parsed.messages.map((message) => message.role),
    ["system", "user", "assistant", "tool"],
  );
  assert.deepEqual(parsed.messages.at(2), {
    content: "",
    role: "assistant",
    thinking: "inspect the file before replying",
    tool_calls: [
      {
        function: {
          arguments: { path: "index.html" },
          index: 0,
          name: "read_file",
        },
        type: "function",
      },
    ],
  });
  assert.deepEqual(parsed.messages.at(3), {
    content: JSON.stringify({ output: { text: "owned" }, status: "success" }),
    role: "tool",
    tool_name: "read_file",
  });
  assert.equal("tool_call_id" in (parsed.messages.at(3) ?? {}), false);
});

test("encodes settled final reasoning separately in selected-path history", async () => {
  const assistant = Message.create(
    Role.Assistant,
    "answer",
    "settled reasoning",
  );
  assert.ok(assistant.ok);
  const history = conversation("Question").append(assistant.value);
  const provider = fixture(new FakeStream([]));

  const opened = await provider.model.open(
    history,
    new Cancellation(),
    Object.freeze([]),
    Object.freeze({ thinkingEffort: "off" as const }),
  );
  assert.ok(opened.ok);
  const parsed = JSON.parse(provider.transport.request?.body ?? "{}") as {
    messages?: Array<Record<string, unknown>>;
  };
  assert.deepEqual(parsed.messages?.at(-1), {
    content: "answer",
    role: "assistant",
    thinking: "settled reasoning",
  });
});

test("normalizes absent, null, and empty native tool-call contributions", async () => {
  const provider = fixture(
    new FakeStream([
      ok(line(response({ content: "", tool_calls: [] }))),
      ok(line(response({ content: "", tool_calls: null }))),
      ok(line(response({ content: "" }))),
      ok(line(response({
        content: "",
        tool_calls: [
          {
            function: {
              arguments: { path: "index.html" },
              index: 0,
              name: "read_file",
            },
            type: "function",
          },
        ],
      }))),
      ok(line(response({ content: "", tool_calls: [] }, true))),
    ]),
  );

  const event = await read(await open(provider.model, [descriptor()]));
  assert.equal(event.kind, "toolCalls");
  if (event.kind === "toolCalls") {
    assert.deepEqual(
      event.calls.map((call) => [call.callId, call.name, call.input.get("path")]),
      [["ollama-call-1", "read_file", "index.html"]],
    );
  }
});

test("settles validated native contributions on a clean stream end", async () => {
  const toolStream = await open(
    fixture(new FakeStream([
      ok(line(response({
        content: "",
        tool_calls: [{
          function: {
            arguments: { path: "index.html" },
            index: 0,
            name: "read_file",
          },
          type: "function",
        }],
      }))),
    ])).model,
    [descriptor()],
  );
  const toolEvent = await read(toolStream);
  assert.equal(toolEvent.kind, "toolCalls");
  if (toolEvent.kind === "toolCalls") {
    assert.deepEqual(
      toolEvent.calls.map((call) => [call.callId, call.name, call.input.get("path")]),
      [["ollama-call-1", "read_file", "index.html"]],
    );
  }

  const textStream = await open(
    fixture(new FakeStream([
      ok(line(response({ content: "complete response" }))),
    ])).model,
  );
  assert.deepEqual(await read(textStream), {
    kind: "delta",
    text: "complete response",
  });
  assert.deepEqual(await read(textStream), { kind: "done" });
});

test("validates finish metadata before accepting native contributions", async () => {
  for (const doneReason of ["length", "stop"] as const) {
    const stream = await open(
      fixture(new FakeStream([
        ok(line({
          ...response({ content: "PRIVATE_SECRET" }),
          done_reason: doneReason,
        })),
      ])).model,
    );
    const result = await stream.read();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.reason, "finishReason");
    assert.equal(JSON.stringify(result).includes("PRIVATE_SECRET"), false);
  }

  const terminal = await open(
    fixture(new FakeStream([
      ok(line({
        ...response({ content: "complete response" }, true),
        done_reason: "stop",
      })),
    ])).model,
  );
  assert.deepEqual(await read(terminal), {
    kind: "delta",
    text: "complete response",
  });
  assert.deepEqual(await read(terminal), { kind: "done" });
});

test("does not settle an empty or abruptly failed native stream", async () => {
  const empty = await open(fixture(new FakeStream([])).model);
  const emptyResult = await empty.read();
  assert.equal(emptyResult.ok, false);
  if (!emptyResult.ok) assert.equal(emptyResult.error.reason, "protocolTerminal");

  const interrupted = await open(
    fixture(new FakeStream([
      ok(line(response({
        content: "",
        tool_calls: [{
          function: { arguments: { path: "index.html" }, name: "read_file" },
          type: "function",
        }],
      }))),
      err(Object.freeze({ kind: "connection" as const })),
    ])).model,
    [descriptor()],
  );
  const interruptedResult = await interrupted.read();
  assert.equal(interruptedResult.ok, false);
  if (!interruptedResult.ok) {
    assert.equal(interruptedResult.error.reason, "transportConnection");
  }
});

test("terminalizes every admitted read failure after a valid contribution", async () => {
  const cases = [
    Object.freeze({
      chunks: [
        ok(line(response({ content: "accepted response" }))),
        err(Object.freeze({ kind: "connection" as const })),
        ok(null),
      ],
      reason: "transportConnection",
    }),
    Object.freeze({
      chunks: [
        ok(line(response({ content: "accepted response" }))),
        ok(Uint8Array.from([0xe2])),
        ok(null),
      ],
      reason: "encoding",
    }),
    Object.freeze({
      chunks: [
        ok(line(response({ content: "accepted response" }))),
        ok(ascii("\n")),
        ok(null),
      ],
      reason: "protocolFraming",
    }),
  ] as const;

  for (const item of cases) {
    const stream = await open(fixture(new FakeStream([...item.chunks])).model);
    assert.deepEqual(await read(stream), {
      kind: "delta",
      text: "accepted response",
    });

    const rejected = await stream.read();
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.error.reason, item.reason);

    const terminal = await stream.read();
    assert.equal(terminal.ok, false);
    if (!terminal.ok) {
      assert.equal(terminal.error.reason, "protocolTerminal");
    }
  }
});

test("classifies malformed native response phases without retaining content", async () => {
  const cases = [
    Object.freeze({
      bytes: ascii("{\n"),
      reason: "protocolEnvelope",
    }),
    Object.freeze({
      bytes: line({ ...response({ content: "" }, true), model: "other" }),
      reason: "protocolEnvelope",
    }),
    Object.freeze({
      bytes: line(response({ content: null }, true)),
      reason: "protocolMessage",
    }),
    Object.freeze({
      bytes: line(response({ content: "", thinking: { secret: "PRIVATE_SECRET" } }, true)),
      reason: "protocolMessage",
    }),
    Object.freeze({
      bytes: line(response({ content: "", tool_calls: "PRIVATE_SECRET" }, true)),
      reason: "protocolToolCall",
    }),
    Object.freeze({
      bytes: line(response({
        content: "",
        tool_calls: [{
          function: { arguments: { path: "index.html" }, name: "read_file" },
          type: "other",
        }],
      }, true)),
      reason: "protocolToolCall",
    }),
    Object.freeze({
      bytes: line(response({
        content: "",
        tool_calls: [{
          function: {
            arguments: { path: "index.html" },
            index: 1,
            name: "read_file",
          },
          type: "function",
        }],
      }, true)),
      reason: "protocolToolCall",
    }),
    Object.freeze({
      bytes: line(response({
        content: "",
        tool_calls: [
          {
            function: {
              arguments: { path: "index.html" },
              index: 0,
              name: "read_file",
            },
            type: "function",
          },
          {
            function: {
              arguments: { path: "src/index.ts" },
              index: 0,
              name: "read_file",
            },
            type: "function",
          },
        ],
      }, true)),
      reason: "protocolToolCall",
    }),
    Object.freeze({
      bytes: line(response({
        content: "",
        tool_calls: [{
          function: { arguments: "PRIVATE_SECRET", name: "read_file" },
          type: "function",
        }],
      }, true)),
      reason: "protocolToolCall",
    }),
    Object.freeze({
      bytes: line({ ...response({ content: "" }, true), done_reason: "length" }),
      reason: "finishReason",
    }),
  ] as const;

  for (const item of cases) {
    const stream = await open(fixture(new FakeStream([ok(item.bytes)])).model);
    const result = await stream.read();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.reason, item.reason);
    assert.equal(JSON.stringify(result).includes("PRIVATE_SECRET"), false);
  }
});

test("does not retain thinking from a rejected native record", async () => {
  const stream = await open(
    fixture(new FakeStream([
      ok(line(response({
        content: "",
        thinking: "PRIVATE_SECRET",
        tool_calls: "malformed",
      }))),
    ])).model,
    [descriptor()],
    "high",
  );

  const rejected = await stream.read();
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.reason, "protocolToolCall");

  const ended = await stream.read();
  assert.equal(ended.ok, false);
  if (!ended.ok) assert.equal(ended.error.reason, "protocolTerminal");
  assert.equal(JSON.stringify([rejected, ended]).includes("PRIVATE_SECRET"), false);
});

test("terminalizes a partially rejected native batch without retaining calls", async () => {
  const stream = await open(
    fixture(new FakeStream([
      ok(line(response({
        content: "",
        tool_calls: [
          {
            function: { arguments: { path: "private" }, name: "read_file" },
            type: "function",
          },
          {
            function: { arguments: { path: "ignored" }, name: "read_file" },
            type: "malformed",
          },
        ],
      }))),
      ok(line(response({
        content: "",
        tool_calls: [{
          function: { arguments: { path: "index.html" }, name: "read_file" },
          type: "function",
        }],
      }, true))),
    ])).model,
    [descriptor()],
  );

  const rejected = await stream.read();
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.reason, "protocolToolCall");

  const ended = await stream.read();
  assert.equal(ended.ok, false);
  if (!ended.ok) assert.equal(ended.error.reason, "protocolTerminal");
  assert.equal(
    JSON.stringify([rejected, ended]).includes("private"),
    false,
  );
  assert.equal(
    JSON.stringify([rejected, ended]).includes("index.html"),
    false,
  );
});

test("does not settle after a rejected record follows a valid contribution", async () => {
  const stream = await open(
    fixture(new FakeStream([
      ok(line(response({ content: "accepted response" }))),
      ok(line(response({ content: "", tool_calls: "malformed" }))),
    ])).model,
    [descriptor()],
  );

  assert.deepEqual(await read(stream), {
    kind: "delta",
    text: "accepted response",
  });

  const rejected = await stream.read();
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.reason, "protocolToolCall");

  const ended = await stream.read();
  assert.equal(ended.ok, false);
  if (!ended.ok) assert.equal(ended.error.reason, "protocolTerminal");
});

test("discards bounded thinking without exposing it as assistant text", async () => {
  const stream = await open(
    fixture(new FakeStream([
      ok(line(response({ content: "", thinking: "private reasoning" }))),
      ok(line(response({ content: "answer" }, true))),
    ])).model,
  );

  assert.deepEqual(await read(stream), { kind: "delta", text: "answer" });
  assert.deepEqual(await read(stream), { kind: "done" });
});

test("encodes every exact native thinking effort without fallback", async () => {
  for (const [effort, expected] of [
    ["off", false],
    ["low", "low"],
    ["medium", "medium"],
    ["high", "high"],
  ] as const) {
    const provider = fixture(
      new FakeStream([ok(line(response({ content: "answer" }, true)))]),
    );
    const stream = await open(provider.model, [], effort);
    assert.equal(
      (JSON.parse(provider.transport.request?.body ?? "{}") as {
        think?: unknown;
      }).think,
      expected,
    );
    assert.deepEqual(await read(stream), { kind: "delta", text: "answer" });
    assert.deepEqual(await read(stream), { kind: "done" });
  }
});

test("emits native thinking for an explicit enabled effort", async () => {
  const provider = fixture(
    new FakeStream([
      ok(line(response({ content: "", thinking: "private reasoning" }))),
      ok(line(response({ content: "answer" }, true))),
    ]),
  );
  const stream = await open(provider.model, [], "medium");

  assert.equal(
    (JSON.parse(provider.transport.request?.body ?? "{}") as { think?: unknown })
      .think,
    "medium",
  );
  assert.deepEqual(await read(stream), {
    kind: "reasoningDelta",
    text: "private reasoning",
  });
  assert.deepEqual(await read(stream), { kind: "delta", text: "answer" });
  assert.deepEqual(await read(stream), { kind: "done" });
});

test("rejects late native thinking without exposing the rejected record", async () => {
  const stream = await open(
    fixture(new FakeStream([
      ok(line(response({ content: "answer" }))),
      ok(line(response({ content: "", thinking: "PRIVATE_LATE" }, true))),
    ])).model,
    [],
    "high",
  );

  assert.deepEqual(await read(stream), { kind: "delta", text: "answer" });
  const rejected = await stream.read();
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.reason, "protocolMessage");
  assert.equal(JSON.stringify(rejected).includes("PRIVATE_LATE"), false);
});

test("classifies non-success statuses while observing cleanup", async () => {
  const cases = [
    Object.freeze({ reason: "statusRequest", statusCode: 400 }),
    Object.freeze({ reason: "statusRejected", statusCode: 401 }),
    Object.freeze({ reason: "statusRejected", statusCode: 402 }),
    Object.freeze({ reason: "statusRejected", statusCode: 403 }),
    Object.freeze({ reason: "statusRejected", statusCode: 404 }),
    Object.freeze({ reason: "statusTimeout", statusCode: 408 }),
    Object.freeze({ reason: "statusLimit", statusCode: 413 }),
    Object.freeze({ reason: "statusRequest", statusCode: 418 }),
    Object.freeze({ reason: "statusLimit", statusCode: 429 }),
    Object.freeze({ reason: "statusConnectivity", statusCode: 500 }),
    Object.freeze({ reason: "statusConnectivity", statusCode: 502 }),
    Object.freeze({ reason: "statusConnectivity", statusCode: 503 }),
    Object.freeze({ reason: "statusTimeout", statusCode: 504 }),
    Object.freeze({ reason: "statusProtocol", statusCode: 302 }),
  ] as const;

  for (const item of cases) {
    const status = new FakeStream([], item.statusCode);
    status.closeResult = err(Object.freeze({ kind: "connection" }));
    const statusResult = await fixture(status).model.open(
      conversation("private-status-content"),
      new Cancellation(),
      [],
    );
    assert.equal(statusResult.ok, false);
    if (!statusResult.ok) {
      assert.deepEqual(statusResult.error, {
        cleanupFailed: true,
        kind: "ollamaCloud",
        operation: "open",
        reason: item.reason,
      });
    }
    assert.equal(status.closeCalls, 1);
    assert.equal(
      JSON.stringify(statusResult).includes("private-status-content"),
      false,
    );
  }

  const contentType = new FakeStream([], 200, "application/x-ndjson");
  const contentResult = await fixture(contentType).model.open(
    conversation(),
    new Cancellation(),
    [],
  );
  assert.equal(contentResult.ok, false);
  if (!contentResult.ok) assert.equal(contentResult.error.reason, "contentType");
  assert.equal(contentType.closeCalls, 1);
  assert.equal(
    JSON.stringify(contentResult).includes("private-status-content"),
    false,
  );
});

test("rejects invalid UTF-8", async () => {
  const invalid = await open(
    fixture(new FakeStream([ok(Uint8Array.from([0xff]))])).model,
  );
  const invalidResult = await invalid.read();
  assert.equal(invalidResult.ok, false);
  if (!invalidResult.ok) assert.equal(invalidResult.error.reason, "encoding");
});

test("classifies malformed NDJSON framing without retaining content", async () => {
  const stream = await open(
    fixture(new FakeStream([ok(ascii("\n"))])).model,
  );
  const result = await stream.read();

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.reason, "protocolFraming");
});

test("bounds one NDJSON line without retaining provider content", async () => {
  const privatePrefix = "private-model-content";
  const oversized =
    privatePrefix + "x".repeat(OLLAMA_CLOUD_LIMITS.ndjsonLineCodeUnits + 1) + "\n";
  const stream = await open(
    fixture(new FakeStream([ok(ascii(oversized))])).model,
  );
  const result = await stream.read();

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.reason, "limit");
  assert.equal(JSON.stringify(result).includes(privatePrefix), false);
});

test("rejects a concurrent read and closes idempotently", async () => {
  const pending = new Deferred<
    Result<Uint8Array | null, OllamaCloudTransportError>
  >();
  let readCalls = 0;
  let closeCalls = 0;
  const transportStream: OllamaCloudTransportStream = {
    contentType: "application/json",
    statusCode: 200,
    async close(): Promise<Result<void, OllamaCloudTransportError>> {
      closeCalls += 1;
      pending.resolve(err(Object.freeze({ kind: "closed" })));
      return ok(undefined);
    },
    read(): Promise<Result<Uint8Array | null, OllamaCloudTransportError>> {
      readCalls += 1;
      return pending.promise;
    },
  };
  const stream = await open(fixture(transportStream).model);
  const first = stream.read();
  await Promise.resolve();

  const concurrent = await stream.read();
  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) assert.equal(concurrent.error.reason, "concurrentRead");
  assert.equal(readCalls, 1);
  assert.ok((await stream.close()).ok);
  assert.ok((await stream.close()).ok);
  assert.equal(closeCalls, 1);
  await first;
});

test("honors cancellation before opening the provider transport", async () => {
  let calls = 0;
  const transport: OllamaCloudTransport = {
    async open(): Promise<
      Result<OllamaCloudTransportStream, OllamaCloudTransportError>
    > {
      calls += 1;
      return err(Object.freeze({ kind: "connection" }));
    },
  };
  const created = OllamaCloudModel.create(
    transport,
    "Use the available tools.",
    MODEL,
  );
  assert.ok(created.ok);
  const cancellation = new Cancellation();
  cancellation.request();
  const opened = await created.value.open(conversation(), cancellation, []);

  assert.equal(opened.ok, false);
  if (!opened.ok) assert.equal(opened.error.reason, "cancelled");
  assert.equal(calls, 0);
});

test("rejects invalid model identifiers before retaining a provider", () => {
  const transport = new FakeTransport(err(Object.freeze({ kind: "connection" })));
  const invalid = OllamaCloudModel.create(
    transport,
    "Use the available tools.",
    "https://ollama.com/private",
  );
  assert.deepEqual(invalid, {
    error: { kind: "invalidModel" },
    ok: false,
  });
});
