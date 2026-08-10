import assert from "node:assert/strict";
import test from "node:test";

import { InlineText, TextSpan, Viewport } from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function span(text: string, tone: "accent" | "muted") {
  const result = TextSpan.create(text, tone);
  assert.ok(result.ok);
  return result.value;
}

test("renders one mixed-tone line and deterministic empty padding", () => {
  const component = InlineText.create([
    span("agent", "accent"),
    span("  ready", "muted"),
  ]);
  assert.ok(component.ok);

  const measured = component.value.measure(20);
  const rendered = component.value.render(viewport(20, 2));

  assert.deepEqual(measured, { ok: true, value: { preferredRows: 1 } });
  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "agent  ready");
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((item) => item.tone),
    ["accent", "muted"],
  );
  assert.equal(rendered.value.rows.at(1)?.text, "");
});

test("clips the complete structured line across span boundaries", () => {
  const component = InlineText.create([
    span("agent", "accent"),
    span("  ready", "muted"),
  ]);
  assert.ok(component.ok);

  const rendered = component.value.render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "agent  r");
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((item) => item.tone),
    ["accent", "muted"],
  );
});

test("contains malformed span inputs", () => {
  const result = InlineText.create([new Proxy(span("agent", "accent"), {})]);

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "invalidRow");
});
