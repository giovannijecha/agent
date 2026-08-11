import assert from "node:assert/strict";
import test from "node:test";

import {
  type CancellationSignal,
  AgentRuntime,
  type ModelStream,
  type ModelStreamEvent,
  type RuntimeCleanupFailure,
  type StreamingModel,
  type TurnOutcome,
} from "@agent/runtime";
import {
  type Conversation,
  err,
  Message,
  ok,
  type Result,
  Role,
  StructuredObject,
  structuredValueFromUnknown,
  ToolExchange,
  ToolResult,
} from "@agent/core";
import {
  ObjectSchema,
  StringSchema,
  ToolDescriptor,
  ToolEngine,
  type ToolHandler,
  ToolRegistry,
} from "@agent/tools";

class ScriptedStream<E> implements ModelStream<E> {
  readonly #steps: Result<ModelStreamEvent, E>[];
  readonly #closeResult: Result<void, E>;
  closeCalls = 0;
  readCalls = 0;

  constructor(
    steps: Result<ModelStreamEvent, E>[],
    closeResult: Result<void, E> = ok(undefined),
  ) {
    this.#steps = [...steps];
    this.#closeResult = closeResult;
  }

  async read(): Promise<Result<ModelStreamEvent, E>> {
    this.readCalls += 1;
    const step = this.#steps.shift();
    if (step === undefined) {
      throw new Error("script exhausted");
    }
    return step;
  }

  async close(): Promise<Result<void, E>> {
    this.closeCalls += 1;
    return this.#closeResult;
  }
}

class FixedModel<E> implements StreamingModel<E> {
  readonly #opened: Result<ModelStream<E>, E>;
  calls = 0;
  cancellation: CancellationSignal | undefined;
  seen: Conversation | undefined;

  constructor(opened: Result<ModelStream<E>, E>) {
    this.#opened = opened;
  }

