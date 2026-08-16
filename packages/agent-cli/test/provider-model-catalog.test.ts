import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProviderModelCatalog,
  PROVIDER_MODEL_CATALOG_LIMITS,
} from "../dist/provider-model-catalog.js";

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

test("decodes one exact bounded public model list", () => {
  const decoded = decodeProviderModelCatalog(ascii(JSON.stringify({
    data: [
      { id: "kimi-k2.7-code", object: "model" },
      { id: "deepseek-v4-flash-free", object: "model" },
    ],
    object: "list",
  })));

  assert.deepEqual(decoded, {
    ok: true,
    value: ["kimi-k2.7-code", "deepseek-v4-flash-free"],
  });
  assert.ok(decoded.ok);
  if (!decoded.ok) return;
  assert.equal(Object.isFrozen(decoded.value), true);
});

test("rejects malformed, duplicate, hostile, and oversized catalogs", () => {
  const cases = [
    ascii("{}"),
    ascii(JSON.stringify({ data: [], object: "list" })),
    ascii(JSON.stringify({
      data: [
        { id: "same", object: "model" },
        { id: "same", object: "model" },
      ],
      object: "list",
    })),
    ascii(JSON.stringify({
      data: [{ id: "private/model", object: "model" }],
      object: "list",
    })),
    new Uint8Array(PROVIDER_MODEL_CATALOG_LIMITS.bodyBytes + 1),
  ];

  for (const value of cases) {
    assert.equal(decodeProviderModelCatalog(value).ok, false);
  }
});
