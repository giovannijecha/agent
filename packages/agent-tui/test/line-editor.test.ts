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
const wordLeft: KeyEvent = Object.freeze({ kind: "wordLeft" });
const wordRight: KeyEvent = Object.freeze({ kind: "wordRight" });
const wordBackspace: KeyEvent = Object.freeze({ kind: "wordBackspace" });
const wordDelete: KeyEvent = Object.freeze({ kind: "wordDelete" });

function text(value: string): KeyEvent {
  return Object.freeze({ kind: "text", text: value });
}

function paste(value: string): KeyEvent {
  return Object.freeze({ kind: "paste", text: value });
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

test("moves across words and whitespace on one owned cursor", () => {
  const editor = new LineEditor();
  editor.apply(paste("alpha  beta\ngamma"));

  assert.equal(editor.apply(wordLeft).kind, "changed");
  editor.apply(text("X"));
  assert.equal(editor.text, "alpha  beta\nXgamma");

  assert.equal(editor.apply(wordLeft).kind, "changed");
  assert.equal(editor.apply(wordLeft).kind, "changed");
  editor.apply(text("Y"));
  assert.equal(editor.text, "alpha  Ybeta\nXgamma");

  assert.equal(editor.apply(wordRight).kind, "changed");
  editor.apply(text("Z"));
  assert.equal(editor.text, "alpha  YbetaZ\nXgamma");
});

test("deletes words atomically across spaces and newlines", () => {
  const backward = new LineEditor();
  backward.apply(paste("alpha  beta\ngamma"));
  assert.equal(backward.apply(wordBackspace).kind, "changed");
  assert.equal(backward.text, "alpha  beta\n");
  assert.equal(backward.apply(wordBackspace).kind, "changed");
  assert.equal(backward.text, "alpha  ");

  const forward = new LineEditor();
  forward.apply(paste("alpha  beta\ngamma"));
  forward.apply(home);
  assert.equal(forward.apply(wordDelete).kind, "changed");
  assert.equal(forward.text, "  beta\ngamma");
  assert.equal(forward.apply(wordDelete).kind, "changed");
  assert.equal(forward.text, "\ngamma");

  forward.apply(end);
  assert.equal(forward.apply(wordDelete).kind, "unchanged");
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

test("replaces a bounded draft and moves the caret to its end", () => {
  const editor = new LineEditor();
  editor.apply(text("/p"));
  editor.apply(home);

  assert.equal(editor.replace("/providers").kind, "changed");
  assert.equal(editor.text, "/providers");
  assert.deepEqual(editor.project(20), {
    caretColumn: 10,
    text: "/providers",
  });
  assert.equal(editor.replace("/providers").kind, "unchanged");
});

test("rejects invalid and oversized replacement text atomically", () => {
  const editor = new LineEditor();
  editor.apply(text("safe"));

  assert.equal(editor.replace("bad\ntext").kind, "unsupported");
  assert.equal(editor.replace("x".repeat(4_097)).kind, "limit");
  assert.equal(editor.text, "safe");
});

test("inserts multiline paste atomically and submits it only on Enter", () => {
  const editor = new LineEditor();

  assert.equal(editor.apply(paste("first\nsecond\tvalue")).kind, "changed");
  assert.equal(editor.text, "first\nsecond\tvalue");
  assert.deepEqual(editor.apply(enter), {
    kind: "submitted",
    text: "first\nsecond\tvalue",
  });
});

test("rejects unsafe and oversized paste without changing the draft", () => {
  const editor = new LineEditor();
  editor.apply(text("safe"));

  assert.equal(editor.apply(paste("bad\u001Btext")).kind, "unsupported");
  assert.equal(editor.apply(paste("x".repeat(4_097))).kind, "limit");
  assert.equal(editor.text, "safe");
});

test("projects a bounded multiline area with the caret visible", () => {
  const editor = new LineEditor();
  editor.apply(paste("one two three\nfour\tfive"));

  const expanded = editor.projectArea(8, 6);
  const bounded = editor.projectArea(8, 2);

  assert.deepEqual(expanded.rows, ["one two", "three", "four", "    five", ""]);
  assert.equal(expanded.caretRow, 4);
  assert.equal(expanded.caretColumn, 0);
  assert.deepEqual(bounded.rows, ["    five", ""]);
  assert.equal(bounded.caretRow, 1);
  assert.equal(bounded.caretColumn, 0);
});

test("places the caret on the wrapped row at an exact column boundary", () => {
  const editor = new LineEditor();
  editor.apply(text("abcdeX"));
  editor.apply(left);

  const projection = editor.projectArea(5, 2);

  assert.deepEqual(projection.rows, ["abcde", "X"]);
  assert.equal(projection.caretRow, 1);
  assert.equal(projection.caretColumn, 0);
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

test("projects pasted Latin prose with its physical caret width", () => {
  const editor = new LineEditor();
  editor.apply(paste("perch\u00e9 l\u2019agent"));

  const projection = editor.project(15);

  assert.deepEqual(projection, {
    text: "perch\u00e9 l\u2019agent",
    caretColumn: 14,
  });
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
