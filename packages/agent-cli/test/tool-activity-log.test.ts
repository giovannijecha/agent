import assert from "node:assert/strict";
import test from "node:test";

import {
  ToolActivityLog,
  TOOL_ACTIVITY_LIMITS,
} from "../dist/tool-activity-log.js";

function request(
  log: ToolActivityLog,
  callId: string,
  approvalRequired = true,
  turnId = 7,
) {
  return log.request(
    turnId,
    callId,
    approvalRequired ? "replace_text" : "read_file",
    approvalRequired ? "write" : "read",
    approvalRequired ? 'path="src/index.ts" oldText=<3 code units>' : "",
    approvalRequired,
  );
}

test("models one exact approved activity lifecycle without exposing identity", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "private-call-id").ok);
  assert.deepEqual(log.snapshots(), [
    {
      name: "replace_text",
      preview: 'path="src/index.ts" oldText=<3 code units>',
      risk: "write",
      state: "approval",
    },
  ]);

  assert.ok(log.decide(7, "private-call-id", true).ok);
  assert.equal(log.snapshots().at(0)?.state, "queued");
  assert.ok(log.start(7, "private-call-id").ok);
  assert.equal(log.snapshots().at(0)?.state, "running");
  assert.ok(log.finish(7, "private-call-id", "succeeded").ok);
  assert.equal(log.snapshots().at(0)?.state, "succeeded");
  assert.ok(log.finishTurn(7).ok);

  const serialized = JSON.stringify(log.snapshots());
  assert.equal(serialized.includes("private-call-id"), false);
});

test("preserves denied and cancelled terminal truth", () => {
  const denied = new ToolActivityLog();
  assert.ok(denied.beginTurn(7).ok);
  assert.ok(request(denied, "denied-call").ok);
  assert.ok(denied.decide(7, "denied-call", false).ok);
  assert.equal(denied.snapshots().at(0)?.state, "denied");
  assert.ok(denied.finish(7, "denied-call", "denied").ok);
  assert.equal(denied.snapshots().at(0)?.state, "denied");

  const cancelled = new ToolActivityLog();
  assert.ok(cancelled.beginTurn(7).ok);
  assert.ok(request(cancelled, "cancelled-call", false).ok);
  assert.ok(cancelled.start(7, "cancelled-call").ok);
  assert.ok(cancelled.requestCancel(7).ok);
  assert.equal(cancelled.snapshots().at(0)?.state, "cancelling");
  assert.ok(cancelled.cancelActive(7).ok);
  assert.equal(cancelled.snapshots().at(0)?.state, "cancelled");
});

test("renders a failed mutation plan without opening an approval", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(
    log.request(
      7,
      "stale-call",
      "replace_text",
      "write",
      "",
      false,
    ).ok,
  );
  assert.deepEqual(log.snapshots(), [
    {
      name: "replace_text",
      preview: "",
      risk: "write",
      state: "queued",
    },
  ]);
  assert.ok(log.start(7, "stale-call").ok);
  assert.ok(log.finish(7, "stale-call", "failed").ok);
});

test("rejects stale identities, contradictory transitions, and unsafe previews", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "call-7").ok);

  assert.equal(log.start(7, "call-7").ok, false);
  assert.equal(log.decide(8, "call-7", true).ok, false);
  assert.equal(log.decide(7, "other-call", true).ok, false);
  assert.equal(
    log.request(
      7,
      "unsafe-call",
      "replace_text",
      "write",
      'path="docs/\u202Egnp.exe"',
      true,
    ).ok,
    false,
  );
});

test("enforces the activity bound independently of call identity", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  for (let index = 0; index < TOOL_ACTIVITY_LIMITS.entries; index += 1) {
    const callId = "call-" + String(index);
    assert.ok(request(log, callId, false).ok);
    assert.ok(log.start(7, callId).ok);
    assert.ok(log.finish(7, callId, "succeeded").ok);
  }
  assert.equal(request(log, "overflow", false).ok, false);

  const reused = new ToolActivityLog();
  assert.ok(reused.beginTurn(7).ok);
  assert.ok(request(reused, "same", false).ok);
  assert.ok(reused.start(7, "same").ok);
  assert.ok(reused.finish(7, "same", "succeeded").ok);
  assert.ok(request(reused, "same", false).ok);
  assert.ok(reused.start(7, "same").ok);
  assert.ok(reused.finish(7, "same", "succeeded").ok);
});

test("replaces settled activity and releases it when the turn settles", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "call-7", false).ok);
  assert.ok(log.start(7, "call-7").ok);
  assert.ok(log.finish(7, "call-7", "failed").ok);
  assert.equal(log.snapshots().at(0)?.state, "failed");

  assert.ok(request(log, "call-8", false).ok);
  assert.deepEqual(log.snapshots(), [
    {
      name: "read_file",
      preview: "",
      risk: "read",
      state: "queued",
    },
  ]);
  assert.ok(log.start(7, "call-8").ok);
  assert.ok(log.finish(7, "call-8", "succeeded").ok);
  assert.ok(log.finishTurn(7).ok);
  assert.deepEqual(log.snapshots(), []);

  assert.ok(log.beginTurn(8).ok);
  assert.deepEqual(log.snapshots(), []);
  assert.ok(request(log, "call-9", true, 8).ok);
  log.clear();
  assert.deepEqual(log.snapshots(), []);
  assert.equal(log.finishTurn(8).ok, false);
});

test("returns fresh immutable snapshots", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "call-7").ok);

  const first = log.snapshots();
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.at(0)), true);
  const second = log.snapshots();
  assert.equal(first === second, false);
  assert.equal(first.at(0) === second.at(0), false);
});
