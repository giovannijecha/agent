import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { arch, platform } from "node:process";
import test from "node:test";

import type { ToolCancellation } from "@agent/tools";

import {
  PLATFORM_WORKSPACE_MUTATION_DEADLINES,
  type PlatformWorkspaceMutationBoundary,
  PlatformWorkspaceMutationCommitter,
} from "../dist/platform-workspace-mutation.js";

const cancellation: ToolCancellation = Object.freeze({
  requested: false,
  whenRequested: async () => new Promise<void>(() => undefined),
});

function identity(status: Readonly<{ dev: bigint; ino: bigint }>) {
  return Object.freeze({ device: status.dev, inode: status.ino });
}

async function withWorkspace(
  run: (workspace: string) => Promise<void>,
): Promise<void> {
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-mutation-"));
  try {
    await run(await realpath(workspace));
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

function currentCommitter(): PlatformWorkspaceMutationCommitter {
  const created = PlatformWorkspaceMutationCommitter.create(platform, arch);
  assert.ok(created.ok);
  return created.value;
}

test("commits complete create and replace effects through the native boundary", async () => {
  await withWorkspace(async (workspace) => {
    const directory = path.join(workspace, "src");
    await mkdir(directory);
    const committer = currentCommitter();
    const createdContent = "alpha\nè" + "x".repeat(131_083);
    const created = await committer.commit(
      Object.freeze({
        content: createdContent,
        identity: identity(await lstat(directory, { bigint: true })),
        kind: "create" as const,
        relativePath: "src/file.txt",
        root: workspace,
      }),
      cancellation,
    );
    assert.deepEqual(created, { ok: true, value: "created" });
    const file = path.join(directory, "file.txt");
    assert.equal(await readFile(file, { encoding: "utf8" }), createdContent);

    const replacementContent = "beta\nà" + "y".repeat(196_613);
    const replaced = await committer.commit(
      Object.freeze({
        expectedContent: createdContent,
        identity: identity(await lstat(file, { bigint: true })),
        kind: "replace" as const,
        relativePath: "src/file.txt",
        replacement: replacementContent,
        root: workspace,
      }),
      cancellation,
    );
    assert.deepEqual(replaced, { ok: true, value: "replaced" });
    assert.equal(
      await readFile(file, { encoding: "utf8" }),
      replacementContent,
    );
  });
});

test("rejects stale parent, target appearance, content, and identity", async () => {
  await withWorkspace(async (workspace) => {
    const committer = currentCommitter();
    const directory = path.join(workspace, "src");
    await mkdir(directory);
    const parentIdentity = identity(await lstat(directory, { bigint: true }));
    const target = path.join(directory, "created.txt");
    await writeFile(target, "appeared", { encoding: "utf8", flag: "w" });
    assert.deepEqual(
      await committer.commit(
        {
          content: "approved",
          identity: parentIdentity,
          kind: "create",
          relativePath: "src/created.txt",
          root: workspace,
        },
        cancellation,
      ),
      { ok: false, error: { kind: "conflict" } },
    );
    assert.equal(await readFile(target, { encoding: "utf8" }), "appeared");

    const staleFile = path.join(directory, "stale.txt");
    await writeFile(staleFile, "before", { encoding: "utf8", flag: "w" });
    const staleIdentity = identity(await lstat(staleFile, { bigint: true }));
    await writeFile(staleFile, "changed", { encoding: "utf8", flag: "w" });
    assert.deepEqual(
      await committer.commit(
        {
          expectedContent: "before",
          identity: staleIdentity,
          kind: "replace",
          relativePath: "src/stale.txt",
          replacement: "after",
          root: workspace,
        },
        cancellation,
      ),
      { ok: false, error: { kind: "conflict" } },
    );
    assert.equal(await readFile(staleFile, { encoding: "utf8" }), "changed");

    const original = path.join(directory, "identity.txt");
    const moved = path.join(directory, "identity-old.txt");
    await writeFile(original, "original", { encoding: "utf8", flag: "w" });
    const originalIdentity = identity(await lstat(original, { bigint: true }));
    await rename(original, moved);
    await writeFile(original, "replacement object", {
      encoding: "utf8",
      flag: "w",
    });
    assert.deepEqual(
      await committer.commit(
        {
          expectedContent: "original",
          identity: originalIdentity,
          kind: "replace",
          relativePath: "src/identity.txt",
          replacement: "approved",
          root: workspace,
        },
        cancellation,
      ),
      { ok: false, error: { kind: "conflict" } },
    );
    assert.equal(
      await readFile(original, { encoding: "utf8" }),
      "replacement object",
    );

    const movedDirectory = path.join(workspace, "src-old");
    await rename(directory, movedDirectory);
    await mkdir(directory);
    assert.deepEqual(
      await committer.commit(
        {
          content: "approved",
          identity: parentIdentity,
          kind: "create",
          relativePath: "src/parent.txt",
          root: workspace,
        },
        cancellation,
      ),
      { ok: false, error: { kind: "conflict" } },
    );
  });
});

test("fails closed while another handle conflicts with replacement", async () => {
  await withWorkspace(async (workspace) => {
    const file = path.join(workspace, "open.txt");
    await writeFile(file, "before", { encoding: "utf8", flag: "w" });
    const opened = await open(file, "r+");
    try {
      const result = await currentCommitter().commit(
        {
          expectedContent: "before",
          identity: identity(await lstat(file, { bigint: true })),
          kind: "replace",
          relativePath: "open.txt",
          replacement: "after",
          root: workspace,
        },
        cancellation,
      );
      assert.deepEqual(result, { ok: false, error: { kind: "conflict" } });
    } finally {
      await opened.close();
    }
    assert.equal(await readFile(file, { encoding: "utf8" }), "before");
  });
});

test("forced creation settlement never retains partial approved content", async () => {
  await withWorkspace(async (workspace) => {
    let requestCancellation: (() => void) | undefined;
    const requested = new Promise<void>((resolve) => {
      requestCancellation = resolve;
    });
    const directory = path.join(workspace, "cancelled");
    await mkdir(directory);
    const content = "z".repeat(1_048_576);
    const committing = currentCommitter().commit(
      {
        content,
        identity: identity(await lstat(directory, { bigint: true })),
        kind: "create",
        relativePath: "cancelled/file.txt",
        root: workspace,
      },
      Object.freeze({
        requested: false,
        whenRequested: async () => requested,
      }),
    );
    requestCancellation?.();
    await committing;

    try {
      assert.equal(
        await readFile(path.join(directory, "file.txt"), {
          encoding: "utf8",
        }),
        content,
      );
    } catch (cause: unknown) {
      assert.equal(
        cause !== null &&
          typeof cause === "object" &&
          "code" in cause &&
          cause.code === "ENOENT",
        true,
      );
    }
  });
});

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
    return true;
  }

  emitError(cause: unknown): void {
    this.#error?.(cause);
  }
}

