import assert from "node:assert/strict";
import path from "node:path";
import { arch, platform } from "node:process";
import test from "node:test";

import {
  decodePlatformWorkspaceRoots,
  PLATFORM_WORKSPACE_ROOTS_LIMITS,
} from "../dist/platform-workspace-roots-protocol.js";
import {
  PLATFORM_WORKSPACE_ROOTS_DEADLINES,
  type PlatformWorkspaceRootsBoundary,
  resolvePlatformWorkspaceRoots,
} from "../dist/platform-workspace-roots.js";

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

class FakeResolverChild {
  readonly stderr = new FakeReadable();
  readonly stdout = new FakeReadable();
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

function boundary(
  child: FakeResolverChild,
  deadlines: FakeDeadlines,
): PlatformWorkspaceRootsBoundary {
  return Object.freeze({
    launch: (_executable, _arguments, _options) => child,
    schedule: (listener: () => void, milliseconds: number) =>
      deadlines.schedule(listener, milliseconds),
  });
}

function ascii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    assert.ok(code <= 0x7f);
    bytes[index] = code;
  }
  return bytes;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value,
    true,
  );
}

function rootsFrame(home: Uint8Array, temporary: Uint8Array): Uint8Array {
  const payloadLength = 8 + home.length + temporary.length;
  const frame = new Uint8Array(12 + payloadLength);
  frame.set([0x41, 0x47, 0x57, 0x52, 1, 1, 0, 0], 0);
  writeU32(frame, 8, payloadLength);
  writeU32(frame, 12, home.length);
  frame.set(home, 16);
  const temporaryLengthOffset = 16 + home.length;
  writeU32(frame, temporaryLengthOffset, temporary.length);
  frame.set(temporary, temporaryLengthOffset + 4);
  return frame;
}

test("decodes one exact immutable platform-roots frame", () => {
  const home = path.resolve("platform-home");
  const temporary = path.resolve("platform-temporary");

  const decoded = decodePlatformWorkspaceRoots(
    rootsFrame(ascii(home), ascii(temporary)),
  );

  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, {
    homeDirectory: home,
    temporaryDirectory: temporary,
  });
  assert.equal(Object.isFrozen(decoded.value), true);
});

test("rejects malformed, trailing, relative, duplicate, and invalid UTF-8 roots", () => {
  const home = ascii(path.resolve("platform-home"));
  const temporary = ascii(path.resolve("platform-temporary"));
  const valid = rootsFrame(home, temporary);

  const wrongMagic = valid.slice();
  wrongMagic[0] = 0;
  assert.equal(decodePlatformWorkspaceRoots(wrongMagic).ok, false);
  for (const offset of [4, 5, 6, 7]) {
    const wrongHeader = valid.slice();
    wrongHeader[offset] = 2;
    assert.equal(decodePlatformWorkspaceRoots(wrongHeader).ok, false);
  }
  assert.equal(
    decodePlatformWorkspaceRoots(valid.slice(0, valid.length - 1)).ok,
    false,
  );
  const trailing = new Uint8Array(valid.length + 1);
  trailing.set(valid);
  assert.equal(decodePlatformWorkspaceRoots(trailing).ok, false);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(ascii("relative"), temporary)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(home, home)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(
      rootsFrame(Uint8Array.from([0xc0, 0x80]), temporary),
    ).ok,
    false,
  );
  const nulBearing = new Uint8Array(home.length + 1);
  nulBearing.set(home);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(nulBearing, temporary)).ok,
    false,
  );
});

test("enforces exact path and frame byte limits", () => {
  const temporary = ascii(path.resolve("platform-temporary"));
  const oversizedPath = new Uint8Array(
    PLATFORM_WORKSPACE_ROOTS_LIMITS.pathUtf8Bytes + 1,
  );
  oversizedPath.fill(0x61);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(oversizedPath, temporary)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(
      new Uint8Array(PLATFORM_WORKSPACE_ROOTS_LIMITS.frameBytes + 1),
    ).ok,
    false,
  );
});

test("resolves current roots and fails closed on unsupported targets", async () => {
  const resolved = await resolvePlatformWorkspaceRoots(platform, arch);

  assert.ok(resolved.ok);
  assert.equal(path.isAbsolute(resolved.value.homeDirectory), true);
  assert.equal(path.isAbsolute(resolved.value.temporaryDirectory), true);
  assert.equal(Object.isFrozen(resolved.value), true);

  const unsupported = await resolvePlatformWorkspaceRoots("unsupported", "x64");
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.kind, "unsupportedPlatform");
    assert.equal(Object.isFrozen(unsupported.error), true);
  }
});

test("settles at the resolver cleanup deadline when close never arrives", async () => {
  const child = new FakeResolverChild();
  const deadlines = new FakeDeadlines();
  const pending = resolvePlatformWorkspaceRoots(
    "win32",
    "x64",
    boundary(child, deadlines),
  );

  deadlines.fire(PLATFORM_WORKSPACE_ROOTS_DEADLINES.operationMilliseconds);
  assert.equal(child.kills, 1);
  assert.equal(
    deadlines.count(PLATFORM_WORKSPACE_ROOTS_DEADLINES.cleanupMilliseconds),
    1,
  );
  deadlines.fire(PLATFORM_WORKSPACE_ROOTS_DEADLINES.cleanupMilliseconds);

  assert.deepEqual(await pending, { ok: false, error: { kind: "timeout" } });
  child.stdout.emit(Uint8Array.from([1, 2, 3]));
  child.stderr.emit(Uint8Array.from([4]));
  child.emitClose(null, "SIGTERM");
  child.emitError(new Error("late"));
});

test("settles resolver timeout when kill fails or throws", async () => {
  for (const mode of ["false", "throw"] as const) {
    const child = new FakeResolverChild();
    const deadlines = new FakeDeadlines();
    if (mode === "false") {
      child.killResult = false;
    } else {
      child.killCause = new Error("private native cause");
    }
    const pending = resolvePlatformWorkspaceRoots(
      "linux",
      "x64",
      boundary(child, deadlines),
    );

    deadlines.fire(PLATFORM_WORKSPACE_ROOTS_DEADLINES.operationMilliseconds);

    assert.deepEqual(await pending, {
      ok: false,
      error: { kind: "timeout" },
    });
    assert.equal(child.kills, 1);
  }
});

test("settles the resolver failure when close arrives during cleanup", async () => {
  const child = new FakeResolverChild();
  const deadlines = new FakeDeadlines();
  const pending = resolvePlatformWorkspaceRoots(
    "linux",
    "x64",
    boundary(child, deadlines),
  );

  deadlines.fire(PLATFORM_WORKSPACE_ROOTS_DEADLINES.operationMilliseconds);
  child.emitClose(null, "SIGTERM");

  assert.deepEqual(await pending, { ok: false, error: { kind: "timeout" } });
  assert.equal(
    deadlines.count(PLATFORM_WORKSPACE_ROOTS_DEADLINES.cleanupMilliseconds),
    0,
  );
});
