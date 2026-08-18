import assert from "node:assert/strict";
import test from "node:test";

import type {
  CommitTurnResult,
  RuntimeCommandError,
  RuntimeEvent,
  RuntimeSession,
  RuntimeSourceError,
  RuntimeStopReport,
  StartedTurn,
  StartTurnError,
} from "@agent/runtime";
import { err, ok, type Result, type Viewport } from "@agent/tui";

import { EventArbiter } from "../dist/event-arbiter.js";
import type {
  MotionEvent,
  MotionSource,
  MotionSourceError,
} from "../dist/motion-scheduler.js";
import { createNoticeToken } from "../dist/notice.js";
import type {
  NoticeEvent,
  NoticeSource,
  NoticeSourceError,
} from "../dist/notice-scheduler.js";
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

class PullHost implements TerminalHost<string> {
  readonly interactive = true;
  readonly reads: Deferred<Result<HostEvent, string>>[] = [];

  viewport(): Result<Viewport, string> {
    return err("unused");
  }

  async write(): Promise<Result<void, string>> {
    return ok(undefined);
  }

  async start(): Promise<Result<void, string>> {
    return ok(undefined);
  }

  nextEvent(): Promise<Result<HostEvent, string>> {
    const read = new Deferred<Result<HostEvent, string>>();
    this.reads.push(read);
    return read.promise;
  }

  async stop(): Promise<Result<void, string>> {
    return ok(undefined);
  }
}

class PullRuntime implements RuntimeSession<string> {
  readonly reads: Deferred<Result<RuntimeEvent<string>, RuntimeSourceError>>[] = [];

  startTurn(): Result<StartedTurn, StartTurnError> {
    return err(Object.freeze({ kind: "closed" as const }));
  }

  selectConversationNode(): Result<void, RuntimeCommandError> {
    return err(Object.freeze({ kind: "invalidHistoryNode" as const }));
  }

  requestCancel(): Result<boolean, RuntimeCommandError> {
    return err(Object.freeze({ kind: "idle" as const }));
  }

  resolveToolPermission(): Result<void, RuntimeCommandError> {
    return err(Object.freeze({ kind: "notAwaitingPermission" as const }));
  }

  commitTurn(): Result<CommitTurnResult, RuntimeCommandError> {
    return err(Object.freeze({ kind: "idle" as const }));
  }

  acknowledgeTurn(): Result<void, RuntimeCommandError> {
    return err(Object.freeze({ kind: "idle" as const }));
  }

  nextEvent(): Promise<Result<RuntimeEvent<string>, RuntimeSourceError>> {
    const read = new Deferred<
      Result<RuntimeEvent<string>, RuntimeSourceError>
    >();
    this.reads.push(read);
    return read.promise;
  }

  async stop(): Promise<RuntimeStopReport<string>> {
    return Object.freeze({
      cleanup: ok(undefined),
      settledTurn: undefined,
    });
  }
}

class PullMotion implements MotionSource {
  readonly reads: Deferred<Result<MotionEvent, MotionSourceError>>[] = [];

  nextEvent(): Promise<Result<MotionEvent, MotionSourceError>> {
    const read = new Deferred<Result<MotionEvent, MotionSourceError>>();
    this.reads.push(read);
    return read.promise;
  }
}

class PullNotice implements NoticeSource {
  readonly reads: Deferred<Result<NoticeEvent, NoticeSourceError>>[] = [];

  nextEvent(): Promise<Result<NoticeEvent, NoticeSourceError>> {
    const read = new Deferred<Result<NoticeEvent, NoticeSourceError>>();
    this.reads.push(read);
    return read.promise;
  }
}

function terminalInput(text: string): Result<HostEvent, string> {
  return ok(
    Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 0,
      text,
    }),
  );
}

function runtimeDelta(turnId: number, text: string) {
  return ok(
    Object.freeze({ kind: "assistantDelta" as const, text, turnId }),
  );
}

test("retains the losing read and never duplicates either source", async () => {
  const host = new PullHost();
  const runtime = new PullRuntime();
  const arbiter = new EventArbiter(host, runtime);
  assert.equal(host.reads.length, 1);
  assert.ok(arbiter.armRuntime().ok);
  assert.equal(runtime.reads.length, 1);

  const first = arbiter.nextEvent();
  runtime.reads.at(0)?.resolve(runtimeDelta(1, "a"));
  const runtimeEvent = await first;

  assert.ok(runtimeEvent.ok);
  assert.equal(runtimeEvent.value.kind, "runtime");
  assert.equal(host.reads.length, 1);
  assert.ok(arbiter.armRuntime().ok);
  assert.equal(runtime.reads.length, 2);

  host.reads.at(0)?.resolve(terminalInput("x"));
  const terminalEvent = await arbiter.nextEvent();

  assert.ok(terminalEvent.ok);
  assert.equal(terminalEvent.value.kind, "terminal");
  assert.equal(host.reads.length, 2);
});

