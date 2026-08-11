import assert from "node:assert/strict";
import test from "node:test";

import { Spacer, Viewport } from "@agent/tui";

test("reserves bounded empty rows without adding printable content", () => {
  const spacer = Spacer.create(2);
  const viewport = Viewport.create(8, 2);
  assert.ok(spacer.ok);
  assert.ok(viewport.ok);

  const measured = spacer.value.measure(8);
  const rendered = spacer.value.render(viewport.value);
  assert.ok(measured.ok);
  assert.equal(measured.value.preferredRows, 2);
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), ["", ""]);
});

test("rejects zero and non-integral rhythm", () => {
  for (const rows of [0, 1.5]) {
    const spacer = Spacer.create(rows);
    assert.equal(spacer.ok, false);
    if (!spacer.ok) assert.equal(spacer.error.kind, "invalidGap");
  }
});
