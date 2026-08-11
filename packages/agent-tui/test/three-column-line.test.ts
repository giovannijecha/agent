import assert from "node:assert/strict";
import test from "node:test";

import { TextSpan, ThreeColumnLine, Viewport } from "@agent/tui";

function span(text: string, tone: "muted" | "plain" | "success"): TextSpan {
  const created = TextSpan.create(text, tone);
  assert.ok(created.ok);
  return created.value;
}

function viewport(columns: number): Viewport {
  const created = Viewport.create(columns, 1);
  assert.ok(created.ok);
  return created.value;
}

test("keeps wide left, physical center, and right anchors independent", () => {
  const line = ThreeColumnLine.create(
    [span("left", "plain")],
    [span("middle", "muted")],
    [span("right", "success")],
    { gap: 1 },
  );

  assert.ok(line.ok);
  const rendered = line.value.render(viewport(31));
  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "left        middle        right");
  assert.equal(rendered.value.rows.at(0)?.text.indexOf("middle"), 12);
  assert.equal(rendered.value.rows.at(0)?.spans.at(-1)?.tone, "success");
});

test("retains right then center before left when columns become scarce", () => {
  const line = ThreeColumnLine.create(
    [span("workspace", "plain")],
    [span("model", "muted")],
    [span("ready", "success")],
    { gap: 1 },
  );

  assert.ok(line.ok);
  const rendered = line.value.render(viewport(12));
  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, " model ready");
});

test("rejects invalid geometry without retaining caller causes", () => {
  const invalid = ThreeColumnLine.create([], [], [], { gap: -1 });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidGap");

  const hostile = Object.defineProperty({}, "gap", {
    get(): never {
      throw new Error("private cause");
    },
  });
  const rejected = ThreeColumnLine.create([], [], [], hostile as never);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.kind, "invalidGap");
});
