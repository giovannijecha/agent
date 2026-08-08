import assert from "node:assert/strict";
import test from "node:test";

import {
  StructuredList,
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";

test("snapshots nested data without retaining mutable input", () => {
  const source = { enabled: true, paths: ["one", "two"] };
  const result = structuredValueFromUnknown(source);
  assert.ok(result.ok && result.value instanceof StructuredObject);

  source.enabled = false;
  source.paths.push("three");
  assert.equal(result.value.get("enabled"), true);
  const paths = result.value.get("paths");
  assert.ok(paths instanceof StructuredList);
  assert.deepEqual(paths.values, ["one", "two"]);
  assert.ok(Object.isFrozen(paths.values));
  assert.ok(Object.isFrozen(result.value.fields));
});

test("rejects cycles and accessors without retaining foreign values", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  const cycle = structuredValueFromUnknown(cyclic);
  assert.equal(cycle.ok, false);
  if (!cycle.ok) {
    assert.equal(cycle.error.kind, "cycle");
  }

  const accessor = Object.defineProperty({}, "secret", {
    enumerable: true,
    get(): never {
      throw new Error("must not escape");
    },
  });
  const rejected = structuredValueFromUnknown(accessor);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.kind, "invalidObject");
    assert.equal("cause" in rejected.error, false);
  }
});

test("rejects unsupported types, unsafe keys, and non-finite numbers", () => {
  for (const input of [undefined, 1n, Symbol("x"), () => undefined]) {
    const result = structuredValueFromUnknown(input);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "invalidType");
    }
  }
  const unsafeKey = structuredValueFromUnknown({ "not-safe": true });
  assert.equal(unsafeKey.ok, false);
  const infinite = structuredValueFromUnknown(Number.POSITIVE_INFINITY);
  assert.equal(infinite.ok, false);
});
