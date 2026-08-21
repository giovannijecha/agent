import assert from "node:assert/strict";
import test from "node:test";

import { BoundedArgumentChunks } from "../dist/argument-chunks.js";

test("retains bounded argument chunks until one completion join", () => {
  const chunks = new BoundedArgumentChunks(5);
  assert.equal(chunks.append("call-alpha", "ab"), true);
  assert.equal(chunks.append("call-alpha", "cd"), true);
  assert.equal(chunks.append("call-beta", "e"), true);
  assert.equal(chunks.pending, true);
  assert.equal(chunks.append("call-beta", "rejected"), false);
  assert.equal(chunks.complete("call-alpha"), "abcd");
  assert.equal(chunks.complete("call-alpha"), undefined);
  assert.equal(chunks.pending, true);
  assert.equal(chunks.complete("call-beta"), "e");
  assert.equal(chunks.pending, false);
  assert.equal(chunks.append("call-gamma", "x"), false);
});
