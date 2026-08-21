import assert from "node:assert/strict";
import test from "node:test";

import { BoundedTextChunks } from "../dist/text-chunks.js";

test("retains bounded text chunks until one completion join", () => {
  const chunks = new BoundedTextChunks(5);
  assert.equal(chunks.append("item-alpha", "ab"), true);
  assert.equal(chunks.append("item-alpha", "cd"), true);
  assert.equal(chunks.append("item-beta", "e"), true);
  assert.equal(chunks.pending, true);
  assert.equal(chunks.append("item-beta", "rejected"), false);
  assert.equal(chunks.complete("item-alpha"), "abcd");
  assert.equal(chunks.complete("item-alpha"), undefined);
  assert.equal(chunks.pending, true);
  assert.equal(chunks.complete("item-beta"), "e");
  assert.equal(chunks.pending, false);
  assert.equal(chunks.append("item-gamma", "x"), false);
});

test("joins a maximum-fragment text only at completion", () => {
  const maximum = OPEN_FRAGMENT_COUNT;
  const chunks = new BoundedTextChunks(maximum);
  for (let index = 0; index < maximum; index += 1) {
    assert.equal(chunks.append("item-alpha", "x"), true);
  }
  assert.equal(chunks.complete("item-alpha"), "x".repeat(maximum));
  assert.equal(chunks.pending, false);
});

const OPEN_FRAGMENT_COUNT = 16_384;