test("selects simultaneous readiness fairly with terminal-first initial tie", async () => {
  const host = new PullHost();
  const runtime = new PullRuntime();
  const arbiter = new EventArbiter(host, runtime);
  arbiter.armRuntime();
  host.reads.at(0)?.resolve(terminalInput("x"));
  runtime.reads.at(0)?.resolve(runtimeDelta(1, "a"));
  await Promise.resolve();
  await Promise.resolve();

  const first = await arbiter.nextEvent();
  const second = await arbiter.nextEvent();

  assert.ok(first.ok);
  assert.ok(second.ok);
  assert.equal(first.value.kind, "terminal");
  assert.equal(second.value.kind, "runtime");
});

test("orders functional readiness before notice expiry and cosmetic motion", async () => {
  const host = new PullHost();
  const runtime = new PullRuntime();
  const motion = new PullMotion();
  const notice = new PullNotice();
  const token = createNoticeToken();
  const arbiter = new EventArbiter(host, runtime, motion, notice);
  assert.ok(arbiter.armRuntime().ok);

  host.reads.at(0)?.resolve(terminalInput("x"));
  runtime.reads.at(0)?.resolve(runtimeDelta(1, "a"));
  notice.reads.at(0)?.resolve(ok(Object.freeze({
    kind: "expired" as const,
    token,
  })));
  motion.reads.at(0)?.resolve(ok(Object.freeze({ kind: "tick" as const })));
  await Promise.resolve();
  await Promise.resolve();

  const first = await arbiter.nextEvent();
  const second = await arbiter.nextEvent();
  const third = await arbiter.nextEvent();
  const fourth = await arbiter.nextEvent();

  assert.ok(first.ok);
  assert.ok(second.ok);
  assert.ok(third.ok);
  assert.ok(fourth.ok);
  assert.equal(first.value.kind, "terminal");
  assert.equal(second.value.kind, "runtime");
  assert.equal(third.value.kind, "notice");
  assert.equal(fourth.value.kind, "motion");
  arbiter.close();
});

test("discards cached cosmetic readiness after a semantic event", async () => {
  const host = new PullHost();
  const motion = new PullMotion();
  const arbiter = new EventArbiter(host, undefined, motion);

  motion.reads.at(0)?.resolve(ok(Object.freeze({ kind: "tick" as const })));
  await Promise.resolve();
  await Promise.resolve();
  arbiter.discardMotionReady();
  host.reads.at(0)?.resolve(terminalInput("x"));

  const event = await arbiter.nextEvent();
  assert.ok(event.ok);
  assert.equal(event.value.kind, "terminal");
  assert.equal(motion.reads.length, 2);
  arbiter.close();
});

test("rejects concurrent application reads and close wakes the retained waiter", async () => {
  const arbiter = new EventArbiter(new PullHost(), new PullRuntime());
  const first = arbiter.nextEvent();
  const concurrent = await arbiter.nextEvent();

  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) assert.equal(concurrent.error.kind, "concurrentRead");

  arbiter.close();
  const closed = await first;
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(closed.error.kind, "closed");
});

test("contains rejected source promises without retaining their causes", async () => {
  const host = new PullHost();
  const arbiter = new EventArbiter(host);
  const next = arbiter.nextEvent();
  host.reads.at(0)?.reject(new Error("private source rejection"));

  const event = await next;

  assert.ok(event.ok);
  assert.deepEqual(event.value, {
    kind: "unexpectedSource",
    source: "terminal",
  });
  assert.equal(JSON.stringify(event.value).includes("private"), false);
  arbiter.close();
});

test("contains throwing result accessors as malformed source output", async () => {
  const host = new PullHost();
  const arbiter = new EventArbiter(host);
  const next = arbiter.nextEvent();
  const malformed = Object.create(null) as Result<HostEvent, string>;
  Object.defineProperty(malformed, "ok", {
    get(): never {
      throw new Error("private result getter");
    },
  });
  host.reads.at(0)?.resolve(malformed);

  const event = await next;

  assert.ok(event.ok);
  assert.deepEqual(event.value, {
    kind: "unexpectedSource",
    source: "terminal",
  });
  arbiter.close();
});

test("snapshots a source result before exposing it to the application", async () => {
  const host = new PullHost();
  const arbiter = new EventArbiter(host);
  const next = arbiter.nextEvent();
  let okReads = 0;
  const stateful = Object.create(null) as Result<HostEvent, string>;
  Object.defineProperty(stateful, "ok", {
    get(): boolean {
      okReads += 1;
      if (okReads > 1) {
        throw new Error("private repeated result access");
      }
      return true;
    },
  });
  Object.defineProperty(stateful, "value", {
    value: Object.freeze({ kind: "input" as const, text: "x" }),
  });
  host.reads.at(0)?.resolve(stateful);

  const event = await next;

  assert.deepEqual(event, {
    ok: true,
    value: {
      kind: "terminal",
      result: { ok: true, value: { kind: "input", text: "x" } },
    },
  });
  assert.equal(okReads, 1);
  arbiter.close();
});

test("fails explicitly when a runtime read is armed without a runtime", () => {
  const arbiter = new EventArbiter(new PullHost());
  const result = arbiter.armRuntime();

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "runtimeUnavailable");
  arbiter.close();
});
