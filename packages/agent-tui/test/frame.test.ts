import assert from "node:assert/strict";
import test from "node:test";

import { Frame, FrameError } from "@agent/tui";

test("rejects every terminal control range without retaining content", () => {
  const controls = [0x00, 0x1f, 0x7f, 0x80, 0x9f];
  for (const point of controls) {
    const result = Frame.create(["before", "x" + String.fromCodePoint(point)]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error instanceof FrameError);
      assert.equal(result.error.kind, "controlCharacter");
      assert.equal(result.error.row, 1);
      assert.equal("line" in result.error, false);
    }
  }
});

test("creates one immutable frame and caret atomically", () => {
  const result = Frame.create(["agent", "ready"], { row: 1, column: 5 });

  assert.ok(result.ok);
  assert.deepEqual(result.value.lines, ["agent", "ready"]);
  assert.deepEqual(result.value.caret, { row: 1, column: 5 });
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.lines));
  assert.ok(Object.isFrozen(result.value.caret));
});

test("rejects a caret outside the frame or its line", () => {
  const missingRow = Frame.create(["agent"], { row: 1, column: 0 });
  const pastLine = Frame.create(["agent"], { row: 0, column: 6 });

  assert.equal(missingRow.ok, false);
  assert.equal(pastLine.ok, false);
  if (!missingRow.ok) {
    assert.equal(missingRow.error.kind, "invalidCaret");
  }
  if (!pastLine.ok) {
    assert.equal(pastLine.error.kind, "invalidCaret");
  }
});

test("rejects oversized frame input", () => {
  const tooManyRows = Frame.create(Array.from({ length: 4_097 }, () => "x"));
  const tooLong = Frame.create(["x".repeat(16_385)]);

  assert.equal(tooManyRows.ok, false);
  assert.equal(tooLong.ok, false);
  if (!tooManyRows.ok) {
    assert.equal(tooManyRows.error.kind, "tooManyRows");
  }
  if (!tooLong.ok) {
    assert.equal(tooLong.error.kind, "lineTooLong");
  }
});

test("rejects unmatched surrogate code units at the final frame boundary", () => {
  const result = Frame.create(["safe\uD800"]);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalidScalar");
});