  async open(
    conversation: Conversation,
    cancellation: CancellationSignal,
  ): Promise<Result<ModelStream<E>, E>> {
    this.calls += 1;
    this.seen = conversation;
    this.cancellation = cancellation;
    return this.#opened;
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

class DeferredStream<E> implements ModelStream<E> {
  readonly readResult = new Deferred<Result<ModelStreamEvent, E>>();
  closeCalls = 0;

  read(): Promise<Result<ModelStreamEvent, E>> {
    return this.readResult.promise;
  }

  async close(): Promise<Result<void, E>> {
    this.closeCalls += 1;
    return ok(undefined);
  }
}

class DeferredModel<E> implements StreamingModel<E> {
  readonly opened = new Deferred<Result<ModelStream<E>, E>>();
  cancellation: CancellationSignal | undefined;

  open(
    _conversation: Conversation,
    cancellation: CancellationSignal,
  ): Promise<Result<ModelStream<E>, E>> {
    this.cancellation = cancellation;
    return this.opened.promise;
  }
}

class DeferredCloseStream<E> implements ModelStream<E> {
  readonly closeResult = new Deferred<Result<void, E>>();
  readonly closeStarted = new Deferred<void>();
  #sentDelta = false;

  async read(): Promise<Result<ModelStreamEvent, E>> {
    if (!this.#sentDelta) {
      this.#sentDelta = true;
      return ok(Object.freeze({ kind: "delta" as const, text: "answer" }));
    }
    return ok(Object.freeze({ kind: "done" as const }));
  }

  async close(): Promise<Result<void, E>> {
    this.closeStarted.resolve(undefined);
    return this.closeResult.promise;
  }
}

class DeferredFailureCloseStream<E> implements ModelStream<E> {
  readonly #readFailure: E;
  readonly closeResult = new Deferred<Result<void, E>>();
  readonly closeStarted = new Deferred<void>();

  constructor(readFailure: E) {
    this.#readFailure = readFailure;
  }

  async read(): Promise<Result<ModelStreamEvent, E>> {
    return err(this.#readFailure);
  }

  async close(): Promise<Result<void, E>> {
    this.closeStarted.resolve(undefined);
    return this.closeResult.promise;
  }
}

class SequenceModel<E> implements StreamingModel<E> {
  readonly #streams: ModelStream<E>[];
  readonly conversations: Conversation[] = [];

  constructor(streams: ModelStream<E>[]) {
    this.#streams = [...streams];
  }

  async open(
    conversation: Conversation,
  ): Promise<Result<ModelStream<E>, E>> {
    const stream = this.#streams.shift();
    if (stream === undefined) {
      throw new Error("stream sequence exhausted");
    }
    this.conversations.push(conversation);
    return ok(stream);
  }
}

function toolInput(path = "src/index.ts"): StructuredObject {
  const input = structuredValueFromUnknown({ path });
  assert.ok(input.ok && input.value instanceof StructuredObject);
  return input.value;
}

function toolCallEvent(
  callId: string,
  input: StructuredObject = toolInput(),
): ModelStreamEvent {
  return Object.freeze({
    calls: Object.freeze([
      Object.freeze({ callId, input, name: "read_file" }),
    ]),
    kind: "toolCalls" as const,
  });
}

function toolBatchEvent(
  calls: readonly Readonly<{ callId: string; path: string }>[]
): ModelStreamEvent {
  return Object.freeze({
    calls: Object.freeze(
      calls.map((call) =>
        Object.freeze({
          callId: call.callId,
          input: toolInput(call.path),
          name: "read_file",
        }),
      ),
    ),
    kind: "toolCalls" as const,
  });
}

function toolEngine(
  risk: "read" | "write" = "read",
  handler: ToolHandler = async () => ok({ text: "owned" }),
): ToolEngine {
  const path = StringSchema.create(1, 256);
  assert.ok(path.ok);
  const input = ObjectSchema.create([
    {
      description: "Relative workspace path.",
      name: "path",
      required: true,
      schema: path.value,
    },
  ]);
  assert.ok(input.ok);
  const descriptor = ToolDescriptor.create(
    "read_file",
    "Read one bounded workspace file.",
    risk,
    input.value,
    risk === "read"
      ? Object.freeze([])
      : Object.freeze([
          Object.freeze({ mode: "exact" as const, name: "path" }),
        ]),
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    {
      descriptor: descriptor.value,
      handler,
    },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

async function next<E>(runtime: AgentRuntime<E>) {
  const result = await runtime.nextEvent();
  assert.ok(result.ok);
  return result.value;
}

function responseSteps(length: number): Result<ModelStreamEvent, string>[] {
  const steps: Result<ModelStreamEvent, string>[] = [];
  let remaining = length;
  while (remaining > 0) {
    const size = Math.min(remaining, 16_384);
    steps.push(ok(Object.freeze({ kind: "delta", text: "x".repeat(size) })));
    remaining -= size;
  }
  steps.push(ok(Object.freeze({ kind: "done" })));
  return steps;
}

type DrainedTurn = Readonly<{
  cleanup: readonly RuntimeCleanupFailure<string>[];
  outcome: TurnOutcome<string> | Readonly<{ kind: "completed" }>;
}>;

async function drainTurn(runtime: AgentRuntime<string>): Promise<DrainedTurn> {
  while (true) {
    const event = await next(runtime);
    if (event.kind === "turnFinished") {
      assert.ok(runtime.acknowledgeTurn(event.turnId).ok);
      return Object.freeze({ cleanup: event.cleanup, outcome: event.outcome });
    }
    if (event.kind === "turnPrepared") {
      assert.deepEqual(runtime.commitTurn(event.turnId), {
        ok: true,
        value: { kind: "committed" },
      });
      return Object.freeze({
        cleanup: event.cleanup,
        outcome: Object.freeze({ kind: "completed" as const }),
      });
    }
  }
}

test("streams a prospective turn and commits both messages atomically", async () => {
  const stream = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "hel" })),
    ok(Object.freeze({ kind: "delta" as const, text: "lo" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new FixedModel(ok(stream));
  const runtime = new AgentRuntime(model);

  const started = runtime.startTurn("hi");
  assert.ok(started.ok);
  assert.equal(runtime.conversation.length, 0);

  const first = await next(runtime);
  assert.deepEqual(first, {
    kind: "assistantDelta",
    turnId: started.value.turnId,
    text: "hel",
  });
  assert.equal(runtime.conversation.length, 0);
  assert.equal(model.seen?.length, 1);
  const seenUser = model.seen?.entries.at(0);
  assert.equal(seenUser instanceof Message ? seenUser.content : undefined, "hi");

  const second = await next(runtime);
  assert.equal(second.kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  assert.equal(runtime.conversation.length, 0);
  if (prepared.kind === "turnPrepared") {
    assert.equal(prepared.assistant.content, "hello");
    assert.deepEqual(prepared.cleanup, []);
    assert.deepEqual(runtime.commitTurn(prepared.turnId), {
      ok: true,
      value: { kind: "committed" },
    });
  }
  assert.deepEqual(
    runtime.conversation.entries.map((entry) =>
      entry instanceof Message ? [entry.role, entry.content] : undefined,
    ),
    [
      [Role.User, "hi"],
      [Role.Assistant, "hello"],
    ],
  );
  assert.equal(stream.closeCalls, 1);
  assert.equal(runtime.activeTurnId, undefined);
});

test("rolls back deltas and reports model and cleanup failures separately", async () => {
  const stream = new ScriptedStream(
    [
      ok(Object.freeze({ kind: "delta" as const, text: "partial" })),
      err("read failed"),
    ],
    err("close failed"),
  );
  const runtime = new AgentRuntime(new FixedModel(ok(stream)));
  assert.ok(runtime.startTurn("question").ok);

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const finished = await next(runtime);

  assert.equal(finished.kind, "turnFinished");
  if (finished.kind === "turnFinished") {
    assert.deepEqual(finished.outcome, {
      kind: "failed",
      failure: { kind: "model", operation: "read", error: "read failed" },
    });
    assert.deepEqual(finished.cleanup, [
      { kind: "model", error: "close failed" },
    ]);
    assert.equal(runtime.activeTurnId, finished.turnId);
    assert.deepEqual(await runtime.nextEvent(), {
      ok: false,
      error: { kind: "awaitingAcknowledge" },
    });
    assert.ok(runtime.acknowledgeTurn(finished.turnId).ok);
  }
  assert.equal(runtime.conversation.length, 0);
  assert.equal(runtime.activeTurnId, undefined);
});

test("cancels before opening without invoking the model", async () => {
  const model = new FixedModel<string>(
    ok(new ScriptedStream([ok(Object.freeze({ kind: "done" as const }))])),
  );
  const runtime = new AgentRuntime(model);
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  assert.deepEqual(runtime.requestCancel(started.value.turnId), ok(true));
  assert.deepEqual(runtime.requestCancel(started.value.turnId), ok(false));
  const finished = await next(runtime);

  assert.equal(finished.kind, "turnFinished");
  if (finished.kind === "turnFinished") {
    assert.equal(finished.outcome.kind, "cancelled");
  }
  assert.equal(model.calls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("cancellation wins a pending read and closes the stream", async () => {
  const stream = new DeferredStream<string>();
  const model = new FixedModel(ok(stream));
  const runtime = new AgentRuntime(model);
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  const pending = runtime.nextEvent();
  await Promise.resolve();
  assert.equal(model.cancellation?.whenRequested(), model.cancellation?.whenRequested());
  assert.deepEqual(runtime.requestCancel(started.value.turnId), ok(true));
  const result = await pending;

  assert.ok(result.ok);
  assert.equal(result.value.kind, "turnFinished");
  if (result.value.kind === "turnFinished") {
    assert.equal(result.value.outcome.kind, "cancelled");
  }
  assert.equal(stream.closeCalls, 1);
  assert.equal(runtime.conversation.length, 0);
});

test("cancellation after pending open wins and releases the late stream", async () => {
  const stream = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new DeferredModel<string>();
  const runtime = new AgentRuntime(model);
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  const pending = runtime.nextEvent();
  await Promise.resolve();
  runtime.requestCancel(started.value.turnId);
  model.opened.resolve(ok(stream));
  const result = await pending;

  assert.ok(result.ok);
  assert.equal(result.value.kind, "turnFinished");
  if (result.value.kind === "turnFinished") {
    assert.equal(result.value.outcome.kind, "cancelled");
  }
  assert.equal(stream.closeCalls, 1);
  assert.equal(runtime.conversation.length, 0);
});

test("cancellation during completion cleanup prevents a late commit", async () => {
  const stream = new DeferredCloseStream<string>();
  const runtime = new AgentRuntime(new FixedModel(ok(stream)));
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const pending = runtime.nextEvent();
  await stream.closeStarted.promise;
  runtime.requestCancel(started.value.turnId);
  stream.closeResult.resolve(ok(undefined));
  const result = await pending;

  assert.ok(result.ok);
  assert.equal(result.value.kind, "turnFinished");
  if (result.value.kind === "turnFinished") {
    assert.equal(result.value.outcome.kind, "cancelled");
  }
  assert.equal(runtime.conversation.length, 0);
});

test("cancellation after preparation wins before explicit commit", async () => {
  const runtime = new AgentRuntime(
    new FixedModel(
      ok(
        new ScriptedStream<string>([
          ok(Object.freeze({ kind: "delta", text: "answer" })),
          ok(Object.freeze({ kind: "done" })),
        ]),
      ),
    ),
  );
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  assert.equal(runtime.conversation.length, 0);
  assert.deepEqual(await runtime.nextEvent(), {
    ok: false,
    error: { kind: "awaitingCommit" },
  });

  assert.deepEqual(runtime.requestCancel(started.value.turnId), ok(true));
  assert.deepEqual(runtime.commitTurn(started.value.turnId), {
    ok: true,
    value: { kind: "cancelled" },
  });
  assert.equal(runtime.conversation.length, 0);
  assert.equal(runtime.activeTurnId, undefined);
});

test("cancellation during failure cleanup wins and preserves cleanup errors", async () => {
  const stream = new DeferredFailureCloseStream("read failed");
  const runtime = new AgentRuntime(new FixedModel(ok(stream)));
  const started = runtime.startTurn("question");
  assert.ok(started.ok);

  const pending = runtime.nextEvent();
  await stream.closeStarted.promise;
  runtime.requestCancel(started.value.turnId);
  stream.closeResult.resolve(err("close failed"));
  const result = await pending;

  assert.ok(result.ok);
  assert.equal(result.value.kind, "turnFinished");
  if (result.value.kind === "turnFinished") {
    assert.equal(result.value.outcome.kind, "cancelled");
    assert.deepEqual(result.value.cleanup, [
      { kind: "model", error: "close failed" },
    ]);
  }
  assert.equal(runtime.conversation.length, 0);
});

test("rejects concurrent turns, stale cancellation, and concurrent reads", async () => {
  const stream = new DeferredStream<string>();
  const runtime = new AgentRuntime(new FixedModel(ok(stream)));
  const started = runtime.startTurn("first");
  assert.ok(started.ok);

  assert.deepEqual(runtime.startTurn("second"), {
    ok: false,
    error: { kind: "busy" },
  });
  assert.deepEqual(runtime.requestCancel(started.value.turnId + 1), {
    ok: false,
    error: { kind: "staleTurn" },
  });
  const pending = runtime.nextEvent();
  assert.deepEqual(await runtime.nextEvent(), {
    ok: false,
    error: { kind: "concurrentRead" },
  });
  runtime.requestCancel(started.value.turnId);
  await pending;
});

test("fails closed on blank, invalid, and oversized model output", async () => {
  const cases: Array<Readonly<{
    event: ModelStreamEvent;
    failure: string;
  }>> = [
    { event: Object.freeze({ kind: "delta", text: "" }), failure: "emptyDelta" },
    {
      event: Object.freeze({ kind: "delta", text: "x".repeat(16_385) }),
      failure: "responseTooLong",
    },
    {
      event: Object.freeze({ kind: "unknown" }) as unknown as ModelStreamEvent,
      failure: "invalidModelEvent",
    },
    {
      event: Object.freeze({
        calls: Object.freeze([]),
        kind: "toolCalls",
      }) as unknown as ModelStreamEvent,
      failure: "invalidModelEvent",
    },
    {
      event: Object.freeze({
        calls: Object.freeze([
          Object.freeze({
            callId: "call-duplicate",
            input: toolInput("one.txt"),
            name: "read_file",
          }),
          Object.freeze({
            callId: "call-duplicate",
            input: toolInput("two.txt"),
            name: "read_file",
          }),
        ]),
        kind: "toolCalls",
      }) as unknown as ModelStreamEvent,
      failure: "invalidModelEvent",
    },
  ];

  for (const fixture of cases) {
    const stream = new ScriptedStream<string>([ok(fixture.event)]);
    const runtime = new AgentRuntime(new FixedModel(ok(stream)));
    assert.ok(runtime.startTurn("question").ok);
    const event = await next(runtime);
    assert.equal(event.kind, "turnFinished");
    if (event.kind === "turnFinished" && event.outcome.kind === "failed") {
      assert.equal(event.outcome.failure.kind, fixture.failure);
    }
    assert.equal(runtime.conversation.length, 0);
  }

  const blank = new AgentRuntime(
    new FixedModel(
      ok(
        new ScriptedStream<string>([
          ok(Object.freeze({ kind: "delta", text: "  " })),
          ok(Object.freeze({ kind: "done" })),
        ]),
      ),
    ),
  );
  assert.ok(blank.startTurn("question").ok);
  await next(blank);
  const finished = await next(blank);
  assert.equal(finished.kind, "turnFinished");
  if (finished.kind === "turnFinished" && finished.outcome.kind === "failed") {
    assert.equal(finished.outcome.failure.kind, "emptyResponse");
  }
});

test("bounds direct input and accumulated response without retaining content", async () => {
  const unused = new FixedModel<string>(err("unused"));
  const inputRuntime = new AgentRuntime(unused);
  const rejected = inputRuntime.startTurn("secret" + "x".repeat(4_096));
  assert.deepEqual(rejected, {
    ok: false,
    error: { kind: "inputTooLong" },
  });
  assert.equal(JSON.stringify(rejected).includes("secret"), false);

  const steps: Result<ModelStreamEvent, string>[] = [];
  for (let index = 0; index < 17; index += 1) {
    steps.push(ok(Object.freeze({ kind: "delta", text: "x".repeat(16_384) })));
  }
  const responseRuntime = new AgentRuntime(
    new FixedModel(ok(new ScriptedStream(steps))),
  );
  assert.ok(responseRuntime.startTurn("question").ok);
  let terminal;
  while (terminal === undefined) {
    const event = await next(responseRuntime);
    if (event.kind === "turnFinished") {
      terminal = event;
    }
  }
  assert.equal(terminal.outcome.kind, "failed");
  if (terminal.outcome.kind === "failed") {
    assert.equal(terminal.outcome.failure.kind, "responseTooLong");
  }
  assert.equal(responseRuntime.conversation.length, 0);
});

test("converts thrown and malformed model operations into typed failures", async () => {
  const throwingModel: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      throw "private-open-sentinel";
    },
  };
  const throwingRuntime = new AgentRuntime(throwingModel);
  assert.ok(throwingRuntime.startTurn("question").ok);
  const thrown = await next(throwingRuntime);
  assert.equal(thrown.kind, "turnFinished");
  if (thrown.kind === "turnFinished" && thrown.outcome.kind === "failed") {
    assert.equal(thrown.outcome.failure.kind, "unexpected");
  }
  assert.equal(JSON.stringify(thrown).includes("private-open-sentinel"), false);

  const throwingStream: ModelStream<string> = {
    async read(): Promise<Result<ModelStreamEvent, string>> {
      throw "private-read-sentinel";
    },
    async close(): Promise<Result<void, string>> {
      throw "private-close-sentinel";
    },
  };
  const throwingReadRuntime = new AgentRuntime(
    new FixedModel(ok(throwingStream)),
  );
  assert.ok(throwingReadRuntime.startTurn("question").ok);
  const thrownRead = await next(throwingReadRuntime);
  assert.equal(thrownRead.kind, "turnFinished");
  assert.equal(JSON.stringify(thrownRead).includes("private-read-sentinel"), false);
  assert.equal(JSON.stringify(thrownRead).includes("private-close-sentinel"), false);

  const malformedModel: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      return undefined as unknown as Result<ModelStream<string>, string>;
    },
  };
  const malformedRuntime = new AgentRuntime(malformedModel);
  assert.ok(malformedRuntime.startTurn("question").ok);
  const malformed = await next(malformedRuntime);
  assert.equal(malformed.kind, "turnFinished");
  if (
    malformed.kind === "turnFinished" &&
    malformed.outcome.kind === "failed"
  ) {
    assert.equal(malformed.outcome.failure.kind, "invalidModelResult");
  }

  const missingValueModel: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      return { ok: true } as unknown as Result<ModelStream<string>, string>;
    },
  };
  const missingValueRuntime = new AgentRuntime(missingValueModel);
  assert.ok(missingValueRuntime.startTurn("question").ok);
  const missingValue = await next(missingValueRuntime);
  assert.equal(missingValue.kind, "turnFinished");
  if (
    missingValue.kind === "turnFinished" &&
    missingValue.outcome.kind === "failed"
  ) {
    assert.equal(missingValue.outcome.failure.kind, "invalidModelResult");
  }
});

test("totally decodes hostile model results, events, streams, and cleanup", async () => {
  const openProxy = new Proxy(
    Object.freeze({ ok: true, value: undefined }),
    {
      ownKeys(): never {
        throw new Error("private-open-proxy");
      },
    },
  );
  const proxyRuntime = new AgentRuntime<string>({
    async open(): Promise<Result<ModelStream<string>, string>> {
      return openProxy as unknown as Result<ModelStream<string>, string>;
    },
  });
  assert.ok(proxyRuntime.startTurn("question").ok);
  const proxyFailure = await next(proxyRuntime);
  assert.equal(proxyFailure.kind, "turnFinished");
  if (
    proxyFailure.kind === "turnFinished" &&
    proxyFailure.outcome.kind === "failed"
  ) {
    assert.equal(proxyFailure.outcome.failure.kind, "invalidModelResult");
  }
  assert.equal(JSON.stringify(proxyFailure).includes("private-open-proxy"), false);

  let hostileCloseCalls = 0;
  const hostileStream = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostileStream, "close", {
    enumerable: true,
    value: async () => {
      hostileCloseCalls += 1;
      return ok(undefined);
    },
  });
  Object.defineProperty(hostileStream, "read", {
    enumerable: true,
    get(): never {
      throw new Error("private-stream-getter");
    },
  });
  const streamRuntime = new AgentRuntime(
    new FixedModel(
      ok(hostileStream as unknown as ModelStream<string>),
    ),
  );
  assert.ok(streamRuntime.startTurn("question").ok);
  const streamFailure = await next(streamRuntime);
  assert.equal(streamFailure.kind, "turnFinished");
  if (
    streamFailure.kind === "turnFinished" &&
    streamFailure.outcome.kind === "failed"
  ) {
    assert.equal(streamFailure.outcome.failure.kind, "invalidModelStream");
  }
  assert.equal(hostileCloseCalls, 1);

  const hostileReadResult = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostileReadResult, "ok", {
    enumerable: true,
    get(): never {
      throw new Error("private-read-getter");
    },
  });
  Object.defineProperty(hostileReadResult, "value", {
    enumerable: true,
    value: undefined,
  });
  const readRuntime = new AgentRuntime(
    new FixedModel(
      ok({
        async close(): Promise<Result<void, string>> {
          return ok(undefined);
        },
        async read(): Promise<Result<ModelStreamEvent, string>> {
          return hostileReadResult as unknown as Result<ModelStreamEvent, string>;
        },
      }),
    ),
  );
  assert.ok(readRuntime.startTurn("question").ok);
  const readFailure = await next(readRuntime);
  assert.equal(readFailure.kind, "turnFinished");
  if (
    readFailure.kind === "turnFinished" &&
    readFailure.outcome.kind === "failed"
  ) {
    assert.equal(readFailure.outcome.failure.kind, "invalidModelResult");
  }

  const hostileEvent = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostileEvent, "kind", {
    enumerable: true,
    get(): never {
      throw new Error("private-event-getter");
    },
  });
  const eventRuntime = new AgentRuntime(
    new FixedModel(
      ok(
        new ScriptedStream<string>([
          ok(hostileEvent as unknown as ModelStreamEvent),
        ]),
      ),
    ),
  );
  assert.ok(eventRuntime.startTurn("question").ok);
  const eventFailure = await next(eventRuntime);
  assert.equal(eventFailure.kind, "turnFinished");
  if (
    eventFailure.kind === "turnFinished" &&
    eventFailure.outcome.kind === "failed"
  ) {
    assert.equal(eventFailure.outcome.failure.kind, "invalidModelEvent");
  }

  const hostileCloseResult = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostileCloseResult, "ok", {
    enumerable: true,
    get(): never {
      throw new Error("private-close-getter");
    },
  });
  Object.defineProperty(hostileCloseResult, "value", {
    enumerable: true,
    value: undefined,
  });
  let closeReadStep = 0;
  const closeRuntime = new AgentRuntime(
    new FixedModel(
      ok({
        async close(): Promise<Result<void, string>> {
          return hostileCloseResult as unknown as Result<void, string>;
        },
        async read(): Promise<Result<ModelStreamEvent, string>> {
          closeReadStep += 1;
          return closeReadStep === 1
            ? ok(Object.freeze({ kind: "delta", text: "answer" }))
            : ok(Object.freeze({ kind: "done" }));
        },
      }),
    ),
  );
  assert.ok(closeRuntime.startTurn("question").ok);
  assert.equal((await next(closeRuntime)).kind, "assistantDelta");
  const prepared = await next(closeRuntime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind === "turnPrepared") {
    assert.deepEqual(prepared.cleanup, [{ kind: "invalidModelResult" }]);
    assert.ok(closeRuntime.commitTurn(prepared.turnId).ok);
  }

