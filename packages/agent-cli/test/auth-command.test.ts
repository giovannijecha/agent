import assert from "node:assert/strict";
import test from "node:test";

import { err, ok } from "@agent/core";

import {
  runAuthCommand,
  type AuthCommandDependencies,
  type AuthCredentialOpener,
} from "../dist/auth-command.js";
import type {
  AuthCancellationMonitor,
  AuthCancellationPort,
} from "../dist/auth-terminal.js";
import type {
  OllamaCredentialMutationAction,
  OllamaCredentialMutationPort,
  OllamaCredentialMutationResult,
  OpenAICredentialMutationAction,
  OpenAICredentialMutationPort,
  OpenAICredentialMutationResult,
} from "../dist/credential-broker.js";
import type { OpenAICredential } from "../dist/credential-broker-protocol.js";
import type {
  OpenAIDeviceAuthCancellation,
  OpenAIDeviceAuthPort,
} from "../dist/node-openai-device-auth.js";

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

  constructor(readonly throwAtWrite?: number) {}

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
    if (event === "error") this.#errors.push(listener as (cause: unknown) => void);
    return this;
  }

  write(text: string, callback: (cause?: unknown) => void): boolean {
    this.writes.push(text);
    if (this.writes.length === this.throwAtWrite) {
      throw new Error("synthetic output failure");
    }
    callback();
    return true;
  }
}

class FakeOllamaMutation implements OllamaCredentialMutationPort {
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

class FakeOpenAIMutation implements OpenAICredentialMutationPort {
  readonly actions: OpenAICredentialMutationAction[] = [];
  cancels = 0;

  constructor(
    readonly state: "absent" | "present",
    readonly cancelFailure = false,
  ) {}

  cancel() {
    this.cancels += 1;
    return Promise.resolve(
      this.cancelFailure
        ? err(Object.freeze({ kind: "store" as const }))
        : ok("cancelled" as const),
    );
  }

  perform(action: OpenAICredentialMutationAction) {
    this.actions.push(action);
    const result: OpenAICredentialMutationResult = action.kind === "register"
      ? "registered"
      : action.kind === "replace"
        ? "replaced"
        : action.kind === "remove"
          ? "removed"
          : "cancelled";
    return Promise.resolve(ok(result));
  }
}

class FakeCancellation implements AuthCancellationPort {
  readonly #listeners = new Set<() => void>();
  value = false;

  cancelled(): boolean {
    return this.value;
  }

  onCancel(listener: () => void): void {
    this.#listeners.add(listener);
  }

  offCancel(listener: () => void): void {
    this.#listeners.delete(listener);
  }
}

class FakeMonitor implements AuthCancellationMonitor {
  readonly cancellation = new FakeCancellation();
  closes = 0;

  close() {
    this.closes += 1;
    return ok(undefined);
  }
}

const SYNTHETIC_OPENAI_CREDENTIAL: OpenAICredential = Object.freeze({
  accessToken: "synthetic-access-value",
  accountId: "synthetic-account",
  expiresAt: 9_000_000_000,
  refreshToken: "synthetic-refresh-value",
});

class FakeDeviceAuth implements OpenAIDeviceAuthPort {
  calls = 0;
  constructor(readonly outcome: "cancelled" | "success" = "success") {}

  async authenticate(
    cancellation: OpenAIDeviceAuthCancellation,
    present: Parameters<OpenAIDeviceAuthPort["authenticate"]>[1],
  ) {
    this.calls += 1;
    assert.equal(cancellation.cancelled(), false);
    if (this.outcome === "cancelled") {
      return err(Object.freeze({ kind: "cancelled" as const }));
    }
    assert.equal(await present(Object.freeze({
      userCode: "ABCD-EFGH",
      verificationUrl: "https://auth.openai.com/codex/device",
    })), true);
    return ok(SYNTHETIC_OPENAI_CREDENTIAL);
  }
}

function dependencies(
  ollama: FakeOllamaMutation,
  openAI: FakeOpenAIMutation,
  device = new FakeDeviceAuth(),
  monitor = new FakeMonitor(),
  observations: string[] = [],
): AuthCommandDependencies {
  const openOllamaMutation: AuthCredentialOpener = (
    _platform,
    _architecture,
    environmentPresent,
  ) => {
    observations.push("ollama:" + String(environmentPresent));
    return Promise.resolve(ok(ollama));
  };
  return Object.freeze({
    openAIDeviceAuth: device,
    openOllamaMutation,
    openOpenAIMutation: (_platform, _architecture) => {
      observations.push("openai");
      return Promise.resolve(ok(openAI));
    },
    startCancellation: (_input) => ok(monitor),
  });
}

async function waitForRaw(input: FakeInput, count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (input.raw.length >= count && input.raw.at(-1) === true) return;
    await Promise.resolve();
  }
  assert.equal("auth input", "ready");
}

test("selects Ollama then registers one concealed key without projection", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const ollama = new FakeOllamaMutation("absent");
  const observations: string[] = [];
  const running = runAuthCommand(
    "win32",
    "x64",
    undefined,
    input,
    output,
    dependencies(ollama, new FakeOpenAIMutation("absent"), undefined, undefined, observations),
  );
  await waitForRaw(input, 1);
  input.emitData("o");
  await waitForRaw(input, 3);
  input.emitData("r");
  await waitForRaw(input, 5);
  input.emitData("private-fixture-key\r");

  const result = await running;
  assert.deepEqual(result, { ok: true, value: "registered" });
  assert.deepEqual(observations, ["ollama:false"]);
  assert.deepEqual(ollama.actions, [
    { key: "private-fixture-key", kind: "register" },
  ]);
  assert.equal(output.writes.join("").includes("private-fixture-key"), false);
  assert.deepEqual(input.raw, [true, false, true, false, true, false]);
});

