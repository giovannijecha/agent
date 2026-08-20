import assert from "node:assert/strict";
import test from "node:test";

import {
  readAuthChoice,
  readConcealedCredential,
} from "../dist/auth-terminal.js";

class FakeInput {
  isTTY = true;
  paused = false;
  raw: boolean[] = [];
  readonly #data: ((text: string) => void)[] = [];
  readonly #end: (() => void)[] = [];
  readonly #error: ((cause: unknown) => void)[] = [];

  off(event: "data", listener: (text: string) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "data" | "end" | "error", listener: unknown): this {
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
