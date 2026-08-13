import assert from "node:assert/strict";
import test from "node:test";

import { TextBlock, TUI_LIMITS, type TextAnchor, Viewport } from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function block(text: string, anchor: TextAnchor): TextBlock {
  const result = TextBlock.create(text, anchor);
  assert.ok(result.ok);
  return result.value;
}

test("normalizes line endings, tabs, controls, and lone surrogates", () => {
  const smile = String.fromCodePoint(0x1f642);
  const component = block(
    "a\r\nb\rc\nd\t\u001B\uD800" + smile,
    "head",
  );
  const measured = component.measure(8);
  const rendered = component.render(viewport(8, 4));

  assert.ok(measured.ok);
  assert.equal(measured.value.preferredRows, 4);
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "a",
    "b",
    "c",
    "d   ??" + smile,
  ]);
});

test("wraps prose at word boundaries with a cell fallback for long words", () => {
  const smile = String.fromCodePoint(0x1f642);
  const prose = block("alpha perfume remains", "head").render(
    viewport(10, 3),
  );
  const exact = block("alpha beta", "head").render(viewport(5, 2));
  const latinExact = block("ciao è", "head").render(viewport(6, 2));
  const wrapped = block("abcdef", "head").render(viewport(3, 2));
  const narrow = block(smile, "head").render(viewport(1, 1));

  assert.ok(prose.ok);
  assert.deepEqual(prose.value.rows.map((row) => row.text), [
    "alpha",
    "perfume",
    "remains",
  ]);
  assert.ok(exact.ok);
  assert.deepEqual(exact.value.rows.map((row) => row.text), ["alpha", "beta"]);
  assert.ok(latinExact.ok);
  assert.deepEqual(latinExact.value.rows.map((row) => row.text), [
    "ciao è",
    "",
  ]);
  assert.ok(wrapped.ok);
  assert.deepEqual(wrapped.value.rows.map((row) => row.text), ["abc", "def"]);
  assert.ok(narrow.ok);
  assert.deepEqual(narrow.value.rows.map((row) => row.text), ["?"]);
});

test("anchors overflow at the head or tail and pads its assigned rows", () => {
  const head = block("one\ntwo\nthree", "head").render(viewport(8, 2));
  const tail = block("one\ntwo\nthree", "tail").render(viewport(8, 2));
  const wrappedTail = block("alpha beta gamma", "tail").render(
    viewport(5, 2),
  );
  const padded = block("one", "tail").render(viewport(8, 3));

  assert.ok(head.ok);
  assert.ok(tail.ok);
  assert.ok(wrappedTail.ok);
  assert.ok(padded.ok);
  assert.deepEqual(head.value.rows.map((row) => row.text), ["one", "two"]);
  assert.deepEqual(tail.value.rows.map((row) => row.text), ["two", "three"]);
  assert.deepEqual(wrappedTail.value.rows.map((row) => row.text), [
    "beta",
    "gamma",
  ]);
  assert.deepEqual(padded.value.rows.map((row) => row.text), ["", "", "one"]);
});

test("rejects invalid creation and display bounds without retaining text", () => {
  const oversized = TextBlock.create(
    "x".repeat(TUI_LIMITS.displayTextCodeUnits + 1),
    "head",
  );
  const invalidAnchor = TextBlock.create(
    "private",
    "middle" as TextAnchor,
  );

  assert.equal(oversized.ok, false);
  assert.equal(invalidAnchor.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.error.kind, "textTooLong");
    assert.equal("text" in oversized.error, false);
  }
  if (!invalidAnchor.ok) {
    assert.equal(invalidAnchor.error.kind, "invalidAnchor");
  }
});

test("clips excessive normalized rows deterministically by anchor", () => {
  const source = Array.from(
    { length: TUI_LIMITS.frameRows + 2 },
    (_value, index) => String(index),
  ).join("\n");
  const head = block(source, "head").render(viewport(16, 2));
  const tail = block(source, "tail").render(viewport(16, 2));

  assert.ok(head.ok);
  assert.deepEqual(head.value.rows.map((row) => row.text), ["0", "1"]);
  assert.ok(tail.ok);
  assert.deepEqual(tail.value.rows.map((row) => row.text), ["4096", "4097"]);
});

test("applies one validated semantic tone to every assigned row", () => {
  const created = TextBlock.create("agent", "head", "accent");
  const invalid = TextBlock.create("agent", "head", "loud" as never);

  assert.ok(created.ok);
  const rendered = created.value.render(viewport(8, 2));
  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.map((row) => row.spans.at(0)?.tone),
    ["accent", undefined],
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidTone");
});
