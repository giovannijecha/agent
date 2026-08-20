import assert from "node:assert/strict";
import test from "node:test";

import {
  type CancellationSignal,
  AgentRuntime,
  type ModelStream,
  type ModelStreamEvent,
  type ModelTurnOptions,
  type RuntimeCleanupFailure,
  type StreamingModel,
  type ThinkingEffort,
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
  ListSchema,
  ObjectSchema,
  StringSchema,
  ToolDescriptor,
  ToolEffectPlan,
  ToolEngine,
  type ToolHandler,
  ToolHandlerOutcome,
  ToolRegistry,
  type ToolPlanner,
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
  seenOptions: ModelTurnOptions | undefined;

  constructor(opened: Result<ModelStream<E>, E>) {
    this.#opened = opened;
  }

  async open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    _tools: readonly ToolDescriptor[],
    options: ModelTurnOptions,
  ): Promise<Result<ModelStream<E>, E>> {
    this.calls += 1;
    this.seen = conversation;
    this.cancellation = cancellation;
    this.seenOptions = options;
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
  readonly options: ModelTurnOptions[] = [];

  constructor(streams: ModelStream<E>[]) {
    this.#streams = [...streams];
  }

  async open(
    conversation: Conversation,
    _cancellation: CancellationSignal,
    _tools: readonly ToolDescriptor[],
    options: ModelTurnOptions,
  ): Promise<Result<ModelStream<E>, E>> {
    const stream = this.#streams.shift();
    if (stream === undefined) {
      throw new Error("stream sequence exhausted");
    }
    this.conversations.push(conversation);
    this.options.push(options);
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

function namedToolBatchEvent(
  calls: readonly Readonly<{
    callId: string;
    name: "read_file" | "search_text";
    path: string;
  }>[],
): ModelStreamEvent {
  return Object.freeze({
    calls: Object.freeze(
      calls.map((call) =>
        Object.freeze({
          callId: call.callId,
          input: toolInput(call.path),
          name: call.name,
        }),
      ),
    ),
    kind: "toolCalls" as const,
  });
}

function toolEngine(
  risk: "read" | "write" = "read",
  handler: ToolHandler = async () =>
    ok(ToolHandlerOutcome.success({ text: "owned" })),
  scheduling: "independentRead" | "serial" = "serial",
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
    scheduling === "independentRead"
      ? {
          descriptor: descriptor.value,
          handler,
          scheduling: "independentRead" as const,
        }
      : {
          descriptor: descriptor.value,
          handler,
        },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

function mixedReadToolEngine(handler: ToolHandler): ToolEngine {
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
  const enrolled = ToolDescriptor.create(
    "read_file",
    "Read one bounded workspace file.",
    "read",
    input.value,
    Object.freeze([]),
  );
  const serial = ToolDescriptor.create(
    "search_text",
    "Search bounded workspace text serially.",
    "read",
    input.value,
    Object.freeze([]),
  );
  assert.ok(enrolled.ok);
  assert.ok(serial.ok);
  const registry = ToolRegistry.create([
    {
      descriptor: enrolled.value,
      handler,
      scheduling: "independentRead" as const,
    },
    { descriptor: serial.value, handler },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

function plannedToolEngine(planner: ToolPlanner): ToolEngine {
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
    "Prepare one bounded workspace mutation.",
    "write",
    input.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
    ]),
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    { descriptor: descriptor.value, planner },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

function boundedPatchToolEngine(planner: ToolPlanner): ToolEngine {
  const path = StringSchema.create(1, 256, {
    maximumProjectionCodeUnits: 32,
  });
  const text = StringSchema.create(0, 16);
  assert.ok(path.ok);
  assert.ok(text.ok);
  const hunk = ObjectSchema.create([
    {
      description: "Exact source anchor.",
      name: "oldText",
      required: true,
      schema: text.value,
    },
    {
      description: "Replacement text.",
      name: "newText",
      required: true,
      schema: text.value,
    },
  ]);
  assert.ok(hunk.ok);
  const hunks = ListSchema.create(hunk.value, 1, 4, {
    maximumTextCodeUnits: 8,
    maximumTextUtf8Bytes: 32,
  });
  assert.ok(hunks.ok);
  const input = ObjectSchema.create([
    {
      description: "Workspace-relative path.",
      name: "path",
      required: true,
      schema: path.value,
    },
    {
      description: "Ordered exact-text hunks.",
      name: "hunks",
      required: true,
      schema: hunks.value,
    },
  ]);
  assert.ok(input.ok);
  const descriptor = ToolDescriptor.create(
    "apply_patch",
    "Apply one bounded structured text patch.",
    "write",
    input.value,
    Object.freeze([
      Object.freeze({ mode: "exact" as const, name: "path" }),
      Object.freeze({ mode: "size" as const, name: "hunks" }),
    ]),
  );
  assert.ok(descriptor.ok);
  const registry = ToolRegistry.create([
    { descriptor: descriptor.value, planner },
  ]);
  assert.ok(registry.ok);
  const engine = ToolEngine.create(registry.value);
  assert.ok(engine.ok);
  return engine.value;
}

function patchToolInput(
  path: string,
  oldText: string,
  newText: string,
): StructuredObject {
  const input = structuredValueFromUnknown({
    hunks: [{ newText, oldText }],
    path,
  });
  assert.ok(input.ok && input.value instanceof StructuredObject);
  return input.value;
}

async function next<E>(runtime: AgentRuntime<E>) {
  const result = await runtime.nextEvent();
  assert.ok(result.ok);
  return result.value;
}

function decideTool<E>(
  runtime: AgentRuntime<E>,
  turnId: number,
  callId: string,
  allowed = true,
): void {
  assert.ok(runtime.resolveToolPermission(turnId, callId, allowed).ok);
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
      const committed = runtime.commitTurn(event.turnId);
      assert.ok(committed.ok);
      if (committed.ok) {
        assert.equal(committed.value.kind, "committed");
      }
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
      value: { historyNodeId: 1, kind: "committed" },
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

test("streams reasoning separately and commits it only with the final answer", async () => {
  const stream = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "reasoningDelta" as const, text: "inspect " })),
    ok(Object.freeze({ kind: "reasoningDelta" as const, text: "carefully" })),
    ok(Object.freeze({ kind: "delta" as const, text: "answer" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new FixedModel(ok(stream));
  const runtime = new AgentRuntime(model);

  const started = runtime.startTurn("question", "medium");
  assert.ok(started.ok);
  if (!started.ok) return;
  assert.equal(runtime.conversation.length, 0);

  assert.deepEqual(await next(runtime), {
    kind: "reasoningDelta",
    text: "inspect ",
    turnId: started.value.turnId,
  });
  assert.deepEqual(await next(runtime), {
    kind: "reasoningDelta",
    text: "carefully",
    turnId: started.value.turnId,
  });
  assert.deepEqual(model.seenOptions, { thinkingEffort: "medium" });
  assert.equal(runtime.conversation.length, 0);

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind !== "turnPrepared") return;
  assert.equal(prepared.assistant.content, "answer");
  assert.equal(prepared.assistant.reasoning, "inspect carefully");
  assert.ok(runtime.commitTurn(prepared.turnId).ok);

  const assistant = runtime.conversation.entries.at(-1);
  assert.equal(assistant instanceof Message, true);
  if (assistant instanceof Message) {
    assert.equal(assistant.content, "answer");
    assert.equal(assistant.reasoning, "inspect carefully");
  }
});

test("branches from a selected node and restores either retained path", async () => {
  const model = new SequenceModel<string>([
    new ScriptedStream([
      ok(Object.freeze({ kind: "delta" as const, text: "root answer" })),
      ok(Object.freeze({ kind: "done" as const })),
    ]),
    new ScriptedStream([
      ok(Object.freeze({ kind: "delta" as const, text: "original answer" })),
      ok(Object.freeze({ kind: "done" as const })),
    ]),
    new ScriptedStream([
      ok(Object.freeze({ kind: "delta" as const, text: "branch answer" })),
      ok(Object.freeze({ kind: "done" as const })),
    ]),
    new ScriptedStream([
      ok(Object.freeze({ kind: "delta" as const, text: "follow answer" })),
      ok(Object.freeze({ kind: "done" as const })),
    ]),
  ]);
  const runtime = new AgentRuntime(model);

  const root = runtime.startTurn("root question");
  assert.ok(root.ok);
  if (root.ok) assert.equal(root.value.historyParentNodeId, 0);
  assert.equal((await drainTurn(runtime)).outcome.kind, "completed");

  const original = runtime.startTurn("original question");
  assert.ok(original.ok);
  if (original.ok) assert.equal(original.value.historyParentNodeId, 1);
  assert.equal((await drainTurn(runtime)).outcome.kind, "completed");

  assert.deepEqual(runtime.selectConversationNode(1), ok(undefined));
  const branch = runtime.startTurn("branch question");
  assert.ok(branch.ok);
  if (branch.ok) assert.equal(branch.value.historyParentNodeId, 1);
  assert.deepEqual(runtime.selectConversationNode(2), {
    ok: false,
    error: { kind: "busy" },
  });
  assert.equal((await drainTurn(runtime)).outcome.kind, "completed");

  assert.deepEqual(runtime.selectConversationNode(2), ok(undefined));
  assert.deepEqual(runtime.selectConversationNode(99), {
    ok: false,
    error: { kind: "invalidHistoryNode" },
  });
  const recovered = runtime.startTurn("follow original");
  assert.ok(recovered.ok);
  if (recovered.ok) assert.equal(recovered.value.historyParentNodeId, 2);
  assert.equal((await drainTurn(runtime)).outcome.kind, "completed");

  const branchConversation = model.conversations.at(2);
  assert.deepEqual(
    branchConversation?.entries.map((entry) =>
      entry instanceof Message ? entry.content : "tool exchange",
    ),
    ["root question", "root answer", "branch question"],
  );
  const recoveredConversation = model.conversations.at(3);
  assert.deepEqual(
    recoveredConversation?.entries.map((entry) =>
      entry instanceof Message ? entry.content : "tool exchange",
    ),
    [
      "root question",
      "root answer",
      "original question",
      "original answer",
      "follow original",
    ],
  );
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
    value: { historyNodeId: undefined, kind: "cancelled" },
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
    error: { kind: "historyTooLong" },
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
    cleanup: {
      ok: false,
      error: { failures: [{ kind: "model", error: "close failed" }] },
    },
    settledTurn: undefined,
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

  assert.deepEqual(await activeRuntime.stop(), {
    cleanup: ok(undefined),
    settledTurn: undefined,
  });
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
    cleanup: {
      ok: false,
      error: { failures: [{ error: "close failed", kind: "model" }] },
    },
    settledTurn: undefined,
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
  decideTool(runtime, started.value.turnId, "call-1");
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

test("checkpoints tool-loop reasoning and reopens the same effort", async () => {
  const first = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "reasoningDelta" as const, text: "inspect file" })),
    ok(toolCallEvent("call-reasoning")),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "reasoningDelta" as const, text: "use result" })),
    ok(Object.freeze({ kind: "delta" as const, text: "done" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second]);
  const runtime = new AgentRuntime(model, toolEngine());
  const started = runtime.startTurn("inspect", "high");
  assert.ok(started.ok);
  if (!started.ok) return;

  assert.equal((await next(runtime)).kind, "reasoningDelta");
  const requested = await next(runtime);
  assert.equal(requested.kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-reasoning");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");

  const exchange = runtime.conversation.entries.at(1);
  assert.equal(exchange instanceof ToolExchange, true);
  if (exchange instanceof ToolExchange) {
    assert.equal(exchange.reasoning, "inspect file");
  }
  assert.equal((await next(runtime)).kind, "reasoningDelta");
  const reopenedExchange = model.conversations.at(1)?.entries.at(1);
  assert.equal(reopenedExchange instanceof ToolExchange, true);
  if (reopenedExchange instanceof ToolExchange) {
    assert.equal(reopenedExchange.reasoning, "inspect file");
  }
  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind === "turnPrepared") {
    assert.equal(prepared.assistant.reasoning, "use result");
    assert.ok(runtime.commitTurn(prepared.turnId).ok);
  }
  assert.deepEqual(model.options, [
    { thinkingEffort: "high" },
    { thinkingEffort: "high" },
  ]);
});

test("accepts each exact enabled reasoning effort", async () => {
  for (const effort of ["low", "medium", "high"] as const) {
    const model = new FixedModel(ok(new ScriptedStream<string>([
      ok(Object.freeze({ kind: "reasoningDelta" as const, text: effort })),
      ok(Object.freeze({ kind: "delta" as const, text: "answer" })),
      ok(Object.freeze({ kind: "done" as const })),
    ])));
    const runtime = new AgentRuntime(model);
    const started = runtime.startTurn("question", effort);
    assert.ok(started.ok);
    if (!started.ok) continue;
    assert.equal((await next(runtime)).kind, "reasoningDelta");
    assert.equal((await next(runtime)).kind, "assistantDelta");
    assert.equal((await next(runtime)).kind, "turnPrepared");
    assert.deepEqual(model.seenOptions, { thinkingEffort: effort });
  }
});

test("rejects invalid effort before opening the model", () => {
  const model = new FixedModel<string>(err("must not open"));
  const runtime = new AgentRuntime(model);
  const started = runtime.startTurn("question", "max" as ThinkingEffort);

  assert.deepEqual(started, {
    error: { kind: "invalidThinkingEffort" },
    ok: false,
  });
  assert.equal(model.calls, 0);
});

test("rejects off, late, empty, and oversized reasoning without settlement", async () => {
  const cases = [
    Object.freeze({
      mode: "off" as const,
      steps: [
        ok(Object.freeze({ kind: "reasoningDelta" as const, text: "hidden" })),
      ],
      failure: "invalidModelEvent",
    }),
    Object.freeze({
      mode: "high" as const,
      steps: [
        ok(Object.freeze({ kind: "delta" as const, text: "answer" })),
        ok(Object.freeze({ kind: "reasoningDelta" as const, text: "late" })),
      ],
      failure: "invalidModelEvent",
    }),
    Object.freeze({
      mode: "low" as const,
      steps: [
        ok(Object.freeze({ kind: "reasoningDelta" as const, text: "" })),
      ],
      failure: "emptyReasoningDelta",
    }),
    Object.freeze({
      mode: "medium" as const,
      steps: [
        ok(Object.freeze({
          kind: "reasoningDelta" as const,
          text: "x".repeat(16_385),
        })),
      ],
      failure: "reasoningTooLong",
    }),
  ] as const;

  for (const item of cases) {
    const runtime = new AgentRuntime(
      new FixedModel(ok(new ScriptedStream<string>([...item.steps]))),
    );
    assert.ok(runtime.startTurn("question", item.mode).ok);
    let terminal = await next(runtime);
    if (terminal.kind === "assistantDelta") terminal = await next(runtime);
    assert.equal(terminal.kind, "turnFinished");
    if (terminal.kind === "turnFinished") {
      assert.equal(terminal.outcome.kind, "failed");
      if (terminal.outcome.kind === "failed") {
        assert.equal(terminal.outcome.failure.kind, item.failure);
      }
      assert.equal(terminal.historyNodeId, undefined);
    }
    assert.equal(runtime.conversation.length, 0);
  }
});

test("checkpoints an observed tool failure and lets the model continue", async () => {
  const first = new ScriptedStream<string>([
    ok(toolCallEvent("call-failed")),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "recovered" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second]);
  const runtime = new AgentRuntime(
    model,
    toolEngine(
      "read",
      async () =>
        ok(
          ToolHandlerOutcome.failure({
            exitCode: 23,
            stderr: "bounded diagnostic",
            stdout: "bounded output",
          }),
        ),
    ),
  );
  const started = runtime.startTurn("run it");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-failed");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const finished = await next(runtime);
  assert.equal(finished.kind, "toolFinished");
  if (finished.kind === "toolFinished") {
    assert.equal(finished.status, "failure");
  }

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  const result = exchange.results.at(0);
  assert.ok(result instanceof ToolResult);
  assert.equal(result.status, "failure");
  assert.ok(result.output instanceof StructuredObject);
  assert.equal(result.output.get("exitCode"), 23);
  assert.equal(result.output.get("stderr"), "bounded diagnostic");
  assert.equal(result.output.get("stdout"), "bounded output");

  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind === "turnPrepared") {
    assert.equal(prepared.checkpointed, true);
  }
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
      return ok(ToolHandlerOutcome.success({ text: path }));
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
  decideTool(runtime, started.value.turnId, "call-html");
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
  decideTool(runtime, started.value.turnId, "call-script");
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

test("overlaps an enrolled read cohort and reduces results in provider order", async () => {
  const firstEntered = new Deferred<void>();
  const secondEntered = new Deferred<void>();
  const firstRelease = new Deferred<void>();
  const secondRelease = new Deferred<void>();
  const secondSettled = new Deferred<void>();
  const observed: string[] = [];
  const first = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-first", path: "first.txt" },
        { callId: "call-second", path: "second.txt" },
      ]),
    ),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "both observed" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second]);
  const runtime = new AgentRuntime(
    model,
    toolEngine(
      "read",
      async (input) => {
        const path = input.get("path");
        assert.equal(typeof path, "string");
        observed.push(path as string);
        if (path === "first.txt") {
          firstEntered.resolve(undefined);
          await firstRelease.promise;
        } else {
          secondEntered.resolve(undefined);
          await secondRelease.promise;
          secondSettled.resolve(undefined);
        }
        return ok(ToolHandlerOutcome.success({ text: path }));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  const firstRequested = await next(runtime);
  assert.equal(firstRequested.kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-first");
  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  if (secondRequested.kind === "toolRequested") {
    assert.equal(secondRequested.callId, "call-second");
  }
  assert.deepEqual(observed, []);
  decideTool(runtime, started.value.turnId, "call-second");
  const firstStarted = await next(runtime);
  assert.equal(firstStarted.kind, "toolStarted");
  assert.deepEqual(observed, []);
  const secondStarted = await next(runtime);
  assert.equal(secondStarted.kind, "toolStarted");
  assert.deepEqual(observed, []);
  if (firstStarted.kind === "toolStarted") {
    assert.equal(firstStarted.callId, "call-first");
  }
  if (secondStarted.kind === "toolStarted") {
    assert.equal(secondStarted.callId, "call-second");
  }

  const firstFinishedOperation = runtime.nextEvent();
  await firstEntered.promise;
  await secondEntered.promise;
  assert.deepEqual(observed, ["first.txt", "second.txt"]);
  secondRelease.resolve(undefined);
  await secondSettled.promise;
  assert.equal(runtime.conversation.length, 0);
  firstRelease.resolve(undefined);

  const firstFinishedResult = await firstFinishedOperation;
  assert.ok(firstFinishedResult.ok);
  assert.equal(firstFinishedResult.value.kind, "toolFinished");
  if (firstFinishedResult.value.kind === "toolFinished") {
    assert.equal(firstFinishedResult.value.callId, "call-first");
  }
  assert.equal(runtime.conversation.length, 0);
  const secondFinished = await next(runtime);
  assert.equal(secondFinished.kind, "toolFinished");
  if (secondFinished.kind === "toolFinished") {
    assert.equal(secondFinished.callId, "call-second");
  }

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.results.map((result) => result.callId),
    ["call-first", "call-second"],
  );
  assert.equal((await next(runtime)).kind, "assistantDelta");
  assert.equal((await next(runtime)).kind, "turnPrepared");
  assert.equal(model.conversations.at(1)?.messageUnits, 4);
});

test("admits four enrolled reads into one fixed-width cohort", async () => {
  const allEntered = new Deferred<void>();
  const release = new Deferred<void>();
  let handlerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-1", path: "1.txt" },
        { callId: "call-2", path: "2.txt" },
        { callId: "call-3", path: "3.txt" },
        { callId: "call-4", path: "4.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async () => {
        handlerCalls += 1;
        if (handlerCalls === 4) {
          allEntered.resolve(undefined);
        }
        await release.promise;
        return ok(ToolHandlerOutcome.success({}));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect four files");
  assert.ok(started.ok);

  for (let index = 1; index <= 4; index += 1) {
    const requested = await next(runtime);
    assert.equal(requested.kind, "toolRequested");
    decideTool(
      runtime,
      started.value.turnId,
      "call-" + String(index),
    );
  }
  for (let index = 1; index <= 4; index += 1) {
    const toolStarted = await next(runtime);
    assert.equal(toolStarted.kind, "toolStarted");
    assert.equal(handlerCalls, 0);
  }

  const firstFinished = runtime.nextEvent();
  await allEntered.promise;
  assert.equal(handlerCalls, 4);
  release.resolve(undefined);
  assert.ok((await firstFinished).ok);
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolFinished");
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.equal(exchange.results.length, 4);
});

test("keeps a mixed scheduling batch on the sequential path", async () => {
  const firstEntered = new Deferred<void>();
  const releaseFirst = new Deferred<void>();
  const observed: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      namedToolBatchEvent([
        { callId: "call-enrolled", name: "read_file", path: "one.txt" },
        { callId: "call-serial", name: "search_text", path: "two.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    mixedReadToolEngine(async (input) => {
      const path = input.get("path");
      assert.equal(typeof path, "string");
      observed.push(path as string);
      if (path === "one.txt") {
        firstEntered.resolve(undefined);
        await releaseFirst.promise;
      }
      return ok(ToolHandlerOutcome.success({ text: path }));
    }),
  );
  const started = runtime.startTurn("inspect a mixed batch");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-enrolled");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const firstFinished = runtime.nextEvent();
  await firstEntered.promise;
  assert.deepEqual(observed, ["one.txt"]);
  releaseFirst.resolve(undefined);
  assert.ok((await firstFinished).ok);
  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  if (secondRequested.kind === "toolRequested") {
    assert.equal(secondRequested.callId, "call-serial");
  }
  assert.deepEqual(observed, ["one.txt"]);
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  assert.equal((await next(runtime)).kind, "turnFinished");
});

test("resolves every read permission before starting an allowed cohort", async () => {
  const observed: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-denied", path: "private.txt" },
        { callId: "call-allowed", path: "public.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async (input) => {
        const path = input.get("path");
        assert.equal(typeof path, "string");
        observed.push(path as string);
        return ok(ToolHandlerOutcome.success({ text: path }));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect permitted files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-denied", false);
  const allowedRequest = await next(runtime);
  assert.equal(allowedRequest.kind, "toolRequested");
  assert.deepEqual(observed, []);
  decideTool(runtime, started.value.turnId, "call-allowed");
  const allowedStarted = await next(runtime);
  assert.equal(allowedStarted.kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["public.txt"]);

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.results.map((result) => result.status),
    ["failure", "success"],
  );
  const denied = exchange.results.at(0);
  assert.ok(denied?.output instanceof StructuredObject);
  assert.equal(denied.output.get("error"), "denied");
});

test("cancels an enrolled read batch before cohort start without invocation", async () => {
  let handlerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-first", path: "first.txt" },
        { callId: "call-second", path: "second.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async () => {
        handlerCalls += 1;
        return ok(ToolHandlerOutcome.success({}));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-first");
  assert.equal((await next(runtime)).kind, "toolRequested");
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "cancelled");
    assert.equal(terminal.checkpointed, false);
    assert.equal(terminal.historyNodeId, undefined);
  }
  assert.equal(handlerCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("settles every started read after cancellation and checkpoints provider order", async () => {
  const entered = new Deferred<void>();
  let handlerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-first", path: "first.txt" },
        { callId: "call-second", path: "second.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async (_input, cancellation) => {
        handlerCalls += 1;
        if (handlerCalls === 2) {
          entered.resolve(undefined);
        }
        await cancellation.whenRequested();
        return err(Object.freeze({ kind: "cancelled" as const }));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-first");
  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-second");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const firstFinished = runtime.nextEvent();
  await entered.promise;
  assert.equal(handlerCalls, 2);
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  const firstFinishedResult = await firstFinished;
  assert.ok(firstFinishedResult.ok);
  assert.equal(firstFinishedResult.value.kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolFinished");
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "cancelled");
    assert.equal(terminal.checkpointed, true);
    assert.equal(terminal.historyNodeId, 1);
    assert.ok(runtime.acknowledgeTurn(terminal.turnId).ok);
  }
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.results.map((result) => result.callId),
    ["call-first", "call-second"],
  );
  assert.deepEqual(runtime.selectConversationNode(0), ok(undefined));
  assert.equal(runtime.conversation.length, 0);
  assert.deepEqual(runtime.selectConversationNode(1), ok(undefined));
  assert.equal(runtime.conversation.length, 2);
});

test("falls back to sequential execution above the fixed read cohort bound", async () => {
  const firstEntered = new Deferred<void>();
  const releaseFirst = new Deferred<void>();
  const observed: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-1", path: "1.txt" },
        { callId: "call-2", path: "2.txt" },
        { callId: "call-3", path: "3.txt" },
        { callId: "call-4", path: "4.txt" },
        { callId: "call-5", path: "5.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async (input) => {
        const path = input.get("path");
        assert.equal(typeof path, "string");
        observed.push(path as string);
        if (path === "1.txt") {
          firstEntered.resolve(undefined);
          await releaseFirst.promise;
        }
        return ok(ToolHandlerOutcome.success({ text: path }));
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect five files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-1");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const firstFinished = runtime.nextEvent();
  await firstEntered.promise;
  assert.deepEqual(observed, ["1.txt"]);
  releaseFirst.resolve(undefined);
  assert.ok((await firstFinished).ok);
  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  if (secondRequested.kind === "toolRequested") {
    assert.equal(secondRequested.callId, "call-2");
  }
  assert.deepEqual(observed, ["1.txt"]);
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
});

test("settles a complete read cohort before reporting a handler contract failure", async () => {
  const observed: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-invalid", path: "invalid.txt" },
        { callId: "call-valid", path: "valid.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    toolEngine(
      "read",
      async (input) => {
        const path = input.get("path");
        assert.equal(typeof path, "string");
        observed.push(path as string);
        return ok(
          ToolHandlerOutcome.success({
            text: path === "invalid.txt" ? "x".repeat(262_145) : path,
          }),
        );
      },
      "independentRead",
    ),
  );
  const started = runtime.startTurn("inspect both files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-invalid");
  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-valid");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const firstFinished = await next(runtime);
  assert.equal(firstFinished.kind, "toolFinished");
  if (firstFinished.kind === "toolFinished") {
    assert.equal(firstFinished.callId, "call-invalid");
    assert.equal(firstFinished.status, "failure");
  }
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["invalid.txt", "valid.txt"]);

  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.deepEqual(
    exchange.results.map((result) => result.callId),
    ["call-invalid", "call-valid"],
  );
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
        ? ok(ToolHandlerOutcome.success({ text: "x".repeat(262_145) }))
        : ok(ToolHandlerOutcome.success({ text: path }));
    }),
  );
  const started = runtime.startTurn("inspect three files");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-first");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-invalid");
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
  decideTool(runtime, started.value.turnId, "call-running");
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
      return ok(ToolHandlerOutcome.success({ text: "unreachable" }));
    }),
  );
  assert.ok(runtime.startTurn("inspect both files").ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "invalidToolCall");
      if (terminal.outcome.failure.kind === "invalidToolCall") {
        assert.equal(terminal.outcome.failure.reason, "unknownTool");
      }
    }
    assert.equal(terminal.checkpointed, false);
  }
  assert.equal(handlerCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("rejects an invalid batch before any effect planner can observe state", async () => {
  let plannerCalls = 0;
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
    plannedToolEngine(async () => {
      plannerCalls += 1;
      return err(Object.freeze({ kind: "conflict" as const }));
    }),
  );
  assert.ok(runtime.startTurn("change both files").ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  assert.equal(plannerCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("rejects a later aggregate-invalid patch before any planner effect", async () => {
  let plannerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      Object.freeze({
        calls: Object.freeze([
          Object.freeze({
            callId: "call-valid",
            input: patchToolInput("first.txt", "one", "two"),
            name: "apply_patch",
          }),
          Object.freeze({
            callId: "call-oversized",
            input: patchToolInput("second.txt", "three", "four"),
            name: "apply_patch",
          }),
        ]),
        kind: "toolCalls" as const,
      }),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    boundedPatchToolEngine(async () => {
      plannerCalls += 1;
      return err(Object.freeze({ kind: "conflict" as const }));
    }),
  );
  assert.ok(runtime.startTurn("change both files").ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "invalidToolCall");
      if (terminal.outcome.failure.kind === "invalidToolCall") {
        assert.equal(terminal.outcome.failure.reason, "invalidInput");
      }
    }
    assert.equal(terminal.checkpointed, false);
  }
  assert.equal(plannerCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("rejects a later projection-invalid patch before any planner effect", async () => {
  let plannerCalls = 0;
  const stream = new ScriptedStream<string>([
    ok(
      Object.freeze({
        calls: Object.freeze([
          Object.freeze({
            callId: "call-valid",
            input: patchToolInput("first.txt", "one", "two"),
            name: "apply_patch",
          }),
          Object.freeze({
            callId: "call-oversized-path",
            input: patchToolInput("\\".repeat(16), "three", "four"),
            name: "apply_patch",
          }),
        ]),
        kind: "toolCalls" as const,
      }),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    boundedPatchToolEngine(async () => {
      plannerCalls += 1;
      return err(Object.freeze({ kind: "conflict" as const }));
    }),
  );
  assert.ok(runtime.startTurn("change both files").ok);
  const terminal = await next(runtime);
  assert.equal(terminal.kind, "turnFinished");
  if (terminal.kind === "turnFinished") {
    assert.equal(terminal.outcome.kind, "failed");
    if (terminal.outcome.kind === "failed") {
      assert.equal(terminal.outcome.failure.kind, "invalidToolCall");
      if (terminal.outcome.failure.kind === "invalidToolCall") {
        assert.equal(terminal.outcome.failure.reason, "invalidInput");
      }
    }
    assert.equal(terminal.checkpointed, false);
  }
  assert.equal(plannerCalls, 0);
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
    runtime.resolveToolPermission(started.value.turnId, "wrong", false),
    { ok: false, error: { kind: "notAwaitingPermission" } },
  );
  assert.ok(
    runtime.resolveToolPermission(
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
      return ok(ToolHandlerOutcome.success({ changed: path }));
    }),
  );
  const started = runtime.startTurn("change both files");
  assert.ok(started.ok);

  const firstRequested = await next(runtime);
  assert.equal(firstRequested.kind, "toolRequested");
  assert.equal(observed.length, 0);
  assert.ok(
    runtime.resolveToolPermission(started.value.turnId, "call-one", true).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["one.txt"]);

  const secondRequested = await next(runtime);
  assert.equal(secondRequested.kind, "toolRequested");
  assert.deepEqual(
    runtime.resolveToolPermission(started.value.turnId, "call-one", true),
    { ok: false, error: { kind: "notAwaitingPermission" } },
  );
  assert.equal(observed.length, 1);
  assert.ok(
    runtime.resolveToolPermission(started.value.turnId, "call-two", true).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(observed, ["one.txt", "two.txt"]);
  assert.equal((await next(runtime)).kind, "assistantDelta");
});

test("plans each mutation just in time after complete batch validation", async () => {
  const plannedPaths: string[] = [];
  const invokedPaths: string[] = [];
  const stream = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-one", path: "one.txt" },
        { callId: "call-two", path: "two.txt" },
      ]),
    ),
  ]);
  const runtime = new AgentRuntime(
    new FixedModel(ok(stream)),
    plannedToolEngine(async (input) => {
      const path = input.get("path");
      assert.equal(typeof path, "string");
      plannedPaths.push(path as string);
      const effect = ToolEffectPlan.create(
        'operation="apply_patch" path="' + String(path) + '"',
        async () => {
          invokedPaths.push(path as string);
          return ok(ToolHandlerOutcome.success({ changed: true }));
        },
      );
      assert.ok(effect.ok);
      return ok(effect.value);
    }),
  );
  const started = runtime.startTurn("change both files");
  assert.ok(started.ok);

  const first = await next(runtime);
  assert.equal(first.kind, "toolRequested");
  assert.deepEqual(plannedPaths, ["one.txt"]);
  assert.deepEqual(invokedPaths, []);
  assert.ok(
    runtime.resolveToolPermission(started.value.turnId, "call-one", true).ok,
  );
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.deepEqual(invokedPaths, ["one.txt"]);

  const second = await next(runtime);
  assert.equal(second.kind, "toolRequested");
  assert.deepEqual(plannedPaths, ["one.txt", "two.txt"]);
  assert.deepEqual(invokedPaths, ["one.txt"]);
  assert.ok(runtime.requestCancel(started.value.turnId).ok);
  assert.equal((await next(runtime)).kind, "turnFinished");
});

