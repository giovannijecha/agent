import assert from "node:assert/strict";
import test from "node:test";

import { sumRange } from "../src/sum-range.js";

test("includes both endpoints", () => {
  assert.equal(sumRange(2, 4), 9);
});
