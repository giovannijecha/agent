import assert from "node:assert/strict";
import test from "node:test";

import { ScrollState } from "@agent/tui";

test("follows the newest bounded window as content grows", () => {
  const initial = ScrollState.followEnd();
  const first = initial.reconcile(10, 3);
  assert.ok(first.ok);
  assert.equal(first.value.offset, 7);
  assert.equal(first.value.followingEnd, true);

  const grown = first.value.reconcile(12, 3);
  assert.ok(grown.ok);
  assert.equal(grown.value.offset, 9);
  assert.equal(grown.value.followingEnd, true);
});

test("manual movement disables follow until the end is reached again", () => {
  const initial = ScrollState.followEnd();
  const moved = initial.move(-2, 10, 3);
  assert.ok(moved.ok);
  assert.equal(moved.value.offset, 5);
  assert.equal(moved.value.followingEnd, false);

  const grown = moved.value.reconcile(12, 3);
  assert.ok(grown.ok);
  assert.equal(grown.value.offset, 5);
  assert.equal(grown.value.followingEnd, false);

  const ended = grown.value.toEnd(12, 3);
  assert.ok(ended.ok);
  assert.equal(ended.value.offset, 9);
  assert.equal(ended.value.followingEnd, true);
});

test("clamps manual state after content shrinks", () => {
  const moved = ScrollState.followEnd().move(-4, 10, 3);
  assert.ok(moved.ok);

  const shrunk = moved.value.reconcile(4, 3);
  assert.ok(shrunk.ok);
  assert.equal(shrunk.value.offset, 1);
  assert.equal(shrunk.value.followingEnd, false);
});

test("moves to the beginning without retaining content", () => {
  const started = ScrollState.followEnd().toStart(10, 3);
  assert.ok(started.ok);
  assert.equal(started.value.offset, 0);
  assert.equal(started.value.followingEnd, false);
});

test("rejects invalid offsets, deltas, and metrics without payloads", () => {
  const invalidOffset = ScrollState.create(-1, false);
  const invalidFollow = ScrollState.create(0, "yes" as unknown as boolean);
  const invalidMetrics = ScrollState.followEnd().reconcile(4_097, 1);
  const invalidDelta = ScrollState.followEnd().move(4_097, 10, 3);

  assert.equal(invalidOffset.ok, false);
  assert.equal(invalidFollow.ok, false);
  assert.equal(invalidMetrics.ok, false);
  assert.equal(invalidDelta.ok, false);
  if (!invalidOffset.ok) assert.equal(invalidOffset.error.kind, "invalidOffset");
  if (!invalidFollow.ok) assert.equal(invalidFollow.error.kind, "invalidFollow");
  if (!invalidMetrics.ok) assert.equal(invalidMetrics.error.kind, "invalidMetrics");
  if (!invalidDelta.ok) assert.equal(invalidDelta.error.kind, "invalidDelta");
});
