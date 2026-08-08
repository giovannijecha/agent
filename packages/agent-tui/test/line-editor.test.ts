import assert from "node:assert/strict";
import test from "node:test";

import { LineEditor, type KeyEvent } from "@agent/tui";

const left: KeyEvent = Object.freeze({ kind: "left" });
const right: KeyEvent = Object.freeze({ kind: "right" });
const home: KeyEvent = Object.freeze({ kind: "home" });
const end: KeyEvent = Object.freeze({ kind: "end" });
const backspace: KeyEvent = Object.freeze({ kind: "backspace" });
const remove: KeyEvent = Object.freeze({ kind: "delete" });
const enter: KeyEvent = Object.freeze({ kind: "enter" });

function text(value: string): KeyEvent {
  return Object.freeze({ kind: "text", text: value });
}

test("edits text at code-point cursor boundaries", () => {
  const editor = new LineEditor();
  editor.apply(text("ab🙂c"));
  editor.apply(left);
  editor.apply(left);
  editor.apply(text("X"));

  assert.equal(editor.text, "abX🙂c");
  assert.equal(editor.length, 5);

  editor.apply(backspace);
  editor.apply(remove);
  assert.equal(editor.text, "abc");
});

test("supports home, end, and boundary no-ops", () => {
  const editor = new LineEditor();
  assert.equal(editor.apply(left).kind, "unchanged");
  editor.apply(text("abc"));
  editor.apply(home);
  assert.equal(editor.apply(left).kind, "unchanged");
  editor.apply(right);
  editor.apply(end);
  assert.equal(editor.apply(right).kind, "unchanged");
});

test("submits and clears the line without retaining it", () => {
  const editor = new LineEditor();
  editor.apply(text("private input"));

  const outcome = editor.apply(enter);

  assert.deepEqual(outcome, { kind: "submitted", text: "private input" });
  assert.equal(editor.text, "");
  assert.equal(editor.length, 0);
});

test("explicitly releases a retained draft and resets the caret", () => {
  const editor = new LineEditor();
  editor.apply(text("private draft"));
  editor.apply(left);

  assert.equal(editor.clear(), true);
  assert.equal(editor.clear(), false);
  assert.deepEqual(editor.project(20), { caretColumn: 0, text: "" });
});

test("keeps the caret visible through horizontal projection", () => {
  const editor = new LineEditor();
  editor.apply(text("abcdef"));

  const endProjection = editor.project(4);
  editor.apply(home);
  const startProjection = editor.project(4);

  assert.deepEqual(endProjection, { text: "def", caretColumn: 3 });
  assert.deepEqual(startProjection, { text: "abcd", caretColumn: 0 });
});

test("enforces the fixed input bound atomically", () => {
  const editor = new LineEditor();
  assert.equal(editor.apply(text("x".repeat(4_096))).kind, "changed");

  const limited = editor.apply(text("y"));

  assert.equal(limited.kind, "limit");
  assert.equal(editor.length, 4_096);
  assert.equal(editor.text.endsWith("y"), false);
});

test("returns explicit interrupt, EOF, and unsupported outcomes", () => {
  const editor = new LineEditor();

  assert.equal(editor.apply(Object.freeze({ kind: "interrupt" })).kind, "interrupt");
  assert.equal(editor.apply(Object.freeze({ kind: "eof" })).kind, "eof");
  assert.equal(
    editor.apply(Object.freeze({ kind: "unsupported" })).kind,
    "unsupported",
  );
});
