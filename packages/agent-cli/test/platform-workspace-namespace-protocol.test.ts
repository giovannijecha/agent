import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  decodePlatformWorkspaceNamespaceResponse,
  encodePlatformWorkspaceNamespace,
  PLATFORM_WORKSPACE_NAMESPACE_LIMITS,
} from "../dist/platform-workspace-namespace-protocol.js";

const identity = Object.freeze({ device: 23n, inode: 41n });
const parentIdentity = Object.freeze({ device: 47n, inode: 53n });
const destinationParentIdentity = Object.freeze({ device: 59n, inode: 61n });

function response(status: number): Uint8Array {
  return Uint8Array.from([
    0x41, 0x47, 0x4e, 0x52,
    1, status, 0, 0,
    0, 0, 0, 0,
  ]);
}

test("encodes exact create, move, and remove namespace frames", () => {
  const root = path.resolve("workspace");
  const created = encodePlatformWorkspaceNamespace({
    kind: "create_directory",
    parentIdentity,
    relativePath: "src/new",
    root,
  });
  assert.ok(created.ok);
  assert.deepEqual([...created.value.slice(0, 8)], [
    0x41, 0x47, 0x4e, 0x43, 1, 1, 0, 0,
  ]);
  const createView = new DataView(
    created.value.buffer,
    created.value.byteOffset,
    created.value.byteLength,
  );
  assert.equal(createView.getUint32(8, true), created.value.length - 12);
  assert.equal(createView.getBigUint64(12, true), 0n);
  assert.equal(createView.getBigUint64(28, true), 47n);
  assert.equal(createView.getBigUint64(36, true), 53n);
  assert.equal(createView.getUint32(68, true), 0);

  const moved = encodePlatformWorkspaceNamespace({
    destinationParentIdentity,
    destinationPath: "archive/item.txt",
    entryKind: "file",
    identity,
    kind: "move",
    relativePath: "src/item.txt",
    root,
    sourceParentIdentity: parentIdentity,
  });
  assert.ok(moved.ok);
  assert.deepEqual([...moved.value.slice(4, 8)], [1, 2, 1, 0]);
  const moveView = new DataView(
    moved.value.buffer,
    moved.value.byteOffset,
    moved.value.byteLength,
  );
  assert.equal(moveView.getBigUint64(12, true), 23n);
  assert.equal(moveView.getBigUint64(20, true), 41n);
  assert.equal(moveView.getBigUint64(44, true), 59n);
  assert.equal(moveView.getBigUint64(52, true), 61n);
  assert.equal(moveView.getUint32(68, true), 16);

  const removed = encodePlatformWorkspaceNamespace({
    entryKind: "directory",
    identity,
    kind: "remove",
    parentIdentity,
    relativePath: "empty",
    root,
  });
  assert.ok(removed.ok);
  assert.deepEqual([...removed.value.slice(4, 8)], [1, 3, 2, 0]);
});

test("rejects invalid namespace requests, identities, text, and bounds", () => {
  const root = path.resolve("workspace");
  const valid = {
    kind: "create_directory" as const,
    parentIdentity,
    relativePath: "directory",
    root,
  };
  for (const request of [
    null,
    Object.freeze({ ...valid, root: "relative" }),
    Object.freeze({ ...valid, relativePath: "/absolute" }),
    Object.freeze({ ...valid, relativePath: "parent/../directory" }),
    Object.freeze({ ...valid, relativePath: "double//directory" }),
    Object.freeze({ ...valid, relativePath: "control\ndirectory" }),
    Object.freeze({ ...valid, relativePath: "unpaired\ud800" }),
    Object.freeze({ ...valid, parentIdentity: { device: -1n, inode: 1n } }),
    Object.freeze({ ...valid, parentIdentity: { device: 1n << 64n, inode: 1n } }),
    Object.freeze({
      entryKind: "other",
      identity,
      kind: "remove",
      parentIdentity,
      relativePath: "entry",
      root,
    }),
    Object.freeze({
      destinationParentIdentity,
      destinationPath: "",
      entryKind: "file",
      identity,
      kind: "move",
      relativePath: "entry",
      root,
      sourceParentIdentity: parentIdentity,
    }),
  ]) {
    assert.equal(encodePlatformWorkspaceNamespace(request).ok, false);
  }

  assert.deepEqual(
    encodePlatformWorkspaceNamespace({
      ...valid,
      relativePath: "x".repeat(
        PLATFORM_WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes + 1,
      ),
    }),
    { ok: false, error: { kind: "limit" } },
  );
});

test("decodes only fixed content-free namespace settlements", () => {
  for (const [status, result] of [
    [1, "directory_created"],
    [2, "moved"],
    [3, "removed"],
  ] as const) {
    assert.deepEqual(decodePlatformWorkspaceNamespaceResponse(response(status)), {
      ok: true,
      value: { kind: "success", result },
    });
  }
  for (const [status, error] of [
    [4, "conflict"],
    [5, "permission"],
    [6, "unsupported"],
    [7, "limit"],
    [8, "io"],
  ] as const) {
    assert.deepEqual(decodePlatformWorkspaceNamespaceResponse(response(status)), {
      ok: true,
      value: { kind: "failure", error },
    });
  }
  for (const frame of [
    response(0),
    response(9),
    response(1).slice(0, 11),
    Uint8Array.from([...response(1), 0]),
    Uint8Array.from([0, ...response(1).slice(1)]),
    Uint8Array.from([...response(1).slice(0, 8), 1, 0, 0, 0]),
  ]) {
    assert.deepEqual(decodePlatformWorkspaceNamespaceResponse(frame), {
      ok: false,
      error: { kind: "invalidFrame" },
    });
  }
});
