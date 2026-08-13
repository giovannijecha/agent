import assert from "node:assert/strict";
import test from "node:test";

import {
  InputArea,
  LineEditor,
  Viewport,
  type KeyEvent,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

test("measures and renders a bounded multiline editor projection", () => {
  const editor = new LineEditor();
  const paste: KeyEvent = Object.freeze({
    kind: "paste",
    text: "first line\nsecond line",
  });
  editor.apply(paste);
  const created = InputArea.create(editor, { maximumRows: 6, textTone: "plain" });
  assert.ok(created.ok);

  const measured = created.value.measure(10);
  const rendered = created.value.render(viewport(10, 3));

  assert.ok(measured.ok);
  assert.equal(measured.value.preferredRows, 3);
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "first line",
    "second",
    "line",
  ]);
  assert.deepEqual(rendered.value.caret, { row: 2, column: 4 });
});

test("contains malformed and throwing projection sources", () => {
  const malformed = InputArea.create(
    {
      projectArea: () => ({
        rows: ["too wide"],
        selections: [{ end: 0, start: 0 }],
        caretRow: 0,
        caretColumn: 8,
      }),
    },
    { maximumRows: 2, textTone: "plain" },
  );
  const throwing = InputArea.create(
    {
      projectArea: (): never => {
        throw new Error("private projection cause");
      },
    },
    { maximumRows: 2, textTone: "plain" },
  );
  assert.ok(malformed.ok);
  assert.ok(throwing.ok);

  assert.equal(malformed.value.render(viewport(4, 1)).ok, false);
  assert.equal(throwing.value.measure(4).ok, false);
  assert.equal(
    InputArea.create(new LineEditor(), {
      maximumRows: 2,
      textTone: "plain",
      trailingStatus: Object.freeze({ text: "unsafe\nstatus", tone: "muted" }),
    }).ok,
    false,
  );
  assert.equal(
    InputArea.create(new LineEditor(), {
      maximumRows: 2,
      textTone: "plain",
      trailingStatus: Object.freeze({ text: "x".repeat(33), tone: "muted" }),
    }).ok,
    false,
  );
});

test("renders editor selection as one independent closed mark", () => {
  const editor = new LineEditor();
  editor.apply(Object.freeze({ kind: "text", text: "alpha beta" }));
  editor.selectWordAt(12, 2, 0, 7);
  const created = InputArea.create(editor, {
    maximumRows: 2,
    textTone: "plain",
  });
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(12, 1));
  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => ({
      mark: span.mark,
      text: span.text,
    })),
    [
      { mark: "none", text: "alpha " },
      { mark: "selected", text: "beta" },
    ],
  );
});

test("paints a trailing status without changing editor geometry", () => {
  const editor = new LineEditor();
  editor.apply(Object.freeze({ kind: "text", text: "draft" }));
  const plain = InputArea.create(editor, {
    maximumRows: 2,
    textTone: "plain",
  });
  const status = InputArea.create(editor, {
    maximumRows: 2,
    textTone: "plain",
    trailingStatus: Object.freeze({ text: "Copied!", tone: "muted" }),
  });
  assert.ok(plain.ok);
  assert.ok(status.ok);

  const plainMeasurement = plain.value.measure(20);
  const statusMeasurement = status.value.measure(20);
  const plainRender = plain.value.render(viewport(20, 1));
  const statusRender = status.value.render(viewport(20, 1));
  assert.ok(plainMeasurement.ok);
  assert.ok(statusMeasurement.ok);
  assert.ok(plainRender.ok);
  assert.ok(statusRender.ok);

  assert.deepEqual(statusMeasurement.value, plainMeasurement.value);
  assert.deepEqual(statusRender.value.caret, plainRender.value.caret);
  assert.equal(statusRender.value.rows.at(0)?.text, "draft        Copied!");
  assert.equal(statusRender.value.rows.at(0)?.cellWidth, 20);
  assert.equal(
    statusRender.value.rows.at(0)?.spans.at(-1)?.tone,
    "muted",
  );
});

test("collapses a trailing status when it cannot fit after the draft", () => {
  const editor = new LineEditor();
  editor.apply(Object.freeze({ kind: "text", text: "123456789" }));
  const created = InputArea.create(editor, {
    maximumRows: 2,
    textTone: "plain",
    trailingStatus: Object.freeze({ text: "Copied!", tone: "muted" }),
  });
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(10, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "123456789");
  assert.deepEqual(rendered.value.caret, { row: 0, column: 9 });
});