class FakeChild {
  readonly stdin = new FakeWritable();
  readonly stdout = new FakeReadable();
  readonly stderr = new FakeReadable();
  readonly stdio = Object.freeze([
    this.stdin,
    this.stdout,
    this.stderr,
    new FakeReadable(),
    new FakeReadable(),
  ] as const);
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

  emitClose(code: number | null, signal: string | null): void {
    this.#close?.(code, signal);
  }

  emitError(cause: unknown): void {
    this.#error?.(cause);
  }
}

class FakeDeadlines {
  readonly entries: { active: boolean; listener: () => void; milliseconds: number }[] = [];

  schedule(listener: () => void, milliseconds: number): () => void {
    const entry = { active: true, listener, milliseconds };
    this.entries.push(entry);
    return () => {
      entry.active = false;
    };
  }

  fire(milliseconds: number): void {
    const entry = this.entries.find(
      (candidate) => candidate.active && candidate.milliseconds === milliseconds,
    );
    assert.ok(entry !== undefined);
    entry.active = false;
    entry.listener();
  }
}

test("owns operation and cleanup deadlines with inert late events", async () => {
  const child = new FakeChild();
  const deadlines = new FakeDeadlines();
  let launch:
    | Readonly<{
        arguments_: readonly string[];
        executable: string;
        options: Parameters<PlatformWorkspaceMutationBoundary["launch"]>[2];
      }>
    | undefined;
  const boundary: PlatformWorkspaceMutationBoundary = Object.freeze({
    launch: (executable, arguments_, options) => {
      launch = Object.freeze({ arguments_, executable, options });
      return child;
    },
    schedule: (listener, milliseconds) =>
      deadlines.schedule(listener, milliseconds),
  });
  const created = PlatformWorkspaceMutationCommitter.create(
    "win32",
    "x64",
    boundary,
  );
  assert.ok(created.ok);
  const pending = created.value.commit(
    {
      content: "content",
      identity: Object.freeze({ device: 1n, inode: 2n }),
      kind: "create",
      relativePath: "file.txt",
      root: path.resolve("workspace"),
    },
    cancellation,
  );
  assert.equal(child.stdin.writes.length, 1);
  assert.equal(child.stdin.ended, true);
  assert.ok(launch !== undefined);
  assert.deepEqual(launch.arguments_, []);
  assert.equal(
    launch.executable.endsWith(
      path.join(
        ".native-build",
        "win32-x64",
        "agent-mutation-commit.exe",
      ),
    ),
    true,
  );
  assert.deepEqual(launch.options.env, {});
  assert.equal(launch.options.shell, false);
  assert.equal(launch.options.windowsHide, true);
  assert.deepEqual(
    launch.options.stdio,
    ["pipe", "pipe", "pipe", "pipe", "pipe"],
  );
  deadlines.fire(PLATFORM_WORKSPACE_MUTATION_DEADLINES.operationMilliseconds);
  assert.equal(child.kills, 1);
  assert.equal(child.stdin.destroyed, true);
  deadlines.fire(PLATFORM_WORKSPACE_MUTATION_DEADLINES.cleanupMilliseconds);
  assert.deepEqual(await pending, { ok: false, error: { kind: "io" } });

  child.stdout.emit(Uint8Array.from([
    0x41, 0x47, 0x4d, 0x52, 1, 1, 0, 0, 0, 0, 0, 0,
  ]));
  child.stderr.emit(Uint8Array.from([1]));
  child.stdin.emitError(new Error("late"));
  child.emitClose(0, null);
  child.emitError(new Error("late"));
});

