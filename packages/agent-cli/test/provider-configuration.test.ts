import assert from "node:assert/strict";
import test from "node:test";

import {
  OLLAMA_API_KEY_VARIABLE,
  isValidOllamaCloudCredential,
  resolveOllamaCloudConfiguration,
} from "../dist/provider-configuration.js";

test("keeps a missing Ollama Cloud credential disabled", () => {
  assert.equal(OLLAMA_API_KEY_VARIABLE, "AGENT_OLLAMA_API_KEY");
  assert.deepEqual(resolveOllamaCloudConfiguration(undefined), {
    ok: true,
    value: { kind: "disabled" },
  });
});

test("accepts a bounded Ollama Cloud credential without normalization", () => {
  assert.deepEqual(resolveOllamaCloudConfiguration("valid-value"), {
    ok: true,
    value: { credential: "valid-value", kind: "enabled" },
  });
});

test("rejects blank, whitespace, control, and oversized credentials", () => {
  for (const value of ["", "two values", "line\nbreak", "x".repeat(8_193)]) {
    assert.deepEqual(resolveOllamaCloudConfiguration(value), {
      error: { kind: "invalidCredential" },
      ok: false,
    });
  }
  assert.equal(isValidOllamaCloudCredential({}), false);
});
