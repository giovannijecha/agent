import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentRuntime,
  type CommitTurnResult,
  type ModelStream,
  type ModelStreamEvent,
  type RuntimeCleanupFailure,
  type RuntimeCommandError,
  type RuntimeEvent,
  type RuntimeSession,
  type RuntimeSourceError,
  type RuntimeStopError,
  type StartedTurn,
  type StartTurnError,
  type StreamingModel,
} from "@agent/runtime";
import {
  err,
  ok,
  type Result,
  type Viewport,
  Viewport as ViewportValue,
} from "@agent/tui";

import { run } from "../dist/run.js";
import type { HostEvent, TerminalHost } from "../dist/terminal-host.js";

class Deferred<T> {
  readonly promise: Promise<T>;
  #reject: (cause: unknown) => void = () => undefined;
  #resolve: (value: T) => void = () => undefined;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  resolve(value: T): void {
    this.#resolve(value);
  }

  reject(cause: unknown): void {
    this.#reject(cause);
  }
}

type CountWaiter = Readonly<{ count: number; resolve: () => void }>;

class ControlledHost implements TerminalHost<string> {
  readonly interactive: boolean;
  readonly writes: string[] = [];
  readonly started = new Deferred<void>();
  #events: Result<HostEvent, string>[] = [];
  #eventWaiter: ((result: Result<HostEvent, string>) => void) | undefined;
  #viewport: Viewport;
  readonly #writeGates = new Map<number, Deferred<void>>();
  #writeWaiters: CountWaiter[] = [];
  startCalls = 0;
  stopCalls = 0;
  stopFailure: string | undefined;
  writeFailure: string | undefined;

  constructor(interactive = true) {
    this.interactive = interactive;
    const size = ViewportValue.create(60, 12);
    assert.ok(size.ok);
    this.#viewport = size.value;
  }

  setViewport(columns: number, rows: number): void {
    const size = ViewportValue.create(columns, rows);
    assert.ok(size.ok);
    this.#viewport = size.value;
  }

  viewport(): Result<Viewport, string> {
    return ok(this.#viewport);
  }

  async write(text: string): Promise<Result<void, string>> {
    this.writes.push(text);
    const retained: CountWaiter[] = [];
    for (const waiter of this.#writeWaiters) {
      if (this.writes.length >= waiter.count) {
        waiter.resolve();
      } else {
        retained.push(waiter);
      }
    }
    this.#writeWaiters = retained;
    const gate = this.#writeGates.get(this.writes.length);
    if (gate !== undefined) {
      await gate.promise;
      this.#writeGates.delete(this.writes.length);
    }
    return this.writeFailure === undefined
      ? ok(undefined)
      : err(this.writeFailure);
  }

  async start(): Promise<Result<void, string>> {
    this.startCalls += 1;
    this.started.resolve(undefined);
    return ok(undefined);
  }

  nextEvent(): Promise<Result<HostEvent, string>> {
    const queued = this.#events.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    if (this.#eventWaiter !== undefined) {
      return Promise.resolve(err("concurrent host read"));
    }
    return new Promise((resolve) => {
      this.#eventWaiter = resolve;
    });
  }

  async stop(): Promise<Result<void, string>> {
    this.stopCalls += 1;
    const waiter = this.#eventWaiter;
    this.#eventWaiter = undefined;
    waiter?.(ok(Object.freeze({ kind: "end" as const })));
    return this.stopFailure === undefined
      ? ok(undefined)
      : err(this.stopFailure);
  }

  emit(event: HostEvent): void {
    this.emitResult(ok(Object.freeze(event)));
  }

  emitResult(result: Result<HostEvent, string>): void {
    const waiter = this.#eventWaiter;
    if (waiter === undefined) {
      this.#events.push(result);
    } else {
      this.#eventWaiter = undefined;
      waiter(result);
    }
  }

  waitForWrites(count: number): Promise<void> {
    if (this.writes.length >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#writeWaiters.push(Object.freeze({ count, resolve }));
    });
  }

  blockWrite(count: number): Deferred<void> {
    const gate = new Deferred<void>();
    this.#writeGates.set(count, gate);
    return gate;
  }
}

class ControlledRuntime implements RuntimeSession<string> {
  readonly inputs: string[] = [];
  #activeTurnId: number | undefined;
  #cancelWaiters: CountWaiter[] = [];
  #events: Result<RuntimeEvent<string>, RuntimeSourceError>[] = [];
  #eventWaiter:
    | ((result: Result<RuntimeEvent<string>, RuntimeSourceError>) => void)
    | undefined;
  #finishedTurnId: number | undefined;
  #readReject: ((cause: unknown) => void) | undefined;
  #readWaiters: CountWaiter[] = [];
  #startWaiters: CountWaiter[] = [];
  cancelCalls = 0;
  readCalls = 0;
  startCalls = 0;
  stopCalls = 0;
  stopFailure: string | undefined;

