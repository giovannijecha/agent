import assert from "node:assert/strict";
import test from "node:test";

import { Viewport, ViewportError } from "@agent/tui";

test("creates immutable positive terminal geometry", () => {
  const result = Viewport.create(80, 24);

  assert.ok(result.ok);
  assert.equal(result.value.columns, 80);
  assert.equal(result.value.rows, 24);
  assert.ok(Object.isFrozen(result.value));
});

test("rejects unsafe or non-positive dimensions", () => {
  const columns = Viewport.create(0, 24);
  const rows = Viewport.create(80, Number.POSITIVE_INFINITY);

  assert.equal(columns.ok, false);
  assert.equal(rows.ok, false);
  if (!columns.ok) {
    assert.ok(columns.error instanceof ViewportError);
    assert.equal(columns.error.dimension, "columns");
  }
  if (!rows.ok) {
    assert.equal(rows.error.dimension, "rows");
  }
});
