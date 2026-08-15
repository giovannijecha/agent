import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTextPatch,
  createTextPatch,
  TEXT_PATCH_LIMITS,
} from "../dist/workspace-text-patch.js";

test("creates complete text including an empty file", () => {
  const created = createTextPatch([
    Object.freeze({ oldText: "", newText: "alpha\r\nbeta\n" }),
  ]);
  assert.ok(created.ok);
  assert.equal(created.value.replacement, "alpha\r\nbeta\n");
  assert.equal(created.value.hunkCount, 1);
  assert.equal(created.value.removedLines, 0);
  assert.equal(created.value.addedLines, 3);

  const empty = createTextPatch([
    Object.freeze({ oldText: "", newText: "" }),
  ]);
  assert.ok(empty.ok);
  assert.equal(empty.value.replacement, "");
});

test("applies ordered update hunks to one observed snapshot", () => {
  const applied = applyTextPatch("alpha\nbeta\ngamma\nomega", [
    Object.freeze({ oldText: "beta", newText: "owned" }),
    Object.freeze({ oldText: "gamma", newText: "gamma\ninserted" }),
    Object.freeze({ oldText: "omega", newText: "" }),
  ]);
  assert.ok(applied.ok);
  assert.equal(applied.value.replacement, "alpha\nowned\ngamma\ninserted\n");
  assert.equal(applied.value.hunkCount, 3);
  assert.equal(applied.value.removedLines, 3);
  assert.equal(applied.value.addedLines, 3);
});

test("rejects ambiguous, reordered, overlapping, empty, and no-op anchors", () => {
  for (const result of [
    applyTextPatch("x x", [
      Object.freeze({ oldText: "x", newText: "y" }),
    ]),
    applyTextPatch("early late", [
      Object.freeze({ oldText: "late", newText: "last" }),
      Object.freeze({ oldText: "early", newText: "first" }),
    ]),
    applyTextPatch("abcde", [
      Object.freeze({ oldText: "abc", newText: "a" }),
      Object.freeze({ oldText: "cde", newText: "e" }),
    ]),
    applyTextPatch("alpha", [
      Object.freeze({ oldText: "", newText: "prefix" }),
    ]),
    applyTextPatch("alpha", [
      Object.freeze({ oldText: "alpha", newText: "alpha" }),
    ]),
  ]) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "conflict");
    }
  }
});

test("bounds aggregate hunk input, hunk count, scalar text, and result", () => {
  const excessiveText = createTextPatch([
    Object.freeze({
      oldText: "",
      newText: "x".repeat(TEXT_PATCH_LIMITS.aggregateCodeUnits + 1),
    }),
  ]);
  assert.equal(excessiveText.ok, false);
  if (!excessiveText.ok) {
    assert.equal(excessiveText.error.kind, "limit");
  }

  const excessiveHunks = createTextPatch(
    Array.from({ length: TEXT_PATCH_LIMITS.hunks + 1 }, () =>
      Object.freeze({ oldText: "", newText: "" }),
    ),
  );
  assert.equal(excessiveHunks.ok, false);
  if (!excessiveHunks.ok) {
    assert.equal(excessiveHunks.error.kind, "limit");
  }

  const invalidScalar = createTextPatch([
    Object.freeze({ oldText: "", newText: "\ud800" }),
  ]);
  assert.equal(invalidScalar.ok, false);
  if (!invalidScalar.ok) {
    assert.equal(invalidScalar.error.kind, "unsupported");
  }

  const excessiveResult = applyTextPatch("x", [
    Object.freeze({ oldText: "x", newText: "y".repeat(262_145) }),
  ]);
  assert.equal(excessiveResult.ok, false);
  if (!excessiveResult.ok) {
    assert.equal(excessiveResult.error.kind, "limit");
  }
});