  const serialized = JSON.stringify([
    streamFailure,
    readFailure,
    eventFailure,
    prepared,
  ]);
  assert.equal(serialized.includes("private-"), false);
});

test("enforces the complete stream-event and conversation-message bounds", async () => {
  const excessiveSteps: Result<ModelStreamEvent, string>[] = [];
  for (let index = 0; index < 4_096; index += 1) {
    excessiveSteps.push(ok(Object.freeze({ kind: "delta", text: "x" })));
  }
  excessiveSteps.push(ok(Object.freeze({ kind: "done" })));
  const excessiveRuntime = new AgentRuntime(
    new FixedModel(ok(new ScriptedStream(excessiveSteps))),
  );
  assert.ok(excessiveRuntime.startTurn("question").ok);
  let excessiveTerminal;
  while (excessiveTerminal === undefined) {
    const event = await next(excessiveRuntime);
    if (event.kind === "turnFinished") {
      excessiveTerminal = event;
    }
  }
  assert.equal(excessiveTerminal.outcome.kind, "failed");
  if (excessiveTerminal.outcome.kind === "failed") {
    assert.equal(excessiveTerminal.outcome.failure.kind, "eventLimit");
  }

  const factory: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      return ok(
        new ScriptedStream([
          ok(Object.freeze({ kind: "delta", text: "a" })),
          ok(Object.freeze({ kind: "done" })),
        ]),
      );
    },
  };
  const boundedRuntime = new AgentRuntime(factory);
  for (let turn = 0; turn < 128; turn += 1) {
    assert.ok(boundedRuntime.startTurn("q").ok);
    assert.equal((await drainTurn(boundedRuntime)).outcome.kind, "completed");
  }
  assert.equal(boundedRuntime.conversation.length, 256);
  assert.deepEqual(boundedRuntime.startTurn("overflow"), {
    ok: false,
    error: { kind: "conversationTooLong" },
  });
});