  startTurn(input: string): Result<StartedTurn, StartTurnError> {
    if (this.#activeTurnId !== undefined) {
      return err(Object.freeze({ kind: "busy" as const }));
    }
    this.startCalls += 1;
    this.inputs.push(input);
    this.#activeTurnId = this.startCalls;
    this.#notifyCount(this.#startWaiters, this.startCalls);
    return ok(
      Object.freeze({
        turnId: this.#activeTurnId,
        user: Object.freeze({ content: input }),
      }) as unknown as StartedTurn,
    );
  }

  requestCancel(turnId: number): Result<boolean, RuntimeCommandError> {
    if (this.#activeTurnId !== turnId) {
      return err(Object.freeze({ kind: "staleTurn" as const }));
    }
    this.cancelCalls += 1;
    this.#notifyCount(this.#cancelWaiters, this.cancelCalls);
    return ok(this.cancelCalls === 1);
  }

  resolveToolApproval(): Result<void, RuntimeCommandError> {
    return err(Object.freeze({ kind: "notAwaitingApproval" as const }));
  }

  commitTurn(turnId: number): Result<CommitTurnResult, RuntimeCommandError> {
    if (this.#activeTurnId !== turnId) {
      return err(Object.freeze({ kind: "staleTurn" as const }));
    }
    this.#activeTurnId = undefined;
    return ok(
      this.cancelCalls > 0
        ? Object.freeze({ kind: "cancelled" as const })
        : Object.freeze({ kind: "committed" as const }),
    );
  }

  acknowledgeTurn(turnId: number): Result<void, RuntimeCommandError> {
    if (this.#finishedTurnId !== turnId) {
      return err(Object.freeze({ kind: "staleTurn" as const }));
    }
    this.#finishedTurnId = undefined;
    return ok(undefined);
  }

  nextEvent(): Promise<Result<RuntimeEvent<string>, RuntimeSourceError>> {
    this.readCalls += 1;
    this.#notifyCount(this.#readWaiters, this.readCalls);
    const queued = this.#events.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }
    if (this.#eventWaiter !== undefined) {
      return Promise.resolve(
        err(Object.freeze({ kind: "concurrentRead" as const })),
      );
    }
    return new Promise((resolve, reject) => {
      this.#eventWaiter = resolve;
      this.#readReject = reject;
    });
  }

  async stop(): Promise<Result<void, RuntimeStopError<string>>> {
    this.stopCalls += 1;
    this.#finishedTurnId = undefined;
    const turnId = this.#activeTurnId;
    if (turnId !== undefined) {
      this.#activeTurnId = undefined;
      const waiter = this.#eventWaiter;
      this.#eventWaiter = undefined;
      this.#readReject = undefined;
      waiter?.(
        ok(
          Object.freeze({
            checkpointed: false,
            cleanup: Object.freeze([]),
            kind: "turnFinished" as const,
            outcome: Object.freeze({ kind: "cancelled" as const }),
            turnId,
          }),
        ),
      );
    }
    if (this.stopFailure === undefined) {
      return ok(undefined);
    }
    const failure: RuntimeCleanupFailure<string> = Object.freeze({
      error: this.stopFailure,
      kind: "model" as const,
    });
    return err(Object.freeze({ failures: Object.freeze([failure]) }));
  }

  emit(event: RuntimeEvent<string>): void {
    if (event.kind === "turnFinished") {
      this.#activeTurnId = undefined;
      this.#finishedTurnId = event.turnId;
    }
    const result = ok(event);
    const waiter = this.#eventWaiter;
    if (waiter === undefined) {
      this.#events.push(result);
    } else {
      this.#eventWaiter = undefined;
      this.#readReject = undefined;
      waiter(result);
    }
  }

  rejectRead(cause: unknown): void {
    const reject = this.#readReject;
    this.#eventWaiter = undefined;
    this.#readReject = undefined;
    reject?.(cause);
  }

  waitForStarts(count: number): Promise<void> {
    return this.#waitForCount(this.#startWaiters, this.startCalls, count);
  }

  waitForReads(count: number): Promise<void> {
    return this.#waitForCount(this.#readWaiters, this.readCalls, count);
  }

  waitForCancels(count: number): Promise<void> {
    return this.#waitForCount(this.#cancelWaiters, this.cancelCalls, count);
  }

