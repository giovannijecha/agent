import assert from "node:assert/strict";
import test from "node:test";

import {
  InputLine,
  type InputProjectionSource,
  LineEditor,
  TUI_LIMITS,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function input(prefix: string, source: InputProjectionSource): InputLine {
  const result = InputLine.create(prefix, source);
  assert.ok(result.ok);
  return result.value;
}

test("projects an editor onto the final assigned row with a visible caret", () => {
  const editor = new LineEditor();
  editor.apply(Object.freeze({ kind: "text", text: "abc" }));
  const rendered = input("> ", editor).render(viewport(6, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["", "> abc"]);
  assert.deepEqual(rendered.value.caret, { row: 1, column: 5 });
});

test("applies independent validated prefix and draft tones", () => {
  const editor = new LineEditor();
  editor.apply(Object.freeze({ kind: "text", text: "draft" }));
  const created = InputLine.create("> ", editor, {
    prefixTone: "accent",
    textTone: "plain",
  });
  const invalid = InputLine.create("> ", new LineEditor(), {
    prefixTone: "loud" as never,
    textTone: "plain",
  });

  assert.ok(created.ok);
  const rendered = created.value.render(viewport(8, 2));
  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.at(1)?.spans.map((span) => ({
      text: span.text,
      tone: span.tone,
    })),
    [
      { text: "> ", tone: "accent" },
      { text: "draft", tone: "plain" },
    ],
  );
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidTone");
});

test("reserves the only column for an empty prompt caret", () => {
  const rendered = input("> ", new LineEditor()).render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [""]);
  assert.deepEqual(rendered.value.caret, { row: 0, column: 0 });
});

test("rejects invalid prefixes and projection sources", () => {
  const control = InputLine.create("\u001B", new LineEditor());
  const long = InputLine.create(
    "x".repeat(TUI_LIMITS.frameLineCodePoints + 1),
    new LineEditor(),
  );
  const scalar = InputLine.create("\uD800", new LineEditor());
  const missing = InputLine.create("", null as unknown as InputProjectionSource);
  const throwingGetter = Object.create(null) as InputProjectionSource;
  Object.defineProperty(throwingGetter, "project", {
    get(): never {
      throw new Error("private source getter cause");
    },
  });
  const getter = InputLine.create("", throwingGetter);

  assert.equal(control.ok, false);
  assert.equal(long.ok, false);
  assert.equal(scalar.ok, false);
  assert.equal(missing.ok, false);
  assert.equal(getter.ok, false);
  if (!control.ok) assert.equal(control.error.kind, "invalidPrefix");
  if (!long.ok) assert.equal(long.error.kind, "invalidPrefix");
  if (!scalar.ok) assert.equal(scalar.error.kind, "invalidPrefix");
  if (!missing.ok) assert.equal(missing.error.kind, "invalidSource");
  if (!getter.ok) {
    assert.equal(getter.error.kind, "invalidSource");
    assert.equal("cause" in getter.error, false);
  }
});

test("contains thrown and malformed projection callbacks", () => {
  const thrown = input("", {
    project(): never {
      throw new Error("private callback cause");
    },
  }).render(viewport(8, 1));
  const malformed = input("", {
    project(): never {
      return undefined as never;
    },
  }).render(viewport(8, 1));
  const throwingGetter = input("", {
    project: () => {
      const projection = Object.create(null) as Readonly<{
        caretColumn: number;
        text: string;
      }>;
      Object.defineProperty(projection, "text", {
        get(): never {
          throw new Error("private projection getter cause");
        },
      });
      Object.defineProperty(projection, "caretColumn", { value: 0 });
      return projection;
    },
  }).render(viewport(8, 1));

  assert.equal(thrown.ok, false);
  assert.equal(malformed.ok, false);
  assert.equal(throwingGetter.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.error.kind, "unexpectedProjection");
    assert.equal("cause" in thrown.error, false);
  }
  if (!malformed.ok) assert.equal(malformed.error.kind, "invalidProjection");
  if (!throwingGetter.ok) {
    assert.equal(throwingGetter.error.kind, "unexpectedProjection");
    assert.equal("cause" in throwingGetter.error, false);
  }
});

test("rejects projection content, width, and caret violations", () => {
  const control = input("", {
    project: () => Object.freeze({ text: "a\u001B", caretColumn: 1 }),
  }).render(viewport(4, 1));
  const width = input("", {
    project: () => Object.freeze({ text: "abcde", caretColumn: 0 }),
  }).render(viewport(4, 1));
  const caret = input("", {
    project: () => Object.freeze({ text: "abc", caretColumn: 4 }),
  }).render(viewport(4, 1));

  assert.equal(control.ok, false);
  assert.equal(width.ok, false);
  assert.equal(caret.ok, false);
  if (!control.ok) assert.equal(control.error.kind, "invalidProjection");
  if (!width.ok) assert.equal(width.error.kind, "invalidProjection");
  if (!caret.ok) assert.equal(caret.error.kind, "invalidProjection");
});