test("enforces aggregate conversation content at the exact boundary", async () => {
  const exactLengths = [262_144, 262_144, 262_144, 262_140];
  const exactModel: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      const length = exactLengths.shift();
      assert.ok(length !== undefined);
      return ok(new ScriptedStream(responseSteps(length)));
    },
  };
  const exactRuntime = new AgentRuntime(exactModel);
  for (let turn = 0; turn < 4; turn += 1) {
    assert.ok(exactRuntime.startTurn("q").ok);
    const finished = await drainTurn(exactRuntime);
    assert.equal(finished.outcome.kind, "completed");
  }
  assert.deepEqual(exactRuntime.startTurn("q"), {
    ok: false,
    error: { kind: "conversationTooLong" },
  });

  const overflowLengths = [262_144, 262_144, 262_144, 262_141];
  const overflowModel: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      const length = overflowLengths.shift();
      assert.ok(length !== undefined);
      return ok(new ScriptedStream(responseSteps(length)));
    },
  };
  const overflowRuntime = new AgentRuntime(overflowModel);
  for (let turn = 0; turn < 3; turn += 1) {
    assert.ok(overflowRuntime.startTurn("q").ok);
    assert.equal((await drainTurn(overflowRuntime)).outcome.kind, "completed");
  }
  assert.ok(overflowRuntime.startTurn("q").ok);
  const overflow = await drainTurn(overflowRuntime);
  assert.equal(overflow.outcome.kind, "failed");
  if (overflow.outcome.kind === "failed") {
    assert.equal(overflow.outcome.failure.kind, "responseTooLong");
  }
  assert.equal(overflowRuntime.conversation.length, 6);
});

