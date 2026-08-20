import assert from "node:assert/strict";
import test from "node:test";

import {
  CREDENTIAL_BROKER_DEADLINES,
  type CredentialBrokerBoundary,
  openOllamaCredentialMutation,
  openOllamaCredentialSnapshot,
} from "../dist/credential-broker.js";

class FakeReadable {
  readonly #listeners: ((chunk: Uint8Array) => void)[] = [];

  on(event: "data", listener: (chunk: Uint8Array) => void): this {
    assert.equal(event, "data");
    this.#listeners.push(listener);
    return this;
  }

  emit(chunk: Uint8Array): void {
    for (const listener of this.#listeners) listener(chunk);
  }
}

class FakeWritable {
  readonly writes: Uint8Array[] = [];
  destroyed = false;
  ends = 0;
  #error: ((cause: unknown) => void) | undefined;

  destroy(): void {
    this.destroyed = true;
  }

  end(): void {
    this.ends += 1;
  }

  once(event: "error", listener: (cause: unknown) => void): this {
    assert.equal(event, "error");
    this.#error = listener;
    return this;
  }

  write(chunk: Uint8Array): boolean {
    this.writes.push(chunk.slice());
    return true;
  }

  emitError(cause: unknown): void {
    this.#error?.(cause);
  }
}

class FakeChild {
  readonly stdin = new FakeWritable();
  readonly stderr = new FakeReadable();
  readonly stdout = new FakeReadable();
  readonly stdio = [
    this.stdin,
    this.stdout,
    this.stderr,
    new FakeReadable(),
    new FakeReadable(),
  ] as const;
  kills = 0;
  #close: ((code: number | null, signal: string | null) => void) | undefined;
  #error: ((cause: unknown) => void) | undefined;

  kill(): boolean {
    this.kills += 1;
    return true;
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

  emitClose(code: number | null = 0, signal: string | null = null): void {
    this.#close?.(code, signal);
  }

  emitError(cause: unknown): void {
    this.#error?.(cause);
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

  fire(milliseconds: number): void {
    const entry = this.#entries.find(
      (candidate) => candidate.active && candidate.milliseconds === milliseconds,
    );
    assert.ok(entry !== undefined);
    entry.active = false;
    entry.listener();
  }
}

function boundary(
  child: FakeChild,
  deadlines: FakeDeadlines,
): CredentialBrokerBoundary {
  return Object.freeze({
    launch: (_executable, _arguments, _options) => child,
    schedule: (listener, milliseconds) => deadlines.schedule(listener, milliseconds),
  });
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function response(kind: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const frame = new Uint8Array(12 + payload.length);
  frame.set([0x41, 0x47, 0x43, 0x53, 1, kind, 0, 0], 0);
  new DataView(frame.buffer).setUint32(8, payload.length, true);
  frame.set(payload, 12);
  return frame;
}

test("retains one shared admission for an environment snapshot until cleanup", async () => {
  const child = new FakeChild();
  const deadlines = new FakeDeadlines();
  const opening = openOllamaCredentialSnapshot(
    "win32",
    "x64",
    "synthetic-key",
    boundary(child, deadlines),
  );
  assert.equal(child.stdin.writes.length, 1);
  assert.deepEqual([...child.stdin.writes.at(0)!], [
    0x41, 0x47, 0x43, 0x52, 1, 1, 0, 0, 1, 0, 0, 0, 1,
  ]);
  child.stdout.emit(response(1));
  const opened = await opening;
  assert.ok(opened.ok);
  assert.deepEqual(opened.value.configuration, {
    credential: "synthetic-key",
    kind: "enabled",
  });
  assert.equal(opened.value.admission.active(), true);

  const closing = opened.value.admission.close();
  assert.equal(child.stdin.ends, 1);
  child.emitClose();
  assert.ok((await closing).ok);
  assert.equal(opened.value.admission.active(), false);
});

test("uses a validated durable response and rejects dual authority content-free", async () => {
  const durableChild = new FakeChild();
  const durable = openOllamaCredentialSnapshot(
    "linux",
    "x64",
    undefined,
    boundary(durableChild, new FakeDeadlines()),
  );
  durableChild.stdout.emit(response(2, ascii("durable-key")));
  const opened = await durable;
  assert.ok(opened.ok);
  assert.deepEqual(opened.value.configuration, {
    credential: "durable-key",
    kind: "enabled",
  });
  const closing = opened.value.admission.close();
  durableChild.emitClose();
  assert.ok((await closing).ok);

  const dualChild = new FakeChild();
  const dual = openOllamaCredentialSnapshot(
    "linux",
    "x64",
    "environment-key",
    boundary(dualChild, new FakeDeadlines()),
  );
  dualChild.stdout.emit(response(9));
  dualChild.emitClose();
  const rejected = await dual;
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.kind, "dualAuthority");
});

test("holds one exclusive two-phase mutation through exact settlement", async () => {
  const child = new FakeChild();
  const deadlines = new FakeDeadlines();
  const opening = openOllamaCredentialMutation(
    "win32",
    "x64",
    false,
    boundary(child, deadlines),
  );
  child.stdout.emit(response(3));
  const opened = await opening;
  assert.ok(opened.ok);
  assert.equal(opened.value.state, "present");

  const replacing = opened.value.perform(Object.freeze({
    key: "replacement-key",
    kind: "replace" as const,
  }));
  assert.equal(child.stdin.writes.length, 2);
  assert.equal(child.stdin.writes.at(1)?.at(5), 4);
  child.stdout.emit(response(5));
  await Promise.resolve();
  assert.equal(child.stdin.ends, 1);
  child.emitClose();
  const replaced = await replacing;
  assert.ok(replaced.ok);
  assert.equal(replaced.value, "replaced");
});

test("times out one stalled operation and revokes the broker", async () => {
  const child = new FakeChild();
  const deadlines = new FakeDeadlines();
  const opening = openOllamaCredentialSnapshot(
    "win32",
    "x64",
    undefined,
    boundary(child, deadlines),
  );
  deadlines.fire(CREDENTIAL_BROKER_DEADLINES.operationMilliseconds);
  const result = await opening;
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "timeout");
  assert.equal(child.kills, 1);
});
