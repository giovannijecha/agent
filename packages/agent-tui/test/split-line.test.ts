import assert from "node:assert/strict";
import test from "node:test";

import { SplitLine, TextSpan, Viewport } from "@agent/tui";

function span(text: string, tone: "accent" | "muted") {
  const created = TextSpan.create(text, tone);
  assert.ok(created.ok);
  return created.value;
}

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.ok(created.ok);
  return created.value;
}

test("right-aligns the secondary group while preserving semantic spans", () => {
  const split = SplitLine.create(
    [span("agent", "accent")],
    [span("ready", "muted")],
    { gap: 2, priority: "left" },
  );
  assert.ok(split.ok);

  assert.deepEqual(split.value.measure(20), {
    ok: true,
    value: { preferredRows: 1 },
  });
  const rendered = split.value.render(viewport(20, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "agent          ready",
    "",
  ]);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((item) => item.tone),
    ["accent", "plain", "muted"],
  );
});

test("clips the secondary side according to the declared retention priority", () => {
  const leftPriority = SplitLine.create(
    [span("LEFT", "accent")],
    [span("RIGHT", "muted")],
    { gap: 2, priority: "left" },
  );
  const rightPriority = SplitLine.create(
    [span("LEFT", "accent")],
    [span("RIGHT", "muted")],
    { gap: 2, priority: "right" },
  );
  assert.ok(leftPriority.ok && rightPriority.ok);

  const left = leftPriority.value.render(viewport(7, 1));
  const right = rightPriority.value.render(viewport(7, 1));
  const leftOnly = leftPriority.value.render(viewport(3, 1));
  const rightOnly = rightPriority.value.render(viewport(3, 1));

  assert.ok(left.ok && right.ok && leftOnly.ok && rightOnly.ok);
  assert.equal(left.value.rows.at(0)?.text, "LEFT  R");
  assert.equal(right.value.rows.at(0)?.text, "LERIGHT");
  assert.equal(leftOnly.value.rows.at(0)?.text, "LEF");
  assert.equal(rightOnly.value.rows.at(0)?.text, "RIG");
});

test("handles empty sides without inventing visible state", () => {
  const empty = SplitLine.create([], [], { gap: 1, priority: "right" });
  const right = SplitLine.create(
    [],
    [span("RIGHT", "muted")],
    { gap: 1, priority: "right" },
  );
  const left = SplitLine.create(
    [span("LEFT", "accent")],
    [],
    { gap: 1, priority: "left" },
  );
  assert.ok(empty.ok && right.ok && left.ok);

  assert.deepEqual(empty.value.measure(7), {
    ok: true,
    value: { preferredRows: 0 },
  });
  const emptyRendered = empty.value.render(viewport(7, 1));
  const rightRendered = right.value.render(viewport(7, 1));
  const leftRendered = left.value.render(viewport(7, 1));
  assert.ok(emptyRendered.ok && rightRendered.ok && leftRendered.ok);
  assert.equal(emptyRendered.value.rows.at(0)?.text, "");
  assert.equal(rightRendered.value.rows.at(0)?.text, "  RIGHT");
  assert.equal(leftRendered.value.rows.at(0)?.text, "LEFT");
});

test("rejects malformed rows and split metadata without retaining content", () => {
  const invalidRow = SplitLine.create(
    [new Proxy(span("secret", "accent"), {})],
    [],
    { gap: 1, priority: "left" },
  );
  const invalidGap = SplitLine.create([], [], {
    gap: -1,
    priority: "left",
  });
  const invalidPriority = SplitLine.create([], [], {
    gap: 1,
    priority: "middle" as "left",
  });

  assert.equal(invalidRow.ok, false);
  assert.equal(invalidGap.ok, false);
  assert.equal(invalidPriority.ok, false);
  if (!invalidRow.ok) assert.equal(invalidRow.error.kind, "invalidRow");
  if (!invalidGap.ok) assert.equal(invalidGap.error.kind, "invalidGap");
  if (!invalidPriority.ok) {
    assert.equal(invalidPriority.error.kind, "invalidPriority");
  }
  assert.equal(JSON.stringify(invalidRow).includes("secret"), false);
});