  #waitForCount(
    waiters: CountWaiter[],
    current: number,
    count: number,
  ): Promise<void> {
    if (current >= count) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiters.push(Object.freeze({ count, resolve }));
    });
  }

  #notifyCount(waiters: CountWaiter[], current: number): void {
    const retained: CountWaiter[] = [];
    for (const waiter of waiters) {
      if (current >= waiter.count) {
        waiter.resolve();
      } else {
        retained.push(waiter);
      }
    }
    waiters.splice(0, waiters.length, ...retained);
  }
}

function input(text: string): HostEvent {
  return Object.freeze({ kind: "input" as const, text });
}

function delta(turnId: number, text: string): RuntimeEvent<string> {
  return Object.freeze({ kind: "assistantDelta" as const, text, turnId });
}

function completed(turnId: number, text: string): RuntimeEvent<string> {
  return Object.freeze({
    assistant: Object.freeze({ content: text }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId,
  }) as unknown as RuntimeEvent<string>;
}

test("streams one runtime turn into chat and exits only on later idle Ctrl+C", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);

  host.emit(input("question\r"));
  await runtime.waitForStarts(1);
  await runtime.waitForReads(1);
  await host.waitForWrites(2);

  runtime.emit(delta(1, "ans"));
  await runtime.waitForReads(2);
  await host.waitForWrites(3);
  runtime.emit(delta(1, "wer"));
  await runtime.waitForReads(3);
  await host.waitForWrites(4);
  runtime.emit(completed(1, "answer"));
  await host.waitForWrites(5);

  host.emit(input("\u0003"));
  const result = await running;

  assert.ok(result.ok);
  assert.deepEqual(runtime.inputs, ["question"]);
  assert.equal(runtime.cancelCalls, 0);
  assert.equal(runtime.stopCalls, 1);
  assert.equal(host.writes.join("").includes("question"), true);
  assert.equal(host.writes.join("").includes("answer"), true);
});

test("active Ctrl+C cancels, preserves the draft, and keeps the shell open", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);
  host.emit(input("question\r"));
  await runtime.waitForReads(1);
  await host.waitForWrites(2);

  host.emit(input("draft"));
  await host.waitForWrites(3);
  host.emit(input("\u0003"));
  await runtime.waitForCancels(1);
  await host.waitForWrites(4);
  runtime.emit(
    Object.freeze({
      checkpointed: false,
      cleanup: Object.freeze([]),
      kind: "turnFinished" as const,
      outcome: Object.freeze({ kind: "cancelled" as const }),
      turnId: 1,
    }),
  );
  await host.waitForWrites(5);

  assert.equal(host.stopCalls, 0);
  assert.equal(host.writes.join("").includes("\u2192 draft"), true);
  host.emit(input("\u0003"));
  const result = await running;

  assert.ok(result.ok);
  assert.equal(runtime.cancelCalls, 1);
  assert.equal(host.stopCalls, 1);
});

test("navigates transcript history through fresh resize geometry only", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);

  host.emit(input("question\r"));
  await runtime.waitForReads(1);
  await host.waitForWrites(2);
  runtime.emit(
    delta(
      1,
      Array.from(
        { length: 24 },
        (_, index) => "answer-" + String(index + 1).padStart(2, "0"),
      ).join("\n"),
    ),
  );
  await runtime.waitForReads(2);
  await host.waitForWrites(3);
  const readsBeforeNavigation = runtime.readCalls;

  host.emit(input("\u001B[5~"));
  await host.waitForWrites(4);
  assert.equal(runtime.readCalls, readsBeforeNavigation);
  assert.equal(runtime.startCalls, 1);
  assert.equal(runtime.cancelCalls, 0);
  assert.equal(host.writes.join("").includes("history"), true);

  host.setViewport(40, 8);
  host.emit(Object.freeze({ kind: "resize" as const }));
  await host.waitForWrites(5);
  host.emit(input("\u001B[5~"));
  await host.waitForWrites(6);
  assert.equal(runtime.readCalls, readsBeforeNavigation);

  host.emit(input("/exit\r"));
  const result = await running;

  assert.ok(result.ok);
  assert.equal(runtime.stopCalls, 1);
});