test("stops idempotently and returns cleanup failure independently", async () => {
  const stream = new DeferredStream<string>();
  stream.close = async () => {
    stream.closeCalls += 1;
    return err("close failed");
  };
  const runtime = new AgentRuntime(new FixedModel(ok(stream)));
  assert.ok(runtime.startTurn("question").ok);
  const pending = runtime.nextEvent();
  await Promise.resolve();

  const firstStop = runtime.stop();
  const secondStop = runtime.stop();
  assert.equal(firstStop, secondStop);
  const stopped = await firstStop;
  await pending;

  assert.deepEqual(stopped, {
    ok: false,
    error: { failures: [{ kind: "model", error: "close failed" }] },
  });
  assert.deepEqual(runtime.startTurn("later"), {
    ok: false,
    error: { kind: "closed" },
  });
  assert.deepEqual(await runtime.nextEvent(), {
    ok: false,
    error: { kind: "closed" },
  });
});

test("stop closes a stream after a delivered delta and discards preparation", async () => {
  const activeStream = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta", text: "partial" })),
  ]);
  const activeRuntime = new AgentRuntime(new FixedModel(ok(activeStream)));
  assert.ok(activeRuntime.startTurn("question").ok);
  assert.equal((await next(activeRuntime)).kind, "assistantDelta");

  assert.deepEqual(await activeRuntime.stop(), ok(undefined));
  assert.equal(activeStream.closeCalls, 1);
  assert.equal(activeRuntime.activeTurnId, undefined);
  assert.equal(activeRuntime.conversation.length, 0);

  const preparedStream = new ScriptedStream<string>(
    [
      ok(Object.freeze({ kind: "delta", text: "answer" })),
      ok(Object.freeze({ kind: "done" })),
    ],
    err("close failed"),
  );
  const preparedRuntime = new AgentRuntime(
    new FixedModel(ok(preparedStream)),
  );
  assert.ok(preparedRuntime.startTurn("question").ok);
  assert.equal((await next(preparedRuntime)).kind, "assistantDelta");
  assert.equal((await next(preparedRuntime)).kind, "turnPrepared");

  assert.deepEqual(await preparedRuntime.stop(), {
    ok: false,
    error: { failures: [{ error: "close failed", kind: "model" }] },
  });
  assert.equal(preparedRuntime.activeTurnId, undefined);
  assert.equal(preparedRuntime.conversation.length, 0);
});

