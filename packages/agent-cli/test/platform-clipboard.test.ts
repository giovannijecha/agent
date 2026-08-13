import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_CLIPBOARD_DEADLINES,
  type PlatformClipboardBoundary,
  PlatformClipboard,
} from "../dist/platform-clipboard.js";

class FakeReadable {
  readonly #listeners: ((chunk: Uint8Array) => void)[] = [];

  on(event: "data", listener: (chunk: Uint8Array) => void): this {
    assert.equal(event, "data");
    this.#listeners.push(listener);
    return this;
  }

  emit(chunk: Uint8Array): void {
    for (const listener of this.#listeners) {
      listener(chunk);
    }
  }
}

class FakeWritable {
  destroyed = false;
  ended = false;
  errorOnWrite = false;
  readonly writes: Uint8Array[] = [];
  #error: ((cause: unknown) => void) | undefined;

  destroy(): void {
    this.destroyed = true;
  }

  end(): void {
    this.ended = true;
  }

  once(event: "error", listener: (cause: unknown) => void): this {
    assert.equal(event, "error");
    this.#error = listener;
    return this;
  }

  write(chunk: Uint8Array): boolean {
    this.writes.push(chunk.slice());
    if (this.errorOnWrite) {
      this.#error?.(new Error("private stdin failure"));
    }
    return true;
  }

  emitError(cause: unknown): void {
    const listener = this.#error;
    this.#error = undefined;
    listener?.(cause);
  }
}

class FakeClipboardChild {
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  readonly stderr = new FakeReadable();
  readonly #extraOutput = new FakeReadable();
  readonly #extraError = new FakeReadable();
  readonly stdio = Object.freeze([
    this.stdin,
    this.stdout,
    this.stderr,
    this.#extraOutput,
    this.#extraError,
  ] as const);
  killCause: unknown;
  killResult = true;
  kills = 0;
  #close: ((code: number | null, signal: string | null) => void) | undefined;
  #error: ((cause: unknown) => void) | undefined;

  kill(): boolean {
    this.kills += 1;
    if (this.killCause !== undefined) {
      throw this.killCause;
    }
    return this.killResult;
  }

  once(
    event: "close",
    listener: (code: number | null, signal: string | null) => void,
  ): this;
  once(event: "error", listener: (cause: unknown) => void): this;
  once(
    event: "close" | "error",
    listener:
      | ((code: number | null, signal: string | null) => void)
      | ((cause: unknown) => void),
  ): this {
    if (event === "close") {
      this.#close = listener as (
        code: number | null,
        signal: string | null,
      ) => void;
    } else {
      this.#error = listener as (cause: unknown) => void;
    }
    return this;
  }

  emitClose(code: number | null, signal: string | null): void {
    const listener = this.#close;
    this.#close = undefined;
    listener?.(code, signal);
  }

  emitError(cause: unknown): void {
    const listener = this.#error;
    this.#error = undefined;
    listener?.(cause);
  }
}

class FakeDeadlines {
  readonly #entries: {
    active: boolean;
    listener: () => void;
    milliseconds: number;
  }[] = [];

  schedule(listener: () => void, milliseconds: number): () => void {
    const entry = { active: true, listener, milliseconds };
    this.#entries.push(entry);
    return () => {
      entry.active = false;
    };
  }

  count(milliseconds: number): number {
    return this.#entries.filter(
      (entry) => entry.active && entry.milliseconds === milliseconds,
    ).length;
  }

  fire(milliseconds: number): void {
    const entry = this.#entries.find(
      (candidate) =>
        candidate.active && candidate.milliseconds === milliseconds,
    );
    assert.ok(entry !== undefined);
    entry.active = false;
    entry.listener();
  }
}

function clipboard(
  child: FakeClipboardChild,
  deadlines: FakeDeadlines,
): PlatformClipboard {
  const boundary: PlatformClipboardBoundary = Object.freeze({
    launch: (_executable, _arguments, _options) => child,
    schedule: (listener: () => void, milliseconds: number) =>
      deadlines.schedule(listener, milliseconds),
  });
  return new PlatformClipboard("win32", "x64", boundary);
}