test("Ctrl+C ordered before a prepared completion prevents the real commit", async () => {
  let readStep = 0;
  const stream: ModelStream<string> = {
    async close(): Promise<Result<void, string>> {
      return ok(undefined);
    },
    async read(): Promise<Result<ModelStreamEvent, string>> {
      readStep += 1;
      return readStep === 1
        ? ok(Object.freeze({ kind: "delta", text: "answer" }))
        : ok(Object.freeze({ kind: "done" }));
    },
  };
  const model: StreamingModel<string> = {
    async open(): Promise<Result<ModelStream<string>, string>> {
      return ok(stream);
    },
  };
  const runtime = new AgentRuntime(model);
  const host = new ControlledHost();
  const blockedDeltaRender = host.blockWrite(3);
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);

  host.emit(input("question\r"));
  await host.waitForWrites(3);
  host.emit(input("\u0003"));
  blockedDeltaRender.resolve(undefined);
  await host.waitForWrites(5);

  assert.equal(runtime.conversation.length, 0);
  assert.equal(host.writes.join("").includes("Turn cancelled"), true);
  host.emit(input("\u0003"));
  const result = await running;

  assert.ok(result.ok);
  assert.equal(runtime.conversation.length, 0);
});

test("exit preserves cleanup failure from a buffered terminal runtime event", async () => {
  let readStep = 0;
  const stream: ModelStream<string> = {
    async close(): Promise<Result<void, string>> {
      return err("close failed");
    },
    async read(): Promise<Result<ModelStreamEvent, string>> {
      readStep += 1;
      return readStep === 1
        ? ok(Object.freeze({ kind: "delta", text: "partial" }))
        : err("read failed");
    },
  };
  const runtime = new AgentRuntime<string>({
    async open(): Promise<Result<ModelStream<string>, string>> {
      return ok(stream);
    },
  });
  const host = new ControlledHost();
  const blockedDeltaRender = host.blockWrite(3);
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);

  host.emit(input("question\r"));
  await host.waitForWrites(3);
  host.emit(input("/exit\r"));
  blockedDeltaRender.resolve(undefined);
  const result = await running;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.primary, undefined);
    assert.deepEqual(result.error.cleanup, [
      {
        error: {
          failures: [{ error: "close failed", kind: "model" }],
        },
        kind: "runtime",
      },
    ]);
  }
});

test("slash exit during an active read cancels through owned shutdown", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);
  host.emit(input("question\r"));
  await runtime.waitForReads(1);

  host.emit(input("/exit\r"));
  const result = await running;

  assert.ok(result.ok);
  assert.equal(runtime.stopCalls, 1);
  assert.equal(host.stopCalls, 1);
});

test("providerless submissions are discarded before display and transcript", async () => {
  const host = new ControlledHost();
  const running = run(host);
  await host.started.promise;
  await host.waitForWrites(1);
  const privateText = "private providerless request";

  host.emit(input(privateText + "\r"));
  await host.waitForWrites(2);
  host.emit(input("/exit\r"));
  const result = await running;

  assert.ok(result.ok);
  assert.equal(host.writes.join("").includes(privateText), false);
  assert.equal(
    host.writes.join("").includes("No model is configured; input was not sent."),
    true,
  );
});

test("contains a rejected runtime read without exposing its cause", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);
  host.emit(input("question\r"));
  await runtime.waitForReads(1);

  runtime.rejectRead(new Error("private runtime rejection"));
  const result = await running;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.primary, {
      kind: "source",
      source: "runtime",
    });
    assert.equal(JSON.stringify(result.error).includes("private"), false);
  }
});

test("preserves terminal, renderer, and runtime cleanup failures independently", async () => {
  const host = new ControlledHost();
  const runtime = new ControlledRuntime();
  runtime.stopFailure = "runtime stop failed";
  const running = run(host, runtime);
  await host.started.promise;
  await host.waitForWrites(1);
  host.stopFailure = "terminal stop failed";
  host.writeFailure = "renderer finish failed";

  host.emitResult(err("terminal event failed"));
  const result = await running;

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.primary, {
      error: "terminal event failed",
      kind: "terminal",
      operation: "event",
    });
    assert.deepEqual(result.error.cleanup, [
      { error: "terminal stop failed", kind: "terminal" },
      { error: "renderer finish failed", kind: "renderer" },
      {
        error: {
          failures: [{ error: "runtime stop failed", kind: "model" }],
        },
        kind: "runtime",
      },
    ]);
  }
});

test("owns an injected runtime even for escape-free non-TTY output", async () => {
  const host = new ControlledHost(false);
  const runtime = new ControlledRuntime();

  const result = await run(host, runtime);

  assert.ok(result.ok);
  assert.equal(runtime.stopCalls, 1);
  assert.equal(host.startCalls, 0);
  assert.equal(host.stopCalls, 0);
  assert.equal(host.writes.join("").includes("\u001B"), false);
});
