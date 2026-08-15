import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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

import { PlatformWorkspaceNamespaceCommitter } from "../dist/platform-workspace-namespace.js";

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
  const workspace = await mkdtemp(path.join(tmpdir(), "agent-namespace-"));
  try {
    await run(await realpath(workspace));
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
}

function currentCommitter(): PlatformWorkspaceNamespaceCommitter {
  const created = PlatformWorkspaceNamespaceCommitter.create(platform, arch);
  assert.ok(created.ok);
  return created.value;
}

test("commits only object-bound namespace effects through the native boundary", async () => {
  await withWorkspace(async (workspace) => {
    const source = path.join(workspace, "source");
    const destination = path.join(workspace, "destination");
    await mkdir(source);
    await mkdir(destination);
    const committer = currentCommitter();

    const created = await committer.commit(
      {
        kind: "create_directory",
        parentIdentity: identity(await lstat(source, { bigint: true })),
        relativePath: "source/created",
        root: workspace,
      },
      cancellation,
    );
    assert.deepEqual(created, { ok: true, value: "directory_created" });

    const file = path.join(source, "file.txt");
    await writeFile(file, "owned", { encoding: "utf8", flag: "wx" });
    const moved = await committer.commit(
      {
        destinationParentIdentity: identity(
          await lstat(destination, { bigint: true }),
        ),
        destinationPath: "destination/file.txt",
        entryKind: "file",
        identity: identity(await lstat(file, { bigint: true })),
        kind: "move",
        relativePath: "source/file.txt",
        root: workspace,
        sourceParentIdentity: identity(await lstat(source, { bigint: true })),
      },
      cancellation,
    );
    if (platform === "linux") {
      assert.deepEqual(moved, {
        ok: false,
        error: { kind: "unsupported" },
      });
      assert.equal(await readFile(file, { encoding: "utf8" }), "owned");
      assert.deepEqual(await readdir(destination, { withFileTypes: true }), []);

      const removedFile = await committer.commit(
        {
          entryKind: "file",
          identity: identity(await lstat(file, { bigint: true })),
          kind: "remove",
          parentIdentity: identity(await lstat(source, { bigint: true })),
          relativePath: "source/file.txt",
          root: path.join(workspace, "missing-root"),
        },
        cancellation,
      );
      assert.deepEqual(removedFile, {
        ok: false,
        error: { kind: "unsupported" },
      });
      assert.equal(await readFile(file, { encoding: "utf8" }), "owned");

      const createdDirectory = path.join(source, "created");
      const removedDirectory = await committer.commit(
        {
          entryKind: "directory",
          identity: identity(await lstat(createdDirectory, { bigint: true })),
          kind: "remove",
          parentIdentity: identity(await lstat(source, { bigint: true })),
          relativePath: "source/created",
          root: workspace,
        },
        cancellation,
      );
      assert.deepEqual(removedDirectory, {
        ok: false,
        error: { kind: "unsupported" },
      });
      assert.equal((await lstat(createdDirectory)).isDirectory(), true);
      return;
    }
    assert.deepEqual(moved, { ok: true, value: "moved" });
    const movedFile = path.join(destination, "file.txt");
    assert.equal(await readFile(movedFile, { encoding: "utf8" }), "owned");

    const removedFile = await committer.commit(
      {
        entryKind: "file",
        identity: identity(await lstat(movedFile, { bigint: true })),
        kind: "remove",
        parentIdentity: identity(await lstat(destination, { bigint: true })),
        relativePath: "destination/file.txt",
        root: workspace,
      },
      cancellation,
    );
    assert.deepEqual(removedFile, { ok: true, value: "removed" });

    const empty = path.join(source, "created");
    const removedDirectory = await committer.commit(
      {
        entryKind: "directory",
        identity: identity(await lstat(empty, { bigint: true })),
        kind: "remove",
        parentIdentity: identity(await lstat(source, { bigint: true })),
        relativePath: "source/created",
        root: workspace,
      },
      cancellation,
    );
    assert.deepEqual(removedDirectory, { ok: true, value: "removed" });
  });
});

test("rejects stale identities and unsupported or conflicting effects", async () => {
  await withWorkspace(async (workspace) => {
    const committer = currentCommitter();
    const source = path.join(workspace, "source");
    const destination = path.join(workspace, "destination");
    await mkdir(source);
    await mkdir(destination);

    const staleParentIdentity = identity(await lstat(source, { bigint: true }));
    await rename(source, path.join(workspace, "source-old"));
    await mkdir(source);
    assert.deepEqual(
      await committer.commit(
        {
          kind: "create_directory",
          parentIdentity: staleParentIdentity,
          relativePath: "source/created",
          root: workspace,
        },
        cancellation,
      ),
      { ok: false, error: { kind: "conflict" } },
    );

    const sourceFile = path.join(source, "file.txt");
    const destinationFile = path.join(destination, "file.txt");
    await writeFile(sourceFile, "source", { encoding: "utf8", flag: "wx" });
    await writeFile(destinationFile, "destination", {
      encoding: "utf8",
      flag: "wx",
    });
    const destinationConflict = await committer.commit(
      {
        destinationParentIdentity: identity(
          await lstat(destination, { bigint: true }),
        ),
        destinationPath: "destination/file.txt",
        entryKind: "file",
        identity: identity(await lstat(sourceFile, { bigint: true })),
        kind: "move",
        relativePath: "source/file.txt",
        root: workspace,
        sourceParentIdentity: identity(await lstat(source, { bigint: true })),
      },
      cancellation,
    );
    assert.deepEqual(
      destinationConflict,
      platform === "linux"
        ? { ok: false, error: { kind: "unsupported" } }
        : { ok: false, error: { kind: "conflict" } },
    );
    assert.equal(await readFile(sourceFile, { encoding: "utf8" }), "source");
    assert.equal(
      await readFile(destinationFile, { encoding: "utf8" }),
      "destination",
    );

    const nonempty = path.join(workspace, "nonempty");
    await mkdir(nonempty);
    await writeFile(path.join(nonempty, "child.txt"), "child", {
      encoding: "utf8",
      flag: "wx",
    });
    const nonemptyRemoval = await committer.commit(
      {
        entryKind: "directory",
        identity: identity(await lstat(nonempty, { bigint: true })),
        kind: "remove",
        parentIdentity: identity(await lstat(workspace, { bigint: true })),
        relativePath: "nonempty",
        root: workspace,
      },
      cancellation,
    );
    assert.deepEqual(
      nonemptyRemoval,
      platform === "linux"
        ? { ok: false, error: { kind: "unsupported" } }
        : { ok: false, error: { kind: "conflict" } },
    );
    assert.equal(
      await readFile(path.join(nonempty, "child.txt"), { encoding: "utf8" }),
      "child",
    );
  });
});

test("rejects unsupported namespace targets and pre-requested cancellation", async () => {
  assert.deepEqual(
    PlatformWorkspaceNamespaceCommitter.create("darwin", "x64"),
    { ok: false, error: { kind: "unsupportedPlatform" } },
  );
  const result = await currentCommitter().commit(
    {
      kind: "create_directory",
      parentIdentity: Object.freeze({ device: 1n, inode: 2n }),
      relativePath: "directory",
      root: path.resolve("workspace"),
    },
    Object.freeze({
      requested: true,
      whenRequested: async () => undefined,
    }),
  );
  assert.deepEqual(result, { ok: false, error: { kind: "cancelled" } });
});
