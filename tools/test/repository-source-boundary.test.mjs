import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isIgnoredRepositorySourceDirectory,
  readBoundedRegularSourceFile,
  RepositorySourceBoundaryError,
} from "../lib/repository-source-boundary.mjs";

function expectInvalidFile(error) {
  return error instanceof RepositorySourceBoundaryError &&
    error.code === "invalidFile" &&
    error.message === "repository source invalidFile";
}

test("excludes only exact repository-root metadata, dependencies, and local state", () => {
  for (const path of [".git", "node_modules", "state"]) {
    assert.equal(isIgnoredRepositorySourceDirectory(path), true);
  }
  for (const path of [
    "evaluations",
    "packages/example/state",
    "stateful",
    "State",
    "",
    undefined,
  ]) {
    assert.equal(isIgnoredRepositorySourceDirectory(path), false);
  }
});

test("reads only bounded stable regular repository source", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agent-source-boundary-"));
  try {
    const exact = path.join(root, "exact");
    const empty = path.join(root, "empty");
    const oversized = path.join(root, "oversized");
    const directory = path.join(root, "directory");
    const linked = path.join(root, "linked");
    const nested = path.join(root, "nested");
    writeFileSync(exact, Uint8Array.of(1, 2, 3, 4));
    writeFileSync(empty, new Uint8Array());
    writeFileSync(oversized, Uint8Array.of(1, 2, 3, 4, 5));
    mkdirSync(directory);
    mkdirSync(nested);
    writeFileSync(path.join(nested, "exact"), Uint8Array.of(1, 2, 3, 4));
    symlinkSync(directory, linked, "junction");

    assert.deepEqual(
      readBoundedRegularSourceFile(root, "exact", 4),
      Uint8Array.of(1, 2, 3, 4),
    );
    assert.deepEqual(
      readBoundedRegularSourceFile(root, "nested/exact", 4),
      Uint8Array.of(1, 2, 3, 4),
    );
    for (const source of ["empty", "oversized", "directory", "linked"]) {
      assert.throws(
        () => readBoundedRegularSourceFile(root, source, 4),
        expectInvalidFile,
      );
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("rejects a regular source below a linked repository directory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agent-source-root-"));
  const external = mkdtempSync(path.join(tmpdir(), "agent-source-external-"));
  try {
    const failures = path.join(root, "evaluations", "failures");
    mkdirSync(path.dirname(failures), { recursive: true });
    writeFileSync(path.join(external, "registry.json"), Uint8Array.of(1, 2, 3, 4));
    symlinkSync(external, failures, "junction");

    assert.throws(
      () => readBoundedRegularSourceFile(
        root,
        "evaluations/failures/registry.json",
        4,
      ),
      expectInvalidFile,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
    rmSync(external, { force: true, recursive: true });
  }
});
