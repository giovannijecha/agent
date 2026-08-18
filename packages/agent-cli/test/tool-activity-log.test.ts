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
    approvalRequired ? "apply_patch" : "read_file",
    approvalRequired ? "write" : "read",
    approvalRequired ? "Path: src/index.ts\n- old\n+ new" : "",
    approvalRequired,
    approvalRequired,
  );
}

test("models one exact approved activity lifecycle without exposing identity", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "private-call-id").ok);
  assert.deepEqual(log.snapshots(), [
    {
      name: "apply_patch",
      preview: "Path: src/index.ts\n- old\n+ new",
      risk: "write",
      state: "permission",
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

test("retains one bounded ordered cohort through every read lifecycle", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "read-a", false).ok);
  assert.ok(request(log, "read-b", false).ok);
  assert.deepEqual(log.snapshots(), [
    { name: "read_file", preview: "", risk: "read", state: "queued" },
    { name: "read_file", preview: "", risk: "read", state: "queued" },
  ]);

  assert.equal(log.start(7, "read-b").ok, false);
  assert.ok(log.start(7, "read-a").ok);
  assert.ok(log.start(7, "read-b").ok);
  assert.equal(log.finish(7, "read-b", "succeeded").ok, false);
  assert.ok(log.finish(7, "read-a", "succeeded").ok);
  assert.ok(log.finish(7, "read-b", "failed").ok);
  assert.deepEqual(log.snapshots(), [
    { name: "read_file", preview: "", risk: "read", state: "succeeded" },
    { name: "read_file", preview: "", risk: "read", state: "failed" },
  ]);
  assert.ok(log.finishTurn(7).ok);
});

test("rejects incomplete, mixed, and oversized read cohorts", () => {
  const pending = new ToolActivityLog();
  assert.ok(pending.beginTurn(7).ok);
  assert.ok(request(pending, "permission-a").ok);
  assert.equal(request(pending, "read-b", false).ok, false);

  const mixed = new ToolActivityLog();
  assert.ok(mixed.beginTurn(7).ok);
  assert.ok(request(mixed, "read-a", false).ok);
  assert.equal(request(mixed, "write-b").ok, false);

  const bounded = new ToolActivityLog();
  assert.ok(bounded.beginTurn(7).ok);
  for (let index = 0; index < 4; index += 1) {
    assert.ok(request(bounded, "read-" + String(index), false).ok);
  }
  assert.equal(request(bounded, "read-overflow", false).ok, false);
});

test("cancels every retained read activity together", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(request(log, "read-a", false).ok);
  assert.ok(request(log, "read-b", false).ok);
  assert.ok(log.start(7, "read-a").ok);
  assert.ok(log.start(7, "read-b").ok);
  assert.deepEqual(log.requestCancel(7), { ok: true, value: true });
  assert.deepEqual(
    log.snapshots().map((entry) => entry.state),
    ["cancelling", "cancelling"],
  );
  assert.deepEqual(log.cancelActive(7), { ok: true, value: true });
  assert.deepEqual(
    log.snapshots().map((entry) => entry.state),
    ["cancelled", "cancelled"],
  );
});

test("renders a failed mutation plan without opening an approval", () => {
  const log = new ToolActivityLog();
  assert.ok(log.beginTurn(7).ok);
  assert.ok(
    log.request(
      7,
      "stale-call",
      "apply_patch",
      "write",
      "",
      false,
      false,
    ).ok,
  );
  assert.deepEqual(log.snapshots(), [
    {
      name: "apply_patch",
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
      "apply_patch",
      "write",
      'path="docs/\u202Egnp.exe"',
      true,
      true,
    ).ok,
    false,
  );
});

test("admits formatter-owned LF rows and rejects other preview controls", () => {
  const multiline = new ToolActivityLog();
  assert.ok(multiline.beginTurn(7).ok);
  assert.ok(
    multiline.request(
      7,
      "multiline-call",
      "apply_patch",
      "write",
      "Path: file.txt\n- old\n+ new",
      true,
      true,
    ).ok,
  );

  const carriage = new ToolActivityLog();
  assert.ok(carriage.beginTurn(7).ok);
  assert.equal(
    carriage.request(
      7,
      "carriage-call",
      "apply_patch",
      "write",
      "Path: file.txt\r- old",
      true,
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
