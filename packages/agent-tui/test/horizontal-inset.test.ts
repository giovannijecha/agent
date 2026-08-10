import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  HorizontalInset,
  InputLine,
  type InputProjectionSource,
  Viewport,
} from "@agent/tui";

const source: InputProjectionSource = Object.freeze({
  project(columns: number) {
    const text = "go".slice(0, Math.max(0, columns - 1));
    return Object.freeze({ caretColumn: text.length, text });
  },
});

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

test("centers a bounded child and translates its caret", () => {
  const input = InputLine.create("> ", source, "accent");
  assert.ok(input.ok);
  const inset = HorizontalInset.create(input.value, {
    maximumColumns: 8,
    minimumMargin: 1,
  });
  assert.ok(inset.ok);

  const rendered = inset.value.render(viewport(12, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "  > go");
  assert.deepEqual(rendered.value.caret, { row: 0, column: 6 });
});

test("degrades to the full child width when margins cannot fit", () => {
  const input = InputLine.create("> ", source, "accent");
  assert.ok(input.ok);
  const inset = HorizontalInset.create(input.value, {
    maximumColumns: 8,
    minimumMargin: 1,
  });
  assert.ok(inset.ok);

  const rendered = inset.value.render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "");
  assert.deepEqual(rendered.value.caret, { row: 0, column: 0 });
});

test("rejects invalid width and margin metadata", () => {
  const input = InputLine.create("> ", source, "accent");
  assert.ok(input.ok);

  assert.equal(
    HorizontalInset.create(input.value, {
      maximumColumns: 0,
      minimumMargin: 1,
    }).ok,
    false,
  );
  assert.equal(
    HorizontalInset.create(input.value, {
      maximumColumns: 8,
      minimumMargin: 2 as 1,
    }).ok,
    false,
  );
});

test("contains hostile child boundaries without retaining their causes", () => {
  const hostile: Component = Object.freeze({
    measure(): never {
      throw new Error("private measurement cause");
    },
    render(): never {
      throw new Error("private render cause");
    },
  });
  const inset = HorizontalInset.create(hostile, {
    maximumColumns: 8,
    minimumMargin: 1,
  });
  assert.ok(inset.ok);

  const measured = inset.value.measure(12);
  const rendered = inset.value.render(viewport(12, 1));

  assert.equal(measured.ok, false);
  assert.equal(rendered.ok, false);
  if (!measured.ok) assert.equal(measured.error.kind, "unexpectedComponent");
  if (!rendered.ok) assert.equal(rendered.error.kind, "unexpectedComponent");
  assert.equal(JSON.stringify([measured, rendered]).includes("private"), false);
});
