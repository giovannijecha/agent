import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProviderModelCatalog,
  PROVIDER_MODEL_CATALOG_LIMITS,
} from "../dist/provider-model-catalog.js";

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

test("decodes one exact bounded authenticated Ollama model list", () => {
  const decoded = decodeProviderModelCatalog(ascii(JSON.stringify({
    models: [
      { name: "qwen3-coder:480b-cloud", model: "qwen3-coder:480b-cloud" },
      { name: "glm-4.7:cloud", model: "glm-4.7:cloud" },
    ],
  })));

  assert.deepEqual(decoded, {
    ok: true,
    value: ["qwen3-coder:480b-cloud", "glm-4.7:cloud"],
  });
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  assert.equal(Object.isFrozen(decoded.value), true);
});

test("rejects malformed, duplicate, hostile, and oversized catalogs", () => {
  const cases = [
    ascii("{}"),
    ascii(JSON.stringify({ models: [] })),
    ascii(JSON.stringify({
      models: [
        { name: "same", model: "same" },
        { name: "same", model: "same" },
      ],
    })),
    ascii(JSON.stringify({
      models: [{ name: "bad model", model: "bad model" }],
    })),
    ascii(JSON.stringify({
      models: [{ name: "valid", model: "other" }],
    })),
    new Uint8Array(PROVIDER_MODEL_CATALOG_LIMITS.bodyBytes + 1),
  ];

  for (const value of cases) {
    assert.equal(decodeProviderModelCatalog(value).ok, false);
  }
});