test("confirms clipboard copy only after a complete frame exits zero", async () => {
  const child = new FakeClipboardChild();
  const deadlines = new FakeDeadlines();
  const pending = clipboard(child, deadlines).copy("agent");
  let settled = false;
  pending.then(() => {
    settled = true;
  });
  await Promise.resolve();

  assert.equal(settled, false);
  assert.equal(child.stdin.writes.length, 1);
  assert.equal(child.stdin.ended, true);
  child.emitClose(0, null);

  assert.deepEqual(await pending, { ok: true, value: "copied" });
  assert.equal(
    deadlines.count(PLATFORM_CLIPBOARD_DEADLINES.operationMilliseconds),
    0,
  );
});

test("settles at the clipboard cleanup deadline when close never arrives", async () => {
  const child = new FakeClipboardChild();
  const deadlines = new FakeDeadlines();
  const pending = clipboard(child, deadlines).copy("agent");

  deadlines.fire(PLATFORM_CLIPBOARD_DEADLINES.operationMilliseconds);
  assert.equal(child.kills, 1);
  assert.equal(child.stdin.destroyed, true);
  assert.equal(
    deadlines.count(PLATFORM_CLIPBOARD_DEADLINES.cleanupMilliseconds),
    1,
  );
  deadlines.fire(PLATFORM_CLIPBOARD_DEADLINES.cleanupMilliseconds);

  assert.deepEqual(await pending, { ok: false, error: { kind: "timeout" } });
  child.stdout.emit(Uint8Array.from([1]));
  child.stderr.emit(Uint8Array.from([2]));
  child.stdin.emitError(new Error("late stdin"));
  child.emitClose(0, null);
  child.emitError(new Error("late process"));
});

test("fails clipboard input and unexpected output without claiming copy", async () => {
  const inputChild = new FakeClipboardChild();
  inputChild.stdin.errorOnWrite = true;
  inputChild.killResult = false;
  const input = await clipboard(inputChild, new FakeDeadlines()).copy("agent");
  assert.deepEqual(input, { ok: false, error: { kind: "native" } });

  for (const stream of ["stdout", "stderr"] as const) {
    const child = new FakeClipboardChild();
    child.killResult = false;
    const pending = clipboard(child, new FakeDeadlines()).copy("agent");
    child[stream].emit(Uint8Array.from([1]));
    assert.deepEqual(await pending, {
      ok: false,
      error: { kind: "protocol" },
    });
  }
});

test("rejects nonzero clipboard exit and timeout kill failures", async () => {
  const exitedChild = new FakeClipboardChild();
  const exited = clipboard(exitedChild, new FakeDeadlines()).copy("agent");
  exitedChild.emitClose(7, null);
  assert.deepEqual(await exited, { ok: false, error: { kind: "native" } });

  for (const mode of ["false", "throw"] as const) {
    const child = new FakeClipboardChild();
    const deadlines = new FakeDeadlines();
    if (mode === "false") {
      child.killResult = false;
    } else {
      child.killCause = new Error("private kill cause");
    }
    const pending = clipboard(child, deadlines).copy("agent");
    deadlines.fire(PLATFORM_CLIPBOARD_DEADLINES.operationMilliseconds);
    assert.deepEqual(await pending, {
      ok: false,
      error: { kind: "timeout" },
    });
  }
});

test("settles forced clipboard failure when close arrives during cleanup", async () => {
  const child = new FakeClipboardChild();
  const deadlines = new FakeDeadlines();
  const pending = clipboard(child, deadlines).copy("agent");

  deadlines.fire(PLATFORM_CLIPBOARD_DEADLINES.operationMilliseconds);
  child.emitClose(null, "SIGTERM");

  assert.deepEqual(await pending, { ok: false, error: { kind: "timeout" } });
  assert.equal(
    deadlines.count(PLATFORM_CLIPBOARD_DEADLINES.cleanupMilliseconds),
    0,
  );
});
