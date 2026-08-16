import assert from "node:assert/strict";
import test from "node:test";

import {
  OPENCODE_GO_API_KEY_VARIABLE,
  OPENCODE_ZEN_API_KEY_VARIABLE,
  isValidOpenCodeGoCredential,
  isValidOpenCodeZenCredential,
  resolveOpenCodeGoConfiguration,
  resolveOpenCodeZenConfiguration,
} from "../dist/provider-configuration.js";

test("keeps missing Go and Zen credentials independently disabled", () => {
  assert.equal(OPENCODE_GO_API_KEY_VARIABLE, "AGENT_OPENCODE_GO_API_KEY");
  assert.equal(OPENCODE_ZEN_API_KEY_VARIABLE, "AGENT_OPENCODE_ZEN_API_KEY");
  assert.deepEqual(resolveOpenCodeGoConfiguration(undefined), {
    ok: true,
    value: { kind: "disabled" },
  });
  assert.deepEqual(resolveOpenCodeZenConfiguration(undefined), {
    ok: true,
    value: { kind: "disabled" },
  });
});

test("accepts bounded Go and Zen credentials without normalization", () => {
  assert.deepEqual(resolveOpenCodeGoConfiguration("go-value"), {
    ok: true,
    value: { credential: "go-value", kind: "enabled" },
  });
  assert.deepEqual(resolveOpenCodeZenConfiguration("valid-value"), {
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
    assert.deepEqual(resolveOpenCodeZenConfiguration(value), {
      error: { kind: "invalidCredential" },
      ok: false,
    });
  }
  assert.equal(isValidOpenCodeGoCredential({}), false);
  assert.equal(isValidOpenCodeZenCredential({}), false);
});
