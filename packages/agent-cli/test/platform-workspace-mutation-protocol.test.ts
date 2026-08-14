import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  decodePlatformWorkspaceMutationResponse,
  encodePlatformWorkspaceMutation,
  PLATFORM_WORKSPACE_MUTATION_LIMITS,
} from "../dist/platform-workspace-mutation-protocol.js";

const identity = Object.freeze({ device: 23n, inode: 41n });

function response(status: number): Uint8Array {
  return Uint8Array.from([
    0x41, 0x47, 0x4d, 0x52,
    1, status, 0, 0,
    0, 0, 0, 0,
  ]);
}

test("encodes exact bounded create and replace mutation frames", () => {
  const root = path.resolve("workspace");
  const created = encodePlatformWorkspaceMutation({
    content: "alpha\nè",
    identity,
    kind: "create",
    relativePath: "src/new.txt",
    root,
  });
  assert.ok(created.ok);
  assert.deepEqual([...created.value.slice(0, 8)], [
    0x41, 0x47, 0x4d, 0x43, 1, 1, 0, 0,
  ]);
  const createView = new DataView(
    created.value.buffer,
    created.value.byteOffset,
    created.value.byteLength,
  );
  assert.equal(createView.getUint32(8, true), created.value.length - 12);
  assert.equal(createView.getBigUint64(12, true), 23n);
  assert.equal(createView.getBigUint64(20, true), 41n);
  assert.equal(createView.getUint32(36, true), 0);
  assert.equal(createView.getUint32(40, true), 8);

  const replaced = encodePlatformWorkspaceMutation({
    expectedContent: "old",
    identity: Object.freeze({
      device: (1n << 64n) - 1n,
      inode: 0n,
    }),
    kind: "replace",
    relativePath: "src/existing.txt",
    replacement: "new",
    root,
  });
  assert.ok(replaced.ok);
  assert.equal(replaced.value.at(5), 2);
  const replaceView = new DataView(
    replaced.value.buffer,
    replaced.value.byteOffset,
    replaced.value.byteLength,
  );
  assert.equal(replaceView.getBigUint64(12, true), (1n << 64n) - 1n);
  assert.equal(replaceView.getBigUint64(20, true), 0n);
  assert.equal(replaceView.getUint32(36, true), 3);
  assert.equal(replaceView.getUint32(40, true), 3);
});

test("rejects invalid mutation requests, text, identities, and bounds", () => {
  const root = path.resolve("workspace");
  const valid = {
    content: "content",
    identity,
    kind: "create" as const,
    relativePath: "file.txt",
    root,
  };
  for (const request of [
    null,
    Object.freeze({ ...valid, root: "relative" }),
    Object.freeze({ ...valid, relativePath: "/absolute" }),
    Object.freeze({ ...valid, relativePath: "parent/../file" }),
    Object.freeze({ ...valid, relativePath: "double//file" }),
    Object.freeze({ ...valid, relativePath: "control\nfile" }),
    Object.freeze({ ...valid, content: "nul\u0000text" }),
    Object.freeze({ ...valid, content: "unpaired\ud800" }),
    Object.freeze({ ...valid, identity: { device: -1n, inode: 1n } }),
    Object.freeze({ ...valid, identity: { device: 1n << 64n, inode: 1n } }),
  ]) {
    assert.equal(encodePlatformWorkspaceMutation(request).ok, false);
  }

  const oversizedPath = encodePlatformWorkspaceMutation({
    ...valid,
    relativePath: "x".repeat(
      PLATFORM_WORKSPACE_MUTATION_LIMITS.pathUtf8Bytes + 1,
    ),
  });
  assert.deepEqual(oversizedPath, { ok: false, error: { kind: "limit" } });
  const oversizedContent = encodePlatformWorkspaceMutation({
    ...valid,
    content: "x".repeat(
      PLATFORM_WORKSPACE_MUTATION_LIMITS.contentUtf8Bytes + 1,
    ),
  });
  assert.deepEqual(oversizedContent, {
    ok: false,
    error: { kind: "limit" },
  });
});

test("decodes only fixed content-free native settlements", () => {
  assert.deepEqual(decodePlatformWorkspaceMutationResponse(response(1)), {
    ok: true,
    value: { kind: "success", result: "created" },
  });
  assert.deepEqual(decodePlatformWorkspaceMutationResponse(response(2)), {
    ok: true,
    value: { kind: "success", result: "replaced" },
  });
  for (const [status, error] of [
    [3, "conflict"],
    [4, "permission"],
    [5, "unsupported"],
    [6, "limit"],
    [7, "io"],
  ] as const) {
    assert.deepEqual(decodePlatformWorkspaceMutationResponse(response(status)), {
      ok: true,
      value: { kind: "failure", error },
    });
  }
  for (const frame of [
    response(0),
    response(8),
    response(1).slice(0, 11),
    Uint8Array.from([...response(1), 0]),
    Uint8Array.from([0, ...response(1).slice(1)]),
    Uint8Array.from([...response(1).slice(0, 8), 1, 0, 0, 0]),
  ]) {
    assert.deepEqual(decodePlatformWorkspaceMutationResponse(frame), {
      ok: false,
      error: { kind: "invalidFrame" },
    });
  }
});
