import assert from "node:assert/strict";
import test from "node:test";

import { ok } from "@agent/core";

import {
  runAuthCommand,
  type AuthCredentialOpener,
} from "../dist/auth-command.js";
import type {
  OllamaCredentialMutationAction,
  OllamaCredentialMutationPort,
  OllamaCredentialMutationResult,
} from "../dist/credential-broker.js";

class FakeInput {
  isTTY = true;
  readonly raw: boolean[] = [];
  readonly #data: ((text: string) => void)[] = [];
  readonly #end: (() => void)[] = [];
  readonly #error: ((cause: unknown) => void)[] = [];

  off(event: "data", listener: (text: string) => void): this;
  off(event: "end", listener: () => void): this;
  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "data" | "end" | "error", listener: unknown): this {
    const values = event === "data"
      ? this.#data
      : event === "end"
        ? this.#end
        : this.#error;
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
    return this;
  }

  resume(): this {
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
    assert.ok(this.#data.length > 0);
    for (const listener of [...this.#data]) listener(text);
  }
}

class FakeOutput {
  columns = 80;
  isTTY = true;
  rows = 24;
  readonly writes: string[] = [];
  readonly #errors: ((cause: unknown) => void)[] = [];

  off(event: "error", listener: (cause: unknown) => void): this;
  off(event: "resize", listener: () => void): this;
  off(
    event: "error" | "resize",
    listener: ((cause: unknown) => void) | (() => void),
  ): this {
    if (event === "resize") return this;
    const index = this.#errors.indexOf(listener);
    if (index >= 0) this.#errors.splice(index, 1);
    return this;
  }

  on(event: "error", listener: (cause: unknown) => void): this;
  on(event: "resize", listener: () => void): this;
  on(
    event: "error" | "resize",
    listener: ((cause: unknown) => void) | (() => void),
  ): this {
    if (event === "error") {
      this.#errors.push(listener as (cause: unknown) => void);
    }
    return this;
  }

  write(text: string, callback: (cause?: unknown) => void): boolean {
    this.writes.push(text);
    callback();
    return true;
  }
}

class FakeMutation implements OllamaCredentialMutationPort {
  readonly actions: OllamaCredentialMutationAction[] = [];
  cancels = 0;

  constructor(readonly state: "absent" | "present") {}

  cancel() {
    this.cancels += 1;
    return Promise.resolve(ok("cancelled" as const));
  }

  perform(action: OllamaCredentialMutationAction) {
    this.actions.push(action);
    const result: OllamaCredentialMutationResult = action.kind === "register"
      ? "registered"
      : action.kind === "replace"
        ? "replaced"
        : action.kind === "remove"
          ? "removed"
          : "cancelled";
    return Promise.resolve(ok(result));
  }
}

function opener(
  mutation: FakeMutation,
  observedEnvironment: boolean[],
): AuthCredentialOpener {
  return (_platform, _architecture, environmentPresent) => {
    observedEnvironment.push(environmentPresent);
    return Promise.resolve(ok(mutation));
  };
}

async function waitForRaw(input: FakeInput, count: number): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (input.raw.length >= count && input.raw.at(-1) === true) return;
    await Promise.resolve();
  }
  assert.equal("auth input", "ready");
}

test("registers one concealed key without projecting or retaining it in output", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const mutation = new FakeMutation("absent");
  const environment: boolean[] = [];
  const running = runAuthCommand(
    "win32",
    "x64",
    undefined,
    input,
    output,
    opener(mutation, environment),
  );
  await waitForRaw(input, 1);
  input.emitData("r");
  await waitForRaw(input, 3);
  input.emitData("private-fixture-key\r");

  const result = await running;
  assert.ok(result.ok);
  assert.equal(result.value, "registered");
  assert.deepEqual(environment, [false]);
  assert.deepEqual(mutation.actions, [
    { key: "private-fixture-key", kind: "register" },
  ]);
  assert.equal(output.writes.join("").includes("private-fixture-key"), false);
  assert.equal(output.writes.join("").includes("credential registered"), true);
  assert.deepEqual(input.raw, [true, false, true, false]);
});

test("removes a present record without opening credential input", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const mutation = new FakeMutation("present");
  const running = runAuthCommand(
    "linux",
    "x64",
    undefined,
    input,
    output,
    opener(mutation, []),
  );
  await waitForRaw(input, 1);
  input.emitData("d");

  const result = await running;
  assert.ok(result.ok);
  assert.equal(result.value, "removed");
  assert.deepEqual(mutation.actions, [{ kind: "remove" }]);
  assert.deepEqual(input.raw, [true, false]);
  assert.equal(output.writes.join("").includes("API key:"), false);
});

test("cancels without mutation and blocks environment-only registration", async () => {
  const cancelledInput = new FakeInput();
  const cancelledMutation = new FakeMutation("present");
  const cancelling = runAuthCommand(
    "linux",
    "x64",
    undefined,
    cancelledInput,
    new FakeOutput(),
    opener(cancelledMutation, []),
  );
  await waitForRaw(cancelledInput, 1);
  cancelledInput.emitData("c");
  const cancelled = await cancelling;
  assert.ok(cancelled.ok);
  assert.equal(cancelled.value, "cancelled");
  assert.equal(cancelledMutation.cancels, 1);
  assert.deepEqual(cancelledMutation.actions, []);

  const environmentMutation = new FakeMutation("absent");
  const environmentOutput = new FakeOutput();
  const environment = await runAuthCommand(
    "win32",
    "x64",
    "environment-key",
    new FakeInput(),
    environmentOutput,
    opener(environmentMutation, []),
  );
  assert.equal(environment.ok, false);
  if (!environment.ok) {
    assert.equal(environment.error.kind, "environmentAuthority");
  }
  assert.equal(environmentMutation.cancels, 1);
  assert.deepEqual(environmentMutation.actions, []);
  assert.deepEqual(environmentOutput.writes, []);
});