test("runs a read tool sequentially and checkpoints its structured result", async () => {
  const first = new ScriptedStream<string>([
    ok(toolCallEvent("call-1")),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "done" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second]);
  const runtime = new AgentRuntime(model, toolEngine());
  const started = runtime.startTurn("inspect");
  assert.ok(started.ok);

  const requested = await next(runtime);
  assert.deepEqual(requested, {
    approvalRequired: false,
    approvalPreview: "",
    callId: "call-1",
    kind: "toolRequested",
    name: "read_file",
    risk: "read",
    turnId: started.value.turnId,
  });
  assert.equal((await next(runtime)).kind, "toolStarted");
  const finished = await next(runtime);
  assert.equal(finished.kind, "toolFinished");
  assert.equal(runtime.conversation.length, 2);
  assert.equal(runtime.conversation.messageUnits, 3);
  assert.ok(runtime.conversation.entries.at(1) instanceof ToolExchange);

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind === "turnPrepared") {
    assert.equal(prepared.checkpointed, true);
    assert.ok(runtime.commitTurn(prepared.turnId).ok);
  }
  assert.equal(runtime.conversation.length, 3);
  assert.equal(runtime.conversation.messageUnits, 4);
  assert.equal(model.conversations.at(1)?.length, 2);
});

test("preflights and executes one ordered tool-call batch sequentially", async () => {
  const firstStarted = new Deferred<void>();
  const releaseFirst = new Deferred<void>();
  const observed: string[] = [];
  const first = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-html", path: "index.html" },
        { callId: "call-script", path: "script.js" },
      ]),
    ),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "both read" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second]);
  const runtime = new AgentRuntime(
    model,
    toolEngine("read", async (input) => {
      const path = input.get("path");
      assert.equal(typeof path, "string");
      observed.push(path as string);
      if (path === "index.html") {
        firstStarted.resolve(undefined);
        await releaseFirst.promise;
      }
      return ok({ text: path });
    }),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  const firstRequested = await next(runtime);
  assert.equal(firstRequested.kind, "toolRequested");
  assert.equal(
    firstRequested.kind === "toolRequested" ? firstRequested.callId : "",
    "call-html",
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  const firstFinished = runtime.nextEvent();
  await firstStarted.promise;
  assert.deepEqual(observed, ["index.html"]);
  releaseFirst.resolve(undefined);
  assert.equal((await firstFinished).ok, true);

  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  assert.equal(
    secondRequested.kind === "toolRequested" ? secondRequested.callId : "",
    "call-script",
  );
  assert.deepEqual(observed, ["index.html"]);
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["index.html", "script.js"]);

  assert.equal(runtime.conversation.length, 2);
  assert.equal(runtime.conversation.messageUnits, 4);
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.calls.map((call) => call.callId),
    ["call-html", "call-script"],
  );
  assert.deepEqual(
    exchange.results.map((result) => result.callId),
    ["call-html", "call-script"],
  );
  assert.equal((await next(runtime)).kind, "assistantDelta");
  assert.equal((await next(runtime)).kind, "turnPrepared");
  assert.equal(model.conversations.at(1)?.messageUnits, 4);
});

