import assert from "node:assert/strict";
import test from "node:test";

import {
  EVALUATION_RECEIPT_LIMITS,
  EvaluationReceiptRecorder,
  formatEvaluationReceipt,
} from "../dist/evaluation-receipt.js";

test("emits only bounded content-free authoritative counters", () => {
  const recorder = new EvaluationReceiptRecorder();
  assert.ok(recorder.start(1_000).ok);

  recorder.acceptedTurn();
  recorder.requestedTool();
  recorder.requestedTool();
  recorder.approvedTool();
  recorder.observeRead("read_file", "src/main.ts");
  recorder.observeRead("read_file", "src/main.ts");
  recorder.observeRead("read_file", "src/other.ts");
  recorder.observeRead("search_text", ".", "needle");
  recorder.observeRead("search_text", ".", "needle");
  recorder.observeRead("search_text", ".", "other");

  const finished = recorder.finish(1_275);
  assert.ok(finished.ok);
  assert.deepEqual(finished.value, {
    approvals: 1,
    elapsedMilliseconds: 275,
    repeatedReads: 2,
    schemaVersion: 1,
    toolCalls: 2,
    turns: 1,
  });
  assert.equal(
    formatEvaluationReceipt(finished.value),
    '{"approvals":1,"elapsedMilliseconds":275,"repeatedReads":2,' +
      '"schemaVersion":1,"toolCalls":2,"turns":1}\n',
  );
});

test("fails closed on invalid lifecycle, clocks, observations, and bounds", () => {
  const notStarted = new EvaluationReceiptRecorder();
  assert.deepEqual(notStarted.finish(1), {
    error: { kind: "notStarted" },
    ok: false,
  });

  const invalidStart = new EvaluationReceiptRecorder();
  assert.deepEqual(invalidStart.start(-1), {
    error: { kind: "invalidClock" },
    ok: false,
  });

  const premature = new EvaluationReceiptRecorder();
  premature.requestedTool();
  assert.ok(premature.start(0).ok);
  assert.deepEqual(premature.finish(1), {
    error: { kind: "notStarted" },
    ok: false,
  });

  const regressed = new EvaluationReceiptRecorder();
  assert.ok(regressed.start(10).ok);
  assert.deepEqual(regressed.finish(9), {
    error: { kind: "invalidClock" },
    ok: false,
  });
  assert.deepEqual(regressed.finish(11), {
    error: { kind: "closed" },
    ok: false,
  });

  const invalidRead = new EvaluationReceiptRecorder();
  assert.ok(invalidRead.start(0).ok);
  invalidRead.observeRead("search_text", ".");
  assert.deepEqual(invalidRead.finish(1), {
    error: { kind: "invalidObservation" },
    ok: false,
  });

  const overflow = new EvaluationReceiptRecorder();
  assert.ok(overflow.start(0).ok);
  for (let index = 0; index <= EVALUATION_RECEIPT_LIMITS.count; index += 1) {
    overflow.requestedTool();
  }
  assert.deepEqual(overflow.finish(1), {
    error: { kind: "limit" },
    ok: false,
  });

  const elapsed = new EvaluationReceiptRecorder();
  assert.ok(elapsed.start(0).ok);
  assert.deepEqual(
    elapsed.finish(EVALUATION_RECEIPT_LIMITS.elapsedMilliseconds + 1),
    { error: { kind: "limit" }, ok: false },
  );
});
