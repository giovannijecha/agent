import assert from "node:assert/strict";
import test from "node:test";

import {
  HorizontalRules,
  InputLine,
  type InputProjectionSource,
  TextBlock,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

function inputLine(): InputLine {
  const source: InputProjectionSource = Object.freeze({
    project(): Readonly<{ caretColumn: number; text: string }> {
      return Object.freeze({ caretColumn: 2, text: "go" });
    },
  });
  const input = InputLine.create("", source, {
    prefixTone: "plain",
    textTone: "plain",
  });
  assert.ok(input.ok);
  return input.value;
}

test("frames transparent input with full-width semantic rules", () => {
  const rules = HorizontalRules.create(inputLine(), {
    horizontalPadding: 1,
    ruleRows: 1,
    tone: "accent",
  });
  assert.ok(rules.ok);

  assert.deepEqual(rules.value.measure(8), {
    ok: true,
    value: { preferredRows: 3 },
  });
  const rendered = rules.value.render(viewport(8, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "────────",
    " go     ",
    "────────",
  ]);
  assert.deepEqual(rendered.value.caret, { column: 3, row: 1 });
  assert.equal(
    rendered.value.rows.at(0)?.spans.every(
      (span) => span.tone === "accent" && span.surface === "none",
    ),
    true,
  );
  assert.equal(
    rendered.value.rows.at(1)?.spans.every(
      (span) => span.surface === "none",
    ),
    true,
  );
});

test("collapses optional rules before constrained input content", () => {
  const rules = HorizontalRules.create(inputLine(), {
    horizontalPadding: 1,
    ruleRows: 1,
    tone: "accent",
  });
  assert.ok(rules.ok);

  const rendered = rules.value.render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [" go     "]);
  assert.deepEqual(rendered.value.caret, { column: 3, row: 0 });
  assert.equal(rendered.value.rows.at(0)?.text.includes("─"), false);
});

test("rejects malformed horizontal-rule components and options", () => {
  const text = TextBlock.create("content", "head", "plain");
  assert.ok(text.ok);

  const invalidComponent = HorizontalRules.create(undefined as never, {
    horizontalPadding: 1,
    ruleRows: 1,
    tone: "accent",
  });
  const invalidStyle = HorizontalRules.create(text.value, {
    horizontalPadding: 1,
    ruleRows: 2,
    tone: "accent",
  } as never);

  assert.equal(invalidComponent.ok, false);
  assert.equal(invalidStyle.ok, false);
  if (!invalidComponent.ok) {
    assert.equal(invalidComponent.error.kind, "invalidComponent");
  }
  if (!invalidStyle.ok) {
    assert.equal(invalidStyle.error.kind, "invalidStyle");
  }
});
