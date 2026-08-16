import assert from "node:assert/strict";
import test from "node:test";

import {
  readHiddenOpenCodeGoCredential,
  readHiddenOpenCodeZenCredential,
} from "../dist/hidden-credential-prompt.js";

class FakeInput {
  readonly dataListeners: ((text: string) => void)[] = [];
  readonly endListeners: (() => void)[] = [];
  readonly errorListeners: ((cause: unknown) => void)[] = [];
  readonly rawModes: boolean[] = [];
  isTTY: boolean | undefined = true;
  pauses = 0;
  resumes = 0;

  on(event: "data", listener: (text: string) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "data" | "end" | "error", listener: never): this {
    const values =
      event === "data"
        ? this.dataListeners
        : event === "end"
          ? this.endListeners
          : this.errorListeners;
    values.push(listener);
    return this;
  }

  off(event: "data", listener: (text: string) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "data" | "end" | "error", listener: never): this {
    const values =
      event === "data"
        ? this.dataListeners
        : event === "end"
          ? this.endListeners
          : this.errorListeners;
    const index = values.indexOf(listener);
    if (index >= 0) values.splice(index, 1);
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

  setEncoding(_encoding: "utf8"): this {
    return this;
  }

  setRawMode(enabled: boolean): this {
    this.rawModes.push(enabled);
    return this;
  }

  emit(text: string): void {
    for (const listener of [...this.dataListeners]) listener(text);
  }
}

class FakeOutput {
  readonly errorListeners: ((cause: unknown) => void)[] = [];
  readonly writes: string[] = [];
  readonly columns = 80;
  readonly rows = 24;
  isTTY: boolean | undefined = true;

  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "resize", listener: () => void): this;
  on(_event: "error" | "resize", listener: never): this {
    this.errorListeners.push(listener);
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "resize", listener: () => void): this;
  off(_event: "error" | "resize", listener: never): this {
    const index = this.errorListeners.indexOf(listener);
    if (index >= 0) this.errorListeners.splice(index, 1);
    return this;
  }

  write(text: string): boolean;
  write(text: string, callback: (cause?: unknown) => void): boolean;
  write(text: string, callback?: (cause?: unknown) => void): boolean {
    this.writes.push(text);
    callback?.();
    return true;
  }
}

test("reads a credential without echo and restores terminal ownership", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const pending = readHiddenOpenCodeZenCredential(input, output);

  await Promise.resolve();
  input.emit("secret-value\r");
  const result = await pending;

  assert.deepEqual(result, {
    ok: true,
    value: { credential: "secret-value", kind: "provided" },
  });
  assert.equal(output.writes.join("").includes("secret-value"), false);
  assert.deepEqual(input.rawModes, [true, false]);
  assert.equal(input.resumes, 1);
  assert.equal(input.pauses, 1);
  assert.equal(input.dataListeners.length, 0);
});

test("owns distinct hidden prompts for Go and Zen", async () => {
  for (const [read, label] of [
    [readHiddenOpenCodeGoCredential, "OpenCode Go"],
    [readHiddenOpenCodeZenCredential, "OpenCode Zen"],
  ] as const) {
    const input = new FakeInput();
    const output = new FakeOutput();
    const pending = read(input, output);
    await Promise.resolve();
    input.emit("provider-key\r");
    assert.deepEqual(await pending, {
      ok: true,
      value: { credential: "provider-key", kind: "provided" },
    });
    assert.equal(
      output.writes.at(0),
      label + " API key (hidden; Enter skips): ",
    );
    assert.equal(output.writes.join("").includes("provider-key"), false);
  }
});

test("supports editing, explicit skip, and cancellation", async () => {
  const editedInput = new FakeInput();
  const editedOutput = new FakeOutput();
  const edited = readHiddenOpenCodeZenCredential(editedInput, editedOutput);
  await Promise.resolve();
  editedInput.emit("abc\u007Fx\r");
  assert.deepEqual(await edited, {
    ok: true,
    value: { credential: "abx", kind: "provided" },
  });

  const skippedInput = new FakeInput();
  const skipped = readHiddenOpenCodeZenCredential(
    skippedInput,
    new FakeOutput(),
  );
  await Promise.resolve();
  skippedInput.emit("\r");
  assert.deepEqual(await skipped, { ok: true, value: { kind: "skipped" } });

  const cancelledInput = new FakeInput();
  const cancelled = readHiddenOpenCodeZenCredential(
    cancelledInput,
    new FakeOutput(),
  );
  await Promise.resolve();
  cancelledInput.emit("\u0003");
  assert.deepEqual(await cancelled, {
    ok: true,
    value: { kind: "cancelled" },
  });
});

test("does not prompt outside a fully interactive terminal", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  output.isTTY = false;

  assert.deepEqual(await readHiddenOpenCodeZenCredential(input, output), {
    ok: true,
    value: { kind: "skipped" },
  });
  assert.deepEqual(output.writes, []);
  assert.deepEqual(input.rawModes, []);
});

test("rejects whitespace and oversized input without echoing it", async () => {
  for (const value of ["two values", "x".repeat(8_193)]) {
    const input = new FakeInput();
    const output = new FakeOutput();
    const pending = readHiddenOpenCodeZenCredential(input, output);
    await Promise.resolve();
    input.emit(value + "\r");
    const result = await pending;

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "invalidCredential");
    assert.equal(output.writes.join("").includes(value), false);
    assert.deepEqual(input.rawModes, [true, false]);
  }
});
