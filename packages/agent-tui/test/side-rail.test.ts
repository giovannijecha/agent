import assert from "node:assert/strict";
import test from "node:test";

import {
  type Component,
  InputLine,
  type InputProjectionSource,
  SideRail,
  TextBlock,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

test("adds one open structural rail without changing row count", () => {
  const text = TextBlock.create("one two", "head", "plain");
  assert.ok(text.ok);
  const rail = SideRail.create(text.value, {
    horizontalPadding: 1,
    railTone: "muted",
  });
  assert.ok(rail.ok);

  assert.deepEqual(rail.value.measure(7), {
    ok: true,
    value: { preferredRows: 2 },
  });
  const rendered = rail.value.render(viewport(7, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "\u2502 one",
    "\u2502 two",
  ]);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => span.tone),
    ["muted", "plain"],
  );
});

test("delegates completely when the rail cannot fit", () => {
  const text = TextBlock.create("a", "head", "plain");
  assert.ok(text.ok);
  const rail = SideRail.create(text.value, {
    horizontalPadding: 1,
    railTone: "muted",
  });
  assert.ok(rail.ok);

  const rendered = rail.value.render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "a");
});

test("translates one child caret through the structural rail", () => {
  const source: InputProjectionSource = Object.freeze({
    project(columns: number) {
      const text = "go".slice(0, Math.max(0, columns - 1));
      return Object.freeze({ caretColumn: text.length, text });
    },
  });
  const input = InputLine.create("> ", source, "accent");
  assert.ok(input.ok);
  const rail = SideRail.create(input.value, {
    horizontalPadding: 1,
    railTone: "muted",
  });
  assert.ok(rail.ok);

  const rendered = rail.value.render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "│ > go");
  assert.deepEqual(rendered.value.caret, { row: 0, column: 6 });
});

test("contains hostile children and rejects invalid rail metadata", () => {
  const hostile: Component = Object.freeze({
    measure(): never {
      throw new Error("private measurement cause");
    },
    render(): never {
      throw new Error("private render cause");
    },
  });
  const rail = SideRail.create(hostile, {
    horizontalPadding: 1,
    railTone: "muted",
  });
  assert.ok(rail.ok);
  const measured = rail.value.measure(8);
  const rendered = rail.value.render(viewport(8, 1));
  const text = TextBlock.create("safe", "head", "plain");
  assert.ok(text.ok);
  const invalidPadding = SideRail.create(text.value, {
    horizontalPadding: 2 as 1,
    railTone: "muted",
  });
  const invalidTone = SideRail.create(text.value, {
    horizontalPadding: 0,
    railTone: "private" as "muted",
  });

  assert.equal(measured.ok, false);
  assert.equal(rendered.ok, false);
  assert.equal(invalidPadding.ok, false);
  assert.equal(invalidTone.ok, false);
  if (!measured.ok) assert.equal(measured.error.kind, "unexpectedComponent");
  if (!rendered.ok) assert.equal(rendered.error.kind, "unexpectedComponent");
  assert.equal(JSON.stringify([measured, rendered]).includes("private"), false);
});
