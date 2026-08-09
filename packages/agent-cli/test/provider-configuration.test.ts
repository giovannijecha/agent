import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENCODE_GO_API_KEY_VARIABLE,
  isValidOpenCodeGoCredential,
  resolveOpenCodeGoConfiguration,
} from "../dist/provider-configuration.js";

test("keeps a missing provider credential disabled", () => {
  assert.equal(OPENCODE_GO_API_KEY_VARIABLE, "AGENT_OPENCODE_GO_API_KEY");
  assert.deepEqual(resolveOpenCodeGoConfiguration(undefined), {
    ok: true,
    value: { kind: "disabled" },
  });
});

test("accepts one bounded credential without normalizing it", () => {
  assert.deepEqual(resolveOpenCodeGoConfiguration("valid-value"), {
    ok: true,
    value: { credential: "valid-value", kind: "enabled" },
  });
});

test("rejects blank, whitespace, control, and oversized credentials", () => {
  for (const value of ["", "two values", "line\nbreak", "x".repeat(8_193)]) {
    assert.deepEqual(resolveOpenCodeGoConfiguration(value), {
      error: { kind: "invalidCredential" },
      ok: false,
    });
  }
  assert.equal(isValidOpenCodeGoCredential({}), false);
});
