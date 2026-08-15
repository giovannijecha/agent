import assert from "node:assert/strict";
import test from "node:test";

import { isMotionActive } from "../dist/motion-policy.js";

test("limits visible motion to autonomous progress", () => {
  assert.equal(isMotionActive("generating"), true);
  assert.equal(isMotionActive("runningTool"), true);
  assert.equal(isMotionActive("cancelling"), true);
  assert.equal(isMotionActive("idle"), false);
  assert.equal(isMotionActive("awaitingPermission"), false);
});