test("cancellation during effect planning wins before an approval is exposed", async () => {
  const plannerStarted = new Deferred<void>();
  const releasePlanner = new Deferred<void>();
  let effectCalls = 0;
  const runtime = new AgentRuntime(
    new FixedModel(
      ok(
        new ScriptedStream<string>([
          ok(toolCallEvent("call-planning")),
        ]),
      ),
    ),
    plannedToolEngine(async (_input, cancellation) => {
      plannerStarted.resolve(undefined);
      await releasePlanner.promise;
      assert.equal(cancellation.requested, true);
      const effect = ToolEffectPlan.create(
        'operation="apply_patch" path="planned.txt"',
        async () => {
          effectCalls += 1;
          return ok(ToolHandlerOutcome.success({ changed: true }));
        },
      );
      assert.ok(effect.ok);
      return ok(effect.value);
    }),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);
  const pending = runtime.nextEvent();
  await plannerStarted.promise;
  assert.deepEqual(runtime.requestCancel(started.value.turnId), ok(true));
  releasePlanner.resolve(undefined);

  const terminal = await pending;
  assert.ok(terminal.ok);
  assert.equal(terminal.value.kind, "turnFinished");
  if (terminal.value.kind === "turnFinished") {
    assert.equal(terminal.value.outcome.kind, "cancelled");
    assert.equal(terminal.value.checkpointed, false);
  }
  assert.equal(effectCalls, 0);
  assert.equal(runtime.conversation.length, 0);
});