test("checkpoints a complete batch and blocks its suffix after a handler contract failure", async () => {
  const observed: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-first", path: "first.txt" },
        { callId: "call-invalid", path: "invalid.txt" },
        { callId: "call-blocked", path: "blocked.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("read", async (input) => {
      const path = input.get("path");
      assert.equal(typeof path, "string");
      observed.push(path as string);
      return path === "invalid.txt"
        ? ok({ text: "x".repeat(262_145) })
        : ok({ text: path });
    }),
  );
  assert.ok(runtime.startTurn("inspect three files").ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolRequested");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const failed = await next(runtime);
  assert.equal(failed.kind, "toolFinished");
  if (failed.kind === "toolFinished") {
    assert.equal(failed.callId, "call-invalid");
    assert.equal(failed.status, "failure");
  }
  assert.deepEqual(observed, ["first.txt", "invalid.txt"]);

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.results.map((result) => result.callId),
    ["call-first", "call-invalid", "call-blocked"],
  );
  const blocked = exchange.results.at(2);
  assert.ok(blocked?.output instanceof StructuredObject);
  assert.equal(blocked.output.get("attempted"), false);
  assert.equal(blocked.output.get("error"), "blocked");

  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "toolEngine");
    }
    assert.equal(terminal.checkpointed, true);
  }
});

test("cancels an executing batch and records its unstarted suffix", async () => {
  const handlerStarted = new Deferred<void>();
  let handlerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-running", path: "running.txt" },
        { callId: "call-cancelled", path: "cancelled.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("read", async (_input, cancellation) => {
      handlerCalls += 1;
      handlerStarted.resolve(undefined);
      await cancellation.whenRequested();
      return err(Object.freeze({ kind: "cancelled" as const }));
    }),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const executing = runtime.nextEvent();
  await handlerStarted.promise;
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  const finished = await executing;
  assert.ok(finished.ok);
  if (finished.ok && finished.value.kind === "toolFinished") {
    assert.equal(finished.value.callId, "call-running");
    assert.equal(finished.value.status, "failure");
  }
  assert.equal(handlerCalls, 1);

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  const cancelled = exchange.results.at(1);
  assert.ok(cancelled?.output instanceof StructuredObject);
  assert.equal(cancelled.output.get("attempted"), false);
  assert.equal(cancelled.output.get("error"), "cancelled");

  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "cancelled");
    assert.equal(terminal.checkpointed, true);
  }
});

test("rejects an invalid batch before any tool handler can run", async () => {
  let handlerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      Object.freeze({
        calls: Object.freeze([
          Object.freeze({
            callId: "call-valid",
            input: toolInput("index.html"),
            name: "read_file",
          }),
          Object.freeze({
            callId: "call-invalid",
            input: toolInput("script.js"),
            name: "missing_tool",
          }),
        ]),
        kind: "toolCalls" as const,
      }),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("read", async () => {
      handlerCalls += 1;
      return ok({ text: "unreachable" });
    }),
  );
  assert.ok(runtime.startTurn("inspect both files").ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "invalidToolCall");
    }
    assert.equal(terminal.checkpointed, false);
  }
  assert.equal(handlerCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("requires exact approval for writes and checkpoints denial", async () => {
  const first = new ScriptedStream<string>([
    ok(toolCallEvent("call-write")),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "not changed" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const runtime = new AgentRuntime(
    new SequenceModel([first, second]),
    toolEngine("write"),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);
  const requested = await next(runtime);
  assert.equal(requested.kind, "toolRequested");
  if (requested.kind !== "toolRequested") {
    return;
  }
  assert.equal(requested.approvalRequired, true);
  const pending = runtime.nextEvent();
  assert.deepEqual(
    runtime.resolveToolApproval(started.value.turnId, "wrong", false),
    { ok: false, error: { kind: "notAwaitingApproval" } },
  );
  assert.ok(
    runtime.resolveToolApproval(
      started.value.turnId,
      requested.callId,
      false,
    ).ok,
  );
  const denied = await pending;
  assert.ok(denied.ok);
  if (denied.ok) {
    assert.equal(denied.value.kind, "toolFinished");
    if (denied.value.kind === "toolFinished") {
      assert.equal(denied.value.status, "failure");
    }
  }
  assert.equal(runtime.conversation.length, 2);
  assert.equal(runtime.conversation.messageUnits, 3);
  assert.equal((await next(runtime)).kind, "assistantDelta");
});

test("scopes approval to one call at a time within a write batch", async () => {
  const observed: string[] = [];
  const first = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-one", path: "one.txt" },
        { callId: "call-two", path: "two.txt" },
      ]),
    ),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "both changed" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const runtime = new AgentRuntime(
    new SequenceModel([first, second]),
    toolEngine("write", async (input) => {
      const path = input.get("path");
      assert.equal(typeof path, "string");
      observed.push(path as string);
      return ok({ changed: path });
    }),
  );
  const started = runtime.startTurn("change both files");
  assert.ok(started.ok);

  const firstRequested = await next(runtime);
  assert.equal(firstRequested.kind, "toolRequested");
  assert.equal(observed.length, 0);
  assert.ok(
    runtime.resolveToolApproval(started.value.turnId, "call-one", true).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["one.txt"]);

  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  assert.deepEqual(
    runtime.resolveToolApproval(started.value.turnId, "call-one", true),
    { ok: false, error: { kind: "notAwaitingApproval" } },
  );
  assert.equal(observed.length, 1);
  assert.ok(
    runtime.resolveToolApproval(started.value.turnId, "call-two", true).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["one.txt", "two.txt"]);
  assert.equal((await next(runtime)).kind, "assistantDelta");
});

