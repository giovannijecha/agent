import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  type ComponentMeasurement,
  Fragment,
  InlineText,
  InputLine,
  Panel,
  type InputProjectionSource,
  type Result,
  TextSpan,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

const source: InputProjectionSource = Object.freeze({
  project(columns: number) {
    const text = "go".slice(0, Math.max(0, columns - 1));
    return Object.freeze({ caretColumn: text.length, text });
  },
});

test("renders one bordered child and translates its caret", () => {
  const input = InputLine.create("> ", source, {
    prefixTone: "accent",
    textTone: "accent",
  });
  assert.ok(input.ok);
  const panel = Panel.create(input.value, {
    borderTone: "muted",
    horizontalPadding: 1,
  });
  assert.ok(panel.ok);

  assert.deepEqual(panel.value.measure(10), {
    ok: true,
    value: { preferredRows: 3 },
  });
  const rendered = panel.value.render(viewport(10, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
    "\u2502 > go   \u2502",
    "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
  ]);
  assert.deepEqual(rendered.value.caret, { row: 1, column: 6 });
  assert.deepEqual(
    rendered.value.rows.at(1)?.spans.map((span) => span.tone),
    ["muted", "accent", "muted"],
  );
});

test("elides the complete decoration for short or narrow viewports", () => {
  const input = InputLine.create("> ", source, {
    prefixTone: "accent",
    textTone: "accent",
  });
  assert.ok(input.ok);
  const panel = Panel.create(input.value, {
    borderTone: "muted",
    horizontalPadding: 1,
  });
  assert.ok(panel.ok);

  assert.deepEqual(panel.value.measure(4), {
    ok: true,
    value: { preferredRows: 1 },
  });
  const short = panel.value.render(viewport(10, 1));
  const narrow = panel.value.render(viewport(1, 1));
  const twoRows = panel.value.render(viewport(10, 2));

  assert.ok(short.ok && narrow.ok && twoRows.ok);
  assert.deepEqual(short.value.rows.map((row) => row.text), ["> go"]);
  assert.deepEqual(short.value.caret, { row: 0, column: 4 });
  assert.deepEqual(narrow.value.rows.map((row) => row.text), [""]);
  assert.deepEqual(narrow.value.caret, { row: 0, column: 0 });
  assert.deepEqual(twoRows.value.rows.map((row) => row.text), ["", "> go"]);
  assert.deepEqual(twoRows.value.caret, { row: 1, column: 4 });
});

test("supports a zero-padding panel without flattening child tones", () => {
  const value = TextSpan.create("go", "accent");
  assert.ok(value.ok);
  const content = InlineText.create([value.value]);
  assert.ok(content.ok);
  const panel = Panel.create(content.value, {
    borderTone: "muted",
    horizontalPadding: 0,
  });
  assert.ok(panel.ok);

  const rendered = panel.value.render(viewport(8, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2510",
    "\u2502go    \u2502",
    "\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2518",
  ]);
  assert.deepEqual(
    rendered.value.rows.at(1)?.spans.map((span) => span.tone),
    ["muted", "accent", "muted"],
  );
});

class HostileComponent implements Component {
  readonly #operation: "measure" | "render";

  constructor(operation: "measure" | "render") {
    this.#operation = operation;
  }

  measure(_columns: number): Result<ComponentMeasurement, never> {
    if (this.#operation === "measure") {
      throw new Error("private measurement cause");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ preferredRows: 1 }),
    });
  }

  render(_viewport: Viewport): Result<Fragment, never> {
    throw new Error("private render cause");
  }
}

test("contains hostile child callbacks behind content-free failures", () => {
  const measurePanel = Panel.create(new HostileComponent("measure"), {
    borderTone: "muted",
    horizontalPadding: 0,
  });
  const renderPanel = Panel.create(new HostileComponent("render"), {
    borderTone: "muted",
    horizontalPadding: 0,
  });
  assert.ok(measurePanel.ok && renderPanel.ok);

  const measured = measurePanel.value.measure(8);
  const rendered = renderPanel.value.render(viewport(8, 3));

  assert.equal(measured.ok, false);
  assert.equal(rendered.ok, false);
  if (!measured.ok) {
    assert.equal(measured.error.kind, "unexpectedComponent");
  }
  if (!rendered.ok) {
    assert.equal(rendered.error.kind, "unexpectedComponent");
  }
  assert.equal(JSON.stringify([measured, rendered]).includes("private"), false);
});

test("contains hostile children and rejects invalid decoration metadata", () => {
  const hostile = Object.defineProperty({}, "measure", {
    get(): never {
      throw new Error("child getter escaped");
    },
  });
  const invalidChild = Panel.create(
    hostile as never,
    { borderTone: "muted", horizontalPadding: 0 },
  );
  const input = InputLine.create("> ", source, {
    prefixTone: "accent",
    textTone: "accent",
  });
  assert.ok(input.ok);
  const invalidPadding = Panel.create(input.value, {
    borderTone: "muted",
    horizontalPadding: 2 as 1,
  });
  const invalidTone = Panel.create(input.value, {
    borderTone: "private" as "muted",
    horizontalPadding: 0,
  });

  assert.equal(invalidChild.ok, false);
  assert.equal(invalidPadding.ok, false);
  assert.equal(invalidTone.ok, false);
  if (!invalidChild.ok) {
    assert.equal(invalidChild.error.kind, "invalidComponent");
  }
  if (!invalidPadding.ok) {
    assert.equal(invalidPadding.error.kind, "invalidPadding");
  }
  if (!invalidTone.ok) assert.equal(invalidTone.error.kind, "invalidTone");
});
