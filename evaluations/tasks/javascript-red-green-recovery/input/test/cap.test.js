import assert from "node:assert/strict";
import test from "node:test";

import { capAt } from "../src/cap.js";

test("caps a value at the inclusive maximum", () => {
  assert.equal(capAt(12, 10), 10);
  assert.equal(capAt(8, 10), 8);
});
