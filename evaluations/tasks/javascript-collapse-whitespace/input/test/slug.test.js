import assert from "node:assert/strict";
import test from "node:test";

import { slugify } from "../src/slug.js";

test("creates one stable word separator", () => {
  assert.equal(slugify("  Quiet   Agent\tRun  "), "quiet-agent-run");
});