function fakeCreateRequest() {
  return Object.freeze({
    content: "content",
    identity: Object.freeze({ device: 1n, inode: 2n }),
    kind: "create" as const,
    relativePath: "file.txt",
    root: path.resolve("workspace"),
  });
}

test("decodes exact native settlements and rejects excess output", async () => {
  const successfulChild = new FakeChild();
  const successful = PlatformWorkspaceMutationCommitter.create(
    "win32",
    "x64",
    Object.freeze({
      launch: () => successfulChild,
      schedule: () => () => undefined,
    }),
  );
  assert.ok(successful.ok);
  const success = successful.value.commit(fakeCreateRequest(), cancellation);
  successfulChild.stdout.emit(Uint8Array.from([
    0x41, 0x47, 0x4d, 0x52, 1, 1,
  ]));
  successfulChild.stdout.emit(Uint8Array.from([0, 0, 0, 0, 0, 0]));
  successfulChild.emitClose(0, null);
  assert.deepEqual(await success, { ok: true, value: "created" });

  const conflictChild = new FakeChild();
  const conflict = PlatformWorkspaceMutationCommitter.create(
    "linux",
    "x64",
    Object.freeze({
      launch: () => conflictChild,
      schedule: () => () => undefined,
    }),
  );
  assert.ok(conflict.ok);
  const failed = conflict.value.commit(fakeCreateRequest(), cancellation);
  conflictChild.stdout.emit(Uint8Array.from([
    0x41, 0x47, 0x4d, 0x52, 1, 3, 0, 0, 0, 0, 0, 0,
  ]));
  conflictChild.emitClose(0, null);
  assert.deepEqual(await failed, {
    ok: false,
    error: { kind: "conflict" },
  });

  const oversizedChild = new FakeChild();
  const oversized = PlatformWorkspaceMutationCommitter.create(
    "win32",
    "x64",
    Object.freeze({
      launch: () => oversizedChild,
      schedule: () => () => undefined,
    }),
  );
  assert.ok(oversized.ok);
  const bounded = oversized.value.commit(fakeCreateRequest(), cancellation);
  oversizedChild.stdout.emit(new Uint8Array(13));
  oversizedChild.emitClose(null, "SIGTERM");
  assert.deepEqual(await bounded, { ok: false, error: { kind: "io" } });
});

test("contains a synchronous native launch failure", async () => {
  const created = PlatformWorkspaceMutationCommitter.create(
    "win32",
    "x64",
    Object.freeze({
      launch: () => {
        throw new Error("private launch cause");
      },
      schedule: () => () => undefined,
    }),
  );
  assert.ok(created.ok);
  assert.deepEqual(
    await created.value.commit(fakeCreateRequest(), cancellation),
    { ok: false, error: { kind: "io" } },
  );
});

test("rejects unsupported targets and pre-requested cancellation", async () => {
  assert.deepEqual(
    PlatformWorkspaceMutationCommitter.create("darwin", "x64"),
    { ok: false, error: { kind: "unsupportedPlatform" } },
  );
  const committer = currentCommitter();
  const result = await committer.commit(
    {
      content: "content",
      identity: Object.freeze({ device: 1n, inode: 2n }),
      kind: "create",
      relativePath: "file.txt",
      root: path.resolve("workspace"),
    },
    Object.freeze({
      requested: true,
      whenRequested: async () => undefined,
    }),
  );
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});