test("retains Ollama environment dual-authority behavior after selection", async () => {
  const input = new FakeInput();
  const ollama = new FakeOllamaMutation("absent");
  const running = runAuthCommand(
    "linux",
    "x64",
    "environment-value",
    input,
    new FakeOutput(),
    dependencies(ollama, new FakeOpenAIMutation("absent")),
  );
  await waitForRaw(input, 1);
  input.emitData("o");

  assert.deepEqual(await running, {
    error: { kind: "environmentAuthority" },
    ok: false,
  });
  assert.equal(ollama.cancels, 1);
  assert.deepEqual(ollama.actions, []);
});

test("opens no credential authority when provider selection is cancelled", async () => {
  const input = new FakeInput();
  const observations: string[] = [];
  const running = runAuthCommand(
    "linux",
    "x64",
    undefined,
    input,
    new FakeOutput(),
    dependencies(
      new FakeOllamaMutation("absent"),
      new FakeOpenAIMutation("absent"),
      undefined,
      undefined,
      observations,
    ),
  );
  await waitForRaw(input, 1);
  input.emitData("c");

  assert.deepEqual(await running, { ok: true, value: "cancelled" });
  assert.deepEqual(observations, []);
});

test("registers OpenAI only after disclosure, challenge, and cleanup", async () => {
  const input = new FakeInput();
  const output = new FakeOutput();
  const openAI = new FakeOpenAIMutation("absent");
  const device = new FakeDeviceAuth();
  const monitor = new FakeMonitor();
  const observations: string[] = [];
  const running = runAuthCommand(
    "win32",
    "x64",
    "unrelated-ollama-environment-value",
    input,
    output,
    dependencies(
      new FakeOllamaMutation("absent"),
      openAI,
      device,
      monitor,
      observations,
    ),
  );
  await waitForRaw(input, 1);
  input.emitData("a");
  await waitForRaw(input, 3);
  input.emitData("s");

  assert.deepEqual(await running, { ok: true, value: "registered" });
  assert.deepEqual(observations, ["openai"]);
  assert.equal(device.calls, 1);
  assert.equal(monitor.closes, 1);
  assert.deepEqual(openAI.actions, [{
    credential: SYNTHETIC_OPENAI_CREDENTIAL,
    kind: "register",
  }]);
  const visible = output.writes.join("");
  assert.equal(/not endorsed by OpenAI/u.test(visible), true);
  assert.equal(/https:\/\/auth\.openai\.com\/codex\/device/u.test(visible), true);
  assert.equal(/ABCD-EFGH/u.test(visible), true);
  assert.equal(/synthetic-access-value/u.test(visible), false);
  assert.equal(/remains unavailable/u.test(visible), true);
});

test("replaces a present OpenAI record and removes it with honest local scope", async () => {
  const replacementInput = new FakeInput();
  const replacement = new FakeOpenAIMutation("present");
  const replacing = runAuthCommand(
    "linux",
    "x64",
    undefined,
    replacementInput,
    new FakeOutput(),
    dependencies(new FakeOllamaMutation("absent"), replacement),
  );
  await waitForRaw(replacementInput, 1);
  replacementInput.emitData("a");
  await waitForRaw(replacementInput, 3);
  replacementInput.emitData("s");
  assert.deepEqual(await replacing, { ok: true, value: "replaced" });
  assert.equal(replacement.actions.at(0)?.kind, "replace");

  const removalInput = new FakeInput();
  const removalOutput = new FakeOutput();
  const removal = new FakeOpenAIMutation("present");
  const removing = runAuthCommand(
    "linux",
    "x64",
    undefined,
    removalInput,
    removalOutput,
    dependencies(new FakeOllamaMutation("absent"), removal),
  );
  await waitForRaw(removalInput, 1);
  removalInput.emitData("a");
  await waitForRaw(removalInput, 3);
  removalInput.emitData("d");
  assert.deepEqual(await removing, { ok: true, value: "removed" });
  assert.deepEqual(removal.actions, [{ kind: "remove" }]);
  assert.equal(/was not revoked/u.test(removalOutput.writes.join("")), true);
});

test("cancels the native OpenAI mutation when the device ceremony cancels", async () => {
  const input = new FakeInput();
  const openAI = new FakeOpenAIMutation("absent");
  const running = runAuthCommand(
    "linux",
    "x64",
    undefined,
    input,
    new FakeOutput(),
    dependencies(
      new FakeOllamaMutation("absent"),
      openAI,
      new FakeDeviceAuth("cancelled"),
    ),
  );
  await waitForRaw(input, 1);
  input.emitData("a");
  await waitForRaw(input, 3);
  input.emitData("s");

  assert.deepEqual(await running, { ok: true, value: "cancelled" });
  assert.equal(openAI.cancels, 1);
  assert.deepEqual(openAI.actions, []);
});

test("surfaces native cleanup failure after an OpenAI output failure", async () => {
  const input = new FakeInput();
  const openAI = new FakeOpenAIMutation("absent", true);
  const running = runAuthCommand(
    "linux",
    "x64",
    undefined,
    input,
    new FakeOutput(2),
    dependencies(new FakeOllamaMutation("absent"), openAI),
  );
  await waitForRaw(input, 1);
  input.emitData("a");

  assert.deepEqual(await running, { error: { kind: "store" }, ok: false });
  assert.equal(openAI.cancels, 1);
  assert.deepEqual(openAI.actions, []);
});
