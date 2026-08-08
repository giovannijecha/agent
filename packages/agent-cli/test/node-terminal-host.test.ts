import assert from "node:assert/strict";
import test from "node:test";

import { NodeTerminalHost } from "../dist/node-terminal-host.js";

class FakeInput {
  readonly dataListeners: ((text: string) => void)[] = [];
  readonly endListeners: (() => void)[] = [];
  readonly errorListeners: ((cause: unknown) => void)[] = [];
  isTTY: boolean | undefined = true;
  readonly rawModes: boolean[] = [];
  encoding: string | undefined;
  pauses = 0;
  resumes = 0;

  on(event: "data", listener: (text: string) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (cause: unknown) => void): this;
  on(
    event: "data" | "end" | "error",
    listener: ((text: string) => void) | (() => void) | ((cause: unknown) => void),
  ): this {
    if (event === "data") {
      this.dataListeners.push(listener as (text: string) => void);
    } else if (event === "end") {
      this.endListeners.push(listener as () => void);
    } else {
      this.errorListeners.push(listener as (cause: unknown) => void);
    }
    return this;
  }

  off(event: "data", listener: (text: string) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(
    event: "data" | "end" | "error",
    listener: ((text: string) => void) | (() => void) | ((cause: unknown) => void),
  ): this {
    const listeners =
      event === "data"
        ? this.dataListeners
        : event === "end"
          ? this.endListeners
          : this.errorListeners;
    const index = listeners.indexOf(listener as never);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
    return this;
  }

  pause(): this {
    this.pauses += 1;
    return this;
  }

  resume(): this {
    this.resumes += 1;
    return this;
  }

  setEncoding(encoding: "utf8"): this {
    this.encoding = encoding;
    return this;
  }

  setRawMode(enabled: boolean): this {
    this.rawModes.push(enabled);
    return this;
  }

  emitData(text: string): void {
    for (const listener of [...this.dataListeners]) {
      listener(text);
    }
  }
}

class FakeOutput {
  readonly resizeListeners: (() => void)[] = [];
  readonly errorListeners: ((cause: unknown) => void)[] = [];
  readonly writes: string[] = [];
  columns: number | undefined = 80;
  rows: number | undefined = 24;
  isTTY: boolean | undefined = true;
  writeCause: unknown;
  emittedWriteError: unknown;
  emitWriteError = true;

  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "resize", listener: () => void): this;
  on(
    event: "error" | "resize",
    listener: ((cause: unknown) => void) | (() => void),
  ): this {
    if (event === "resize") {
      this.resizeListeners.push(listener as () => void);
    } else {
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
    const listeners = event === "resize" ? this.resizeListeners : this.errorListeners;
    const index = listeners.indexOf(listener as never);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
    return this;
  }

  write(text: string): boolean;
  write(text: string, callback: (cause?: unknown) => void): boolean;
  write(text: string, callback?: (cause?: unknown) => void): boolean {
    this.writes.push(text);
    callback?.(this.writeCause);
    const emittedCause =
      this.emittedWriteError ?? (this.emitWriteError ? this.writeCause : undefined);
    if (emittedCause !== undefined) {
      for (const listener of [...this.errorListeners]) {
        listener(emittedCause);
      }
    }
    return true;
  }

  emitResize(): void {
    for (const listener of [...this.resizeListeners]) {
      listener();
    }
  }
}

test("owns raw mode and ordered input lifecycle", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);

  const started = await host.start();
  input.emitData("hello");
  const event = await host.nextEvent();
  const stopped = await host.stop();

  assert.ok(started.ok);
  assert.deepEqual(event, { ok: true, value: { kind: "input", text: "hello" } });
  assert.ok(stopped.ok);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.encoding, "utf8");
  assert.equal(input.resumes, 1);
  assert.equal(input.pauses, 1);
  assert.equal(input.dataListeners.length, 0);
});

test("coalesces queued resize events without dropping input", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  await host.start();

  output.emitResize();
  output.emitResize();
  input.emitData("x");

  assert.deepEqual(await host.nextEvent(), { ok: true, value: { kind: "resize" } });
  assert.deepEqual(await host.nextEvent(), {
    ok: true,
    value: { kind: "input", text: "x" },
  });
  await host.stop();
});

test("resolves writes from the stream callback and preserves callback errors", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);

  const first = await host.write("one");
  output.writeCause = "blocked";
  const second = await host.write("two");

  assert.ok(first.ok);
  assert.equal(second.ok, false);
  assert.deepEqual(output.writes, ["one", "two"]);
});

test("settles a callback-only write error without retaining its listener", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  output.writeCause = "callback only";
  output.emitWriteError = false;

  const result = await host.write("one");

  assert.equal(result.ok, false);
  assert.equal(output.errorListeners.length, 0);
});

test("captures emitted output errors before startup and after shutdown", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  output.writeCause = "stream failed";
  output.emittedWriteError = "stream failed";

  const before = await host.write("plain");
  output.writeCause = undefined;
  output.emittedWriteError = undefined;
  await host.start();
  await host.stop();
  output.writeCause = "cleanup failed";
  output.emittedWriteError = "cleanup failed";
  const after = await host.write("cleanup");

  assert.equal(before.ok, false);
  assert.equal(after.ok, false);
  assert.equal(output.errorListeners.length, 0);
});

test("never enables raw mode when either stream is not a TTY", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.isTTY = false;
  const host = new NodeTerminalHost(input, output);

  const result = await host.start();

  assert.equal(host.interactive, false);
  assert.equal(result.ok, false);
  assert.deepEqual(input.rawModes, []);
});

test("fails closed when one input chunk exceeds the host bound", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  await host.start();

  input.emitData("x".repeat(65_537));
  const result = await host.nextEvent();

  assert.equal(result.ok, false);
  assert.equal(input.pauses, 1);
  await host.stop();
});

test("replaces an overflowing event queue with one owned failure", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  await host.start();

  for (let index = 0; index < 1_025; index += 1) {
    input.emitData("x");
  }
  const result = await host.nextEvent();

  assert.equal(result.ok, false);
  assert.equal(input.pauses, 1);
  await host.stop();
});

test("bounds cumulative queued input independently of event count", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const host = new NodeTerminalHost(input, output);
  await host.start();

  input.emitData("x".repeat(65_536));
  input.emitData("y".repeat(65_536));
  input.emitData("z");
  const result = await host.nextEvent();

  assert.equal(result.ok, false);
  assert.equal(input.pauses, 1);
  await host.stop();
});
