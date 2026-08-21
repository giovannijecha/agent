import assert from "node:assert/strict";
import test from "node:test";

import {
  readAuthChoice,
  readConcealedCredential,
  startAuthCancellationMonitor,
} from "../dist/auth-terminal.js";

class FakeInput {
  isTTY = true;
  paused = false;
  raw: boolean[] = [];
  readonly #data: ((text: string) => void)[] = [];
  readonly #end: (() => void)[] = [];
  readonly #error: ((cause: unknown) => void)[] = [];

  constructor(readonly failingOffEvent?: "data" | "end" | "error") {}

  off(event: "data", listener: (text: string) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "data" | "end" | "error", listener: unknown): this {
    if (event === this.failingOffEvent) {
      throw new Error("synthetic listener cleanup failure");
    }
    const values = event === "data" ? this.#data : event === "end" ? this.#end : this.#error;
    const index = values.indexOf(listener as never);
    if (index >= 0) values.splice(index, 1);
    return this;
  }

  on(event: "data", listener: (text: string) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "data" | "end" | "error", listener: unknown): this {
    if (event === "data") this.#data.push(listener as (text: string) => void);
    else if (event === "end") this.#end.push(listener as () => void);
    else this.#error.push(listener as (cause: unknown) => void);
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  resume(): this {
    this.paused = false;
    return this;
  }

  setEncoding(encoding: "utf8"): this {
    assert.equal(encoding, "utf8");
    return this;
  }

  setRawMode(enabled: boolean): this {
    this.raw.push(enabled);
    return this;
  }

  emitData(text: string): void {
    for (const listener of [...this.#data]) listener(text);
  }

  emitEnd(): void {
    for (const listener of [...this.#end]) listener();
  }

  emitError(): void {
    for (const listener of [...this.#error]) listener(new Error("input"));
  }
}

test("reads only a registered auth action with raw mode restored", async () => {
  const input = new FakeInput();
  const reading = readAuthChoice(["r", "c"], input);
  input.emitData("xr");
  const result = await reading;
  assert.ok(result.ok);
  assert.deepEqual(result.value, { kind: "value", value: "r" });
  assert.deepEqual(input.raw, [true, false]);
  assert.equal(input.paused, true);
});

test("reads a concealed bounded line without projecting edits", async () => {
  const input = new FakeInput();
  const reading = readConcealedCredential(input);
  input.emitData("synthetic-x\u007fkey\r");
  const result = await reading;
  assert.ok(result.ok);
  assert.deepEqual(result.value, { kind: "value", value: "synthetic-key" });
  assert.deepEqual(input.raw, [true, false]);
});

test("cancels concealed input without retaining partial content", async () => {
  for (const cancellation of ["\u001b", "\u0003", "\u0004"]) {
    const input = new FakeInput();
    const reading = readConcealedCredential(input);
    input.emitData("partial" + cancellation);
    const result = await reading;
    assert.ok(result.ok);
    assert.deepEqual(result.value, { kind: "cancelled" });
    assert.deepEqual(input.raw, [true, false]);
  }
});

test("monitors only cancellation keys and restores raw mode on close", () => {
  for (const cancellationKey of ["\u001b", "\u0003", "\u0004"]) {
    const input = new FakeInput();
    const started = startAuthCancellationMonitor(input);
    assert.ok(started.ok);
    let observed = 0;
    started.value.cancellation.onCancel(() => {
      observed += 1;
    });
    input.emitData("ignored" + cancellationKey + "ignored-again");
    assert.equal(started.value.cancellation.cancelled(), true);
    assert.equal(observed, 1);
    assert.deepEqual(started.value.close(), { ok: true, value: undefined });
    assert.deepEqual(input.raw, [true, false]);
    assert.equal(input.paused, true);
  }
});

test("treats input end as cancellation and input failure as failed cleanup", () => {
  const endedInput = new FakeInput();
  const ended = startAuthCancellationMonitor(endedInput);
  assert.ok(ended.ok);
  endedInput.emitEnd();
  assert.equal(ended.value.cancellation.cancelled(), true);
  assert.equal(ended.value.close().ok, true);

  const failedInput = new FakeInput();
  const failed = startAuthCancellationMonitor(failedInput);
  assert.ok(failed.ok);
  failedInput.emitError();
  assert.equal(failed.value.cancellation.cancelled(), true);
  assert.deepEqual(failed.value.close(), { error: { kind: "input" }, ok: false });
});

test("restores terminal state after one listener cleanup fails", () => {
  const input = new FakeInput("end");
  const started = startAuthCancellationMonitor(input);
  assert.ok(started.ok);
  assert.deepEqual(
    started.value.close(),
    { error: { kind: "input" }, ok: false },
  );
  assert.deepEqual(input.raw, [true, false]);
  assert.equal(input.paused, true);
  assert.equal(started.value.cancellation.cancelled(), false);
  input.emitEnd();
  assert.equal(started.value.cancellation.cancelled(), false);
});
