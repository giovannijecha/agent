import assert from "node:assert/strict";
import test from "node:test";

import { scalarUtf8ByteLength } from "@agent/core";

test("measures valid Unicode scalar text as UTF-8", () => {
  assert.equal(scalarUtf8ByteLength("agent"), 5);
  assert.equal(scalarUtf8ByteLength("\u00e9"), 2);
  assert.equal(scalarUtf8ByteLength("\u6f22"), 3);
  assert.equal(scalarUtf8ByteLength("\ud83d\ude00"), 4);
});

test("rejects malformed scalar text and optional NUL", () => {
  assert.equal(scalarUtf8ByteLength("\ud800"), undefined);
  assert.equal(scalarUtf8ByteLength("\udc00"), undefined);
  assert.equal(scalarUtf8ByteLength("a\0b", true), undefined);
  assert.equal(scalarUtf8ByteLength("a\0b"), 3);
});
