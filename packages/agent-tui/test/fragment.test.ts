import assert from "node:assert/strict";
import test from "node:test";

import { Fragment, TUI_LIMITS, Viewport } from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

test("creates immutable exact-row fragments with a local caret", () => {
  const result = Fragment.create(
    viewport(8, 2),
    ["agent", "ready"],
    { row: 1, column: 5 },
    ["accent", "muted"],
  );

  assert.ok(result.ok);
  assert.deepEqual(result.value.lines, ["agent", "ready"]);
  assert.deepEqual(result.value.caret, { row: 1, column: 5 });
  assert.deepEqual(result.value.tones, ["accent", "muted"]);
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.lines));
  assert.ok(Object.isFrozen(result.value.caret));
  assert.ok(Object.isFrozen(result.value.tones));
});

test("rejects row, width, control, and caret contract violations", () => {
  const size = viewport(4, 1);
  const rowMismatch = Fragment.create(size, []);
  const tooWide = Fragment.create(size, ["abcde"]);
  const control = Fragment.create(size, ["a\u001Bb"]);
  const scalar = Fragment.create(size, ["a\uD800"]);
  const caret = Fragment.create(size, ["abc"], { row: 0, column: 4 });
  const tone = Fragment.create(
    size,
    ["abc"],
    undefined,
    ["loud" as never],
  );
  const toneCount = Fragment.create(size, ["abc"], undefined, []);

  assert.equal(rowMismatch.ok, false);
  assert.equal(tooWide.ok, false);
  assert.equal(control.ok, false);
  assert.equal(scalar.ok, false);
  assert.equal(caret.ok, false);
  assert.equal(tone.ok, false);
  assert.equal(toneCount.ok, false);
  if (!rowMismatch.ok) assert.equal(rowMismatch.error.kind, "rowMismatch");
  if (!tooWide.ok) assert.equal(tooWide.error.kind, "lineTooWide");
  if (!control.ok) assert.equal(control.error.kind, "controlCharacter");
  if (!scalar.ok) assert.equal(scalar.error.kind, "invalidScalar");
  if (!caret.ok) assert.equal(caret.error.kind, "invalidCaret");
  if (!tone.ok) assert.equal(tone.error.kind, "invalidTone");
  if (!toneCount.ok) assert.equal(toneCount.error.kind, "invalidTone");
});

test("fails before allocations outside component safety geometry", () => {
  const tooWide = Fragment.create(
    viewport(TUI_LIMITS.componentColumns + 1, 1),
    [""],
  );
  const tooTall = Fragment.create(
    viewport(1, TUI_LIMITS.frameRows + 1),
    [],
  );
  const tooLong = Fragment.create(
    viewport(TUI_LIMITS.componentColumns, 1),
    ["x".repeat(TUI_LIMITS.frameLineCodePoints + 1)],
  );

  assert.equal(tooWide.ok, false);
  assert.equal(tooTall.ok, false);
  assert.equal(tooLong.ok, false);
  if (!tooWide.ok) assert.equal(tooWide.error.kind, "invalidGeometry");
  if (!tooTall.ok) assert.equal(tooTall.error.kind, "invalidGeometry");
  if (!tooLong.ok) assert.equal(tooLong.error.kind, "lineTooLong");
});