test("cancels a pending approval without executing or checkpointing", async () => {
  const stream = new ScriptedStream<string>([
    ok(toolCallEvent("call-cancel")),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("write"),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);
  assert.equal((await next(runtime)).kind, "toolRequested");
  const pending = runtime.nextEvent();
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  const terminal = await pending;
  assert.ok(terminal.ok);
  if (terminal.ok && terminal.value.kind === "turnFinished") {
    assert.equal(terminal.value.outcome.kind, "cancelled");
    assert.equal(terminal.value.checkpointed, false);
  }
  assert.equal(runtime.conversation.length, 0);
});

test("checkpoints a generic result after a mutation handler contract failure", async () => {
  let effectApplied = false;
  const stream = new ScriptedStream<string>([
    ok(toolCallEvent("call-effect")),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("write", async () => {
      effectApplied = true;
      throw new Error("private post-effect cause");
    }),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);
  const requested = await next(runtime);
  assert.equal(requested.kind, "toolRequested");
  if (requested.kind !== "toolRequested") {
    return;
  }
  assert.ok(
    runtime.resolveToolApproval(
      started.value.turnId,
      requested.callId,
      true,
    ).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  const finished = await next(runtime);
  assert.equal(finished.kind, "toolFinished");
  assert.equal(effectApplied, true);
  assert.equal(runtime.conversation.length, 2);
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  const result = exchange.results.at(0);
  assert.ok(result instanceof ToolResult);
  assert.equal(result.status, "failure");
  assert.ok(result.output instanceof StructuredObject);
  assert.equal(result.output.get("error"), "internal");

  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.checkpointed, true);
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "toolEngine");
    }
  }
});

test("reserves the final assistant entry at the exact conversation boundary", async () => {
  const streams: ModelStream<string>[] = [];
  for (let index = 0; index < 126; index += 1) {
    streams.push(
      new ScriptedStream<string>([
        ok(Object.freeze({ kind: "delta" as const, text: "a" })),
        ok(Object.freeze({ kind: "done" as const })),
      ]),
    );
  }
  streams.push(
    new ScriptedStream<string>([
      ok(toolCallEvent("call-boundary")),
    ]),
  );
  streams.push(
    new ScriptedStream<string>([
      ok(Object.freeze({ kind: "delta" as const, text: "final" })),
      ok(Object.freeze({ kind: "done" as const })),
    ]),
  );
  const runtime = new AgentRuntime(new SequenceModel(streams), toolEngine());
  for (let index = 0; index < 126; index += 1) {
    const started = runtime.startTurn("u");
    assert.ok(started.ok);
    assert.equal((await next(runtime)).kind, "assistantDelta");
    const prepared = await next(runtime);
    assert.equal(prepared.kind, "turnPrepared");
    assert.ok(runtime.commitTurn(started.value.turnId).ok);
  }
  assert.equal(runtime.conversation.length, 252);

  const started = runtime.startTurn("u");
  assert.ok(started.ok);
  assert.equal((await next(runtime)).kind, "toolRequested");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal(runtime.conversation.length, 254);
  assert.equal(runtime.conversation.messageUnits, 255);
  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  assert.ok(runtime.commitTurn(started.value.turnId).ok);
  assert.equal(runtime.conversation.length, 255);
  assert.equal(runtime.conversation.messageUnits, 256);
});

test("stop cancels a pending tool handler and preserves its attempted result", async () => {
  const handlerStarted = new Deferred<void>();
  let cancellationObserved = false;
  const stream = new ScriptedStream<string>([
    ok(toolCallEvent("call-stop")),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine("write", async (_input, cancellation) => {
      handlerStarted.resolve(undefined);
      await cancellation.whenRequested();
      cancellationObserved = cancellation.requested;
      return err(Object.freeze({ kind: "cancelled" as const }));
    }),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);
  const requested = await next(runtime);
  assert.equal(requested.kind, "toolRequested");
  if (requested.kind !== "toolRequested") {
    return;
  }
  assert.ok(
    runtime.resolveToolApproval(
      started.value.turnId,
      requested.callId,
      true,
    ).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  const pending = runtime.nextEvent();
  await handlerStarted.promise;
  const stopped = runtime.stop();
  await pending;
  assert.ok((await stopped).ok);
  assert.equal(cancellationObserved, true);
  assert.equal(runtime.conversation.length, 2);
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.ok(exchange.results.at(0) instanceof ToolResult);
});