test("reports an effect-planning conflict without requesting approval", async () => {
  const first = new ScriptedStream<string>([
    ok(toolCallEvent("call-stale")),
  ]);
  const second = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "replanned" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const runtime = new AgentRuntime(
    new SequenceModel([first, second]),
    plannedToolEngine(async () =>
      err(Object.freeze({ kind: "conflict" as const })),
    ),
  );
  const started = runtime.startTurn("change");
  assert.ok(started.ok);

  const requested = await next(runtime);
  assert.equal(requested.kind, "toolRequested");
  if (requested.kind === "toolRequested") {
    assert.equal(requested.approvalRequired, false);
    assert.equal(requested.approvalPreview, "");
  }
  decideTool(runtime, started.value.turnId, "call-stale");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const finished = await next(runtime);
  assert.equal(finished.kind, "toolFinished");
  if (finished.kind === "toolFinished") {
    assert.equal(finished.status, "failure");
  }
  assert.equal((await next(runtime)).kind, "assistantDelta");
});

test("returns a stale batched mutation to the model and converges on a corrective step", async () => {
  let content = "initial";
  const planned: string[] = [];
  const first = new ScriptedStream<string>([
    ok(
      toolBatchEvent([
        { callId: "call-remove", path: "remove" },
        { callId: "call-stale", path: "stale-theme" },
      ]),
    ),
  ]);
  const second = new ScriptedStream<string>([
    ok(toolCallEvent("call-corrective", toolInput("corrective-theme"))),
  ]);
  const third = new ScriptedStream<string>([
    ok(Object.freeze({ kind: "delta" as const, text: "task complete" })),
    ok(Object.freeze({ kind: "done" as const })),
  ]);
  const model = new SequenceModel([first, second, third]);
  const runtime = new AgentRuntime(
    model,
    plannedToolEngine(async (input) => {
      const operation = input.get("path");
      assert.equal(typeof operation, "string");
      planned.push(operation as string);
      if (operation === "stale-theme") {
        assert.equal(content, "emoji-removed");
        return err(Object.freeze({ kind: "conflict" as const }));
      }
      const expected = operation === "remove" ? "initial" : "emoji-removed";
      const replacement = operation === "remove" ? "emoji-removed" : "dark";
      if (content !== expected) {
        return err(Object.freeze({ kind: "conflict" as const }));
      }
      const effect = ToolEffectPlan.create(
        'operation="apply_patch" path="index.html"',
        async () => {
          content = replacement;
          return ok(ToolHandlerOutcome.success({ changed: true }));
        },
      );
      assert.ok(effect.ok);
      return ok(effect.value);
    }),
  );
  const started = runtime.startTurn("remove the emoji and apply a dark theme");
  assert.ok(started.ok);

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-remove");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal(content, "emoji-removed");

  const staleRequest = await next(runtime);
  assert.equal(staleRequest.kind, "toolRequested");
  if (staleRequest.kind === "toolRequested") {
    assert.equal(staleRequest.approvalRequired, false);
  }
  decideTool(runtime, started.value.turnId, "call-stale");
  assert.equal((await next(runtime)).kind, "toolStarted");
  const staleFinished = await next(runtime);
  assert.equal(staleFinished.kind, "toolFinished");
  if (staleFinished.kind === "toolFinished") {
    assert.equal(staleFinished.status, "failure");
  }

  const failedExchange = runtime.conversation.entries.at(1);
  assert.ok(failedExchange instanceof ToolExchange);
  const staleResult = failedExchange.results.at(1);
  assert.ok(staleResult?.output instanceof StructuredObject);
  assert.equal(staleResult.output.get("error"), "conflict");

  assert.equal((await next(runtime)).kind, "toolRequested");
  decideTool(runtime, started.value.turnId, "call-corrective");
  assert.equal((await next(runtime)).kind, "toolStarted");
  assert.equal((await next(runtime)).kind, "toolFinished");
  assert.equal(content, "dark");
  assert.equal((await next(runtime)).kind, "assistantDelta");
  const prepared = await next(runtime);
  assert.equal(prepared.kind, "turnPrepared");
  if (prepared.kind === "turnPrepared") {
    assert.equal(prepared.checkpointed, true);
    assert.deepEqual(runtime.commitTurn(prepared.turnId), {
      ok: true,
      value: { historyNodeId: 1, kind: "committed" },
    });
  }
  assert.deepEqual(planned, ["remove", "stale-theme", "corrective-theme"]);
  assert.equal(model.conversations.length, 3);
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
    runtime.resolveToolPermission(
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
  decideTool(runtime, started.value.turnId, "call-boundary");
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
    runtime.resolveToolPermission(
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
  const report = await stopped;
  assert.deepEqual(report.cleanup, ok(undefined));
  assert.equal(report.settledTurn?.outcome.kind, "cancelled");
  assert.equal(report.settledTurn?.turn.settlement, "checkpointed");
  assert.equal(report.settledTurn?.turn.entries.length, 2);
  assert.equal(cancellationObserved, true);
  assert.equal(runtime.conversation.length, 2);
  const exchange = runtime.conversation.entries.at(1);
  assert.ok(exchange instanceof ToolExchange);
  assert.ok(exchange.results.at(0) instanceof ToolResult);
});
