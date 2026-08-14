import assert from "node:assert/strict";
import test from "node:test";

import { writeProcessText } from "../dist/process-output.js";

class FakeOutput {
  readonly errorListeners: ((cause: unknown) => void)[] = [];
  readonly writes: string[] = [];
  columns: number | undefined = 80;
  rows: number | undefined = 24;
  isTTY: boolean | undefined = true;
  callbackCause: unknown;
  emitBeforeCallback = false;
  throwOnListenerRemoval = false;
  throwOnWrite = false;

  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "resize", listener: () => void): this;
  on(
    event: "error" | "resize",
    listener: ((cause: unknown) => void) | (() => void),
  ): this {
    if (event === "error") {
      this.errorListeners.push(listener as (cause: unknown) => void);
    }
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "resize", listener: () => void): this;
  off(
    event: "error" | "resize",
    listener: ((cause: unknown) => void) | (() => void),
  ): this {
    if (this.throwOnListenerRemoval) {
      throw new Error("listener removal failed");
    }
    if (event === "error") {
      const index = this.errorListeners.indexOf(
        listener as (cause: unknown) => void,
      );
      if (index >= 0) {
        this.errorListeners.splice(index, 1);
      }
    }
    return this;
  }

  write(text: string): boolean;
  write(text: string, callback: (cause?: unknown) => void): boolean;
  write(text: string, callback?: (cause?: unknown) => void): boolean {
    if (this.throwOnWrite) {
      throw new Error("write failed");
    }
    this.writes.push(text);
    if (this.emitBeforeCallback) {
      this.emitError(new Error("event failed"));
    }
    callback?.(this.callbackCause);
    return true;
  }

  emitError(cause: unknown): void {
    for (const listener of [...this.errorListeners]) {
      listener(cause);
    }
  }
}

test("settles a successful process output write and removes its listener", async () => {
  const output = new FakeOutput();

  const result = await writeProcessText(output, "complete\n");

  assert.ok(result.ok);
  assert.deepEqual(output.writes, ["complete\n"]);
  assert.equal(output.errorListeners.length, 0);
});

test("retains the listener from an errored callback through its error event", async () => {
  const output = new FakeOutput();
  const cause = new Error("write failed");
  output.callbackCause = cause;

  const resultPromise = writeProcessText(output, "receipt\n");

  assert.equal(output.errorListeners.length, 1);
  output.emitError(cause);
  const result = await resultPromise;
  assert.equal(result.ok, false);
  assert.equal(output.errorListeners.length, 0);
});

test("settles an output event that precedes a late callback", async () => {
  const output = new FakeOutput();
  output.emitBeforeCallback = true;

  const result = await writeProcessText(output, "diagnostic\n");

  assert.equal(result.ok, false);
  assert.equal(output.errorListeners.length, 0);
});

test("settles a synchronous process output failure", async () => {
  const output = new FakeOutput();
  output.throwOnWrite = true;

  const result = await writeProcessText(output, "diagnostic\n");

  assert.equal(result.ok, false);
  assert.equal(output.errorListeners.length, 0);
});

test("settles listener cleanup failure as output failure", async () => {
  const output = new FakeOutput();
  output.throwOnListenerRemoval = true;

  const result = await writeProcessText(output, "diagnostic\n");

  assert.equal(result.ok, false);
});
