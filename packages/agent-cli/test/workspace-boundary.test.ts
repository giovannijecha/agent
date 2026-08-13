import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  WorkspaceBoundary,
  WorkspaceBoundaryError,
} from "../dist/workspace-boundary.js";

const protection = Object.freeze({
  homeDirectory: homedir(),
  temporaryDirectory: tmpdir(),
});

async function withContainer(
  action: (container: string) => Promise<void>,
): Promise<void> {
  const container = await mkdtemp(path.join(tmpdir(), "agent-workspace-test-"));
  try {
    await action(container);
  } finally {
    const resolvedContainer = path.resolve(container);
    const resolvedTemporary = path.resolve(tmpdir());
    assert.ok(resolvedContainer.startsWith(resolvedTemporary + path.sep));
    await rm(resolvedContainer, { force: true, recursive: true });
  }
}

test("creates one immutable canonical workspace boundary", async () => {
  await withContainer(async (container) => {
    const workspace = path.join(container, "workspace");
    await mkdir(workspace);

    const created = await WorkspaceBoundary.create(workspace, protection);

    assert.ok(created.ok);
    assert.equal(created.value.root, await realpath(workspace));
    assert.equal(Object.isFrozen(created.value), true);
  });
});

test("rejects a boundary forged through the emitted JavaScript constructor", () => {
  const RuntimeConstructor = WorkspaceBoundary as unknown as new (
    root: string,
    authority: unknown,
  ) => WorkspaceBoundary;

  let failure: unknown;
  try {
    new RuntimeConstructor(path.resolve("."), Object.freeze({}));
  } catch (cause: unknown) {
    failure = cause;
  }
  assert.equal(failure instanceof WorkspaceBoundaryError, true);
  if (failure instanceof WorkspaceBoundaryError) {
    assert.equal(failure.kind, "invalidCandidate");
    assert.equal(JSON.stringify(failure), "{}");
  }
});

test("discards a workspace symlink alias in favor of its target", async () => {
  await withContainer(async (container) => {
    const workspace = path.join(container, "workspace");
    const alias = path.join(container, "workspace-alias");
    await mkdir(workspace);
    await symlink(workspace, alias, "junction");

    const created = await WorkspaceBoundary.create(alias, protection);

    assert.ok(created.ok);
    assert.equal(created.value.root, await realpath(workspace));
    assert.equal(created.value.root.includes("workspace-alias"), false);
  });
});

test("rejects invalid, inaccessible, and non-directory candidates", async () => {
  for (const candidate of ["relative", "bad\u0000root", "bad\nroot", 42]) {
    const created = await WorkspaceBoundary.create(candidate, protection);
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.error.kind, "invalidCandidate");
    }
  }

  await withContainer(async (container) => {
    const missing = await WorkspaceBoundary.create(
      path.join(container, "missing"),
      protection,
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error.kind, "inaccessible");
    }

    const file = path.join(container, "file.txt");
    await writeFile(file, "owned", { encoding: "utf8", flag: "wx" });
    const unsupported = await WorkspaceBoundary.create(file, protection);
    assert.equal(unsupported.ok, false);
    if (!unsupported.ok) {
      assert.equal(unsupported.error.kind, "unsupported");
    }
  });
});

test("rejects volume, home, and shared temporary roots", async () => {
  for (const candidate of [path.resolve(path.sep), homedir(), tmpdir()]) {
    const created = await WorkspaceBoundary.create(candidate, protection);
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.error.kind, "unsafeRoot");
    }
  }
});

test("contains invalid protection and failure details", async () => {
  const invalidProtection = await WorkspaceBoundary.create(path.resolve("."), {
    homeDirectory: "relative",
    temporaryDirectory: tmpdir(),
  });
  assert.equal(invalidProtection.ok, false);
  if (!invalidProtection.ok) {
    assert.equal(invalidProtection.error.kind, "invalidProtection");
    assert.equal(JSON.stringify(invalidProtection.error), "{}");
    assert.equal(Object.isFrozen(invalidProtection.error), true);
    assert.equal(invalidProtection.error instanceof WorkspaceBoundaryError, true);
  }

  const hostile = new Proxy(
    {},
    {
      get: () => {
        throw new Error("foreign detail");
      },
    },
  );
  const contained = await WorkspaceBoundary.create(path.resolve("."), hostile);
  assert.equal(contained.ok, false);
  if (!contained.ok) {
    assert.equal(contained.error.kind, "invalidProtection");
  }
});
