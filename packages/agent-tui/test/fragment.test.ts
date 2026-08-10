import assert from "node:assert/strict";
import test from "node:test";

import { Fragment, RichRow, TextSpan, TUI_LIMITS, Viewport } from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function row(text: string, tone: "accent" | "muted" | "plain" = "plain") {
  const result = RichRow.fromText(text, tone);
  assert.ok(result.ok);
  return result.value;
}

test("creates immutable exact structured rows with a local caret", () => {
  const accent = TextSpan.create("agent", "accent");
  const muted = TextSpan.create(" ready", "muted");
  assert.ok(accent.ok);
  assert.ok(muted.ok);
  const mixed = RichRow.create([accent.value, muted.value]);
  assert.ok(mixed.ok);
  const result = Fragment.create(
    viewport(12, 2),
    [mixed.value, row("ready", "muted")],
    { row: 1, column: 5 },
  );

  assert.ok(result.ok);
  assert.deepEqual(result.value.rows.map((item) => item.text), [
    "agent ready",
    "ready",
  ]);
  assert.deepEqual(result.value.rows.at(0)?.spans.map((item) => item.tone), [
    "accent",
    "muted",
  ]);
  assert.deepEqual(result.value.caret, { row: 1, column: 5 });
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.rows));
  assert.ok(Object.isFrozen(result.value.caret));
});

test("rejects row, width, hostile value, and caret contract violations", () => {
  const size = viewport(4, 1);
  const rowMismatch = Fragment.create(size, []);
  const tooWide = Fragment.create(size, [row("abcde")]);
  const hostile = Fragment.create(size, [new Proxy(row("abc"), {})]);
  const caret = Fragment.create(size, [row("abc")], { row: 0, column: 4 });

  assert.equal(rowMismatch.ok, false);
  assert.equal(tooWide.ok, false);
  assert.equal(hostile.ok, false);
  assert.equal(caret.ok, false);
  if (!rowMismatch.ok) assert.equal(rowMismatch.error.kind, "rowMismatch");
  if (!tooWide.ok) assert.equal(tooWide.error.kind, "lineTooWide");
  if (!hostile.ok) assert.equal(hostile.error.kind, "invalidRow");
  if (!caret.ok) assert.equal(caret.error.kind, "invalidCaret");
});

test("fails outside component safety geometry", () => {
  const tooWide = Fragment.create(
    viewport(TUI_LIMITS.componentColumns + 1, 1),
    [RichRow.empty()],
  );
  const tooTall = Fragment.create(
    viewport(1, TUI_LIMITS.frameRows + 1),
    [],
  );

  assert.equal(tooWide.ok, false);
  assert.equal(tooTall.ok, false);
  if (!tooWide.ok) assert.equal(tooWide.error.kind, "invalidGeometry");
  if (!tooTall.ok) assert.equal(tooTall.error.kind, "invalidGeometry");
});

test("contains a proxied viewport behind a typed geometry failure", () => {
  const hostile = new Proxy(viewport(4, 1), {});

  const result = Fragment.create(hostile, [row("safe")]);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalidGeometry");
});
