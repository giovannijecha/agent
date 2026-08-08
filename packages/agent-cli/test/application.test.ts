import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeEvent, StartedTurn } from "@agent/runtime";

import { ApplicationController } from "../dist/application.js";

function started(turnId: number, content: string): StartedTurn {
  return Object.freeze({
    turnId,
    user: Object.freeze({ content }),
  }) as unknown as StartedTurn;
}

function completed(turnId: number, content: string): RuntimeEvent<string> {
  return Object.freeze({
    assistant: Object.freeze({ content }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId,
  }) as unknown as RuntimeEvent<string>;
}

function applyOnlyAction(application: ApplicationController, input: string) {
  const session = application.feed(input);
  assert.equal(session.actions.length, 1);
  const action = session.actions.at(0);
  assert.ok(action !== undefined);
  return application.applySessionAction(action);
}

test("discards no-runtime input without adding transcript or echoing it", () => {
  const application = new ApplicationController(false);
  const privateText = "private no-provider request";
  const submission = applyOnlyAction(application, privateText + "\r");

  assert.equal(submission.effects.at(0)?.kind, "startTurn");
  application.noRuntime();

  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.equal(application.notice.join("\n").includes(privateText), false);
});

test("active Ctrl+C requests one cancellation and preserves the draft", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "question")).ok);
  application.feed("next draft");

  const first = applyOnlyAction(application, "\u0003");
  const second = applyOnlyAction(application, "\u0003");

  assert.deepEqual(first.effects, [{ kind: "cancelTurn", turnId: 1 }]);
  assert.deepEqual(second.effects, []);
  assert.equal(application.phase, "cancelling");
  assert.equal(application.project(40).text, "next draft");
});

test("idle Ctrl+C and every explicit exit path emit exit", () => {
  const interrupt = applyOnlyAction(
    new ApplicationController(false),
    "\u0003",
  );
  const command = applyOnlyAction(
    new ApplicationController(false),
    "/exit\r",
  );
  const eof = applyOnlyAction(new ApplicationController(false), "\u0004");

  assert.deepEqual(interrupt.effects, [{ kind: "exit" }]);
  assert.deepEqual(command.effects, [{ kind: "exit" }]);
  assert.deepEqual(eof.effects, [{ kind: "exit" }]);
});

test("publishes exact streamed completion and returns to idle", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(3, "question"));
  const delta = application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "answer",
      turnId: 3,
    }),
  );
  const finish = application.applyRuntime(completed(3, "answer"));

  assert.ok(delta.ok);
  assert.ok(finish.ok);
  if (finish.ok) {
    assert.deepEqual(finish.value.effects, [{ kind: "commitTurn", turnId: 3 }]);
  }
  const committed = application.turnCommitResolved(
    3,
    Object.freeze({ kind: "committed" as const }),
  );
  assert.ok(committed.ok);
  assert.equal(application.phase, "idle");
  assert.equal(
    application.transcriptText(),
    "you\nquestion\n\nagent\nanswer",
  );
  assert.deepEqual(application.notice, ["Ready."]);
});

test("filters stale events and discards failed prospective content", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(4, "private question"));
  const stale = application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "stale private response",
      turnId: 99,
    }),
  );
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "partial private response",
      turnId: 4,
    }),
  );
  const failed = application.applyRuntime(
    Object.freeze({
      checkpointed: false,
      cleanup: Object.freeze([
        Object.freeze({ kind: "model" as const, error: "private cleanup" }),
      ]),
      kind: "turnFinished" as const,
      outcome: Object.freeze({
        failure: Object.freeze({
          error: "private model error",
          kind: "model" as const,
          operation: "read" as const,
        }),
        kind: "failed" as const,
      }),
      turnId: 4,
    }),
  );

  assert.ok(stale.ok);
  assert.equal(stale.value.redraw, false);
  assert.ok(failed.ok);
  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.equal(application.notice.join("\n").includes("private"), false);
});

test("discards a second submission while a turn is active", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "first question"));
  const secondText = "second private question";

  const update = applyOnlyAction(application, secondText + "\r");

  assert.deepEqual(update.effects, []);
  assert.equal(application.notice.join("\n").includes(secondText), false);
  assert.equal(application.transcriptText().includes(secondText), false);
});

test("explicitly releases draft, status, and display-only personal content", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "private question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "private answer",
      turnId: 1,
    }),
  );
  application.feed("private draft");

  application.clear();

  assert.equal(application.activeTurnId, undefined);
  assert.equal(application.draftLength, 0);
  assert.equal(application.hasTranscript, false);
  assert.equal(application.transcriptText(), "");
  assert.deepEqual(application.notice, []);
});

test("requires exact approval commands and exposes a bounded capability summary", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(7, "change it")).ok);
  const requested = application.applyRuntime(
    Object.freeze({
      approvalRequired: true,
      approvalPreview: 'path="src/index.ts" oldText=<3 code units>',
      callId: "private-call-id",
      kind: "toolRequested" as const,
      name: "replace_text",
      risk: "write" as const,
      turnId: 7,
    }),
  );
  assert.ok(requested.ok);
  assert.equal(application.phase, "awaitingApproval");
  assert.equal(application.toolStatus.includes("replace_text"), true);
  assert.equal(application.toolStatus.includes("private-call-id"), false);
  assert.equal(application.toolPreview.includes("src/index.ts"), true);

  const approved = applyOnlyAction(application, "/approve\r");
  assert.deepEqual(approved.effects, [
    {
      approved: true,
      callId: "private-call-id",
      kind: "resolveToolApproval",
      turnId: 7,
    },
  ]);
  const repeated = applyOnlyAction(application, "/approve\r");
  assert.deepEqual(repeated.effects, []);
  assert.deepEqual(application.notice, ["No tool approval is pending."]);
});

test("checkpoints tool activity and retains its display truth after failure", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(8, "inspect")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        kind: "assistantDelta" as const,
        text: "Checking.",
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalRequired: false,
        approvalPreview: "",
        callId: "call-8",
        kind: "toolRequested" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-8",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 8,
      }),
    ).ok,
  );
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        callId: "call-8",
        kind: "toolFinished" as const,
        name: "read_file",
        risk: "read" as const,
        status: "success" as const,
        turnId: 8,
      }),
    ).ok,
  );
  const failed = application.applyRuntime(
    Object.freeze({
      checkpointed: true,
      cleanup: Object.freeze([]),
      kind: "turnFinished" as const,
      outcome: Object.freeze({
        failure: Object.freeze({ kind: "toolEngine" as const }),
        kind: "failed" as const,
      }),
      turnId: 8,
    }),
  );
  assert.ok(failed.ok);
  assert.equal(application.phase, "idle");
  assert.equal(application.transcriptText().includes("Checking."), true);
  assert.equal(
    application.transcriptText().includes("[turn failed after tool activity]"),
    true,
  );
  assert.equal(
    application.notice.join("\n").includes("remains in conversation"),
    true,
  );
});

test("reports approval commands as contextual when no tool is pending", () => {
  const application = new ApplicationController(true);
  const denied = applyOnlyAction(application, "/deny\r");

  assert.deepEqual(denied.effects, []);
  assert.deepEqual(application.notice, ["No tool approval is pending."]);
});

test("rejects tool events that bypass approval or contradict checkpoints", () => {
  const deceptivePreview = new ApplicationController(true);
  assert.ok(deceptivePreview.turnAccepted(started(9, "change")).ok);
  assert.equal(
    deceptivePreview.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="docs/\u202Egnp.exe"',
        approvalRequired: true,
        callId: "call-9",
        kind: "toolRequested" as const,
        name: "create_file",
        risk: "write" as const,
        turnId: 9,
      }),
    ).ok,
    false,
  );

  const beforeApproval = new ApplicationController(true);
  assert.ok(beforeApproval.turnAccepted(started(10, "change")).ok);
  assert.ok(
    beforeApproval.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="file.txt" content=<3 code units>',
        approvalRequired: true,
        callId: "call-10",
        kind: "toolRequested" as const,
        name: "create_file",
        risk: "write" as const,
        turnId: 10,
      }),
    ).ok,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        callId: "call-10",
        kind: "toolStarted" as const,
        name: "create_file",
        risk: "write" as const,
        turnId: 10,
      }),
    ).ok,
    false,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        callId: "call-10",
        kind: "toolFinished" as const,
        name: "create_file",
        risk: "write" as const,
        status: "success" as const,
        turnId: 10,
      }),
    ).ok,
    false,
  );
  assert.equal(
    beforeApproval.applyRuntime(
      Object.freeze({
        assistant: Object.freeze({ content: "done" }),
        checkpointed: false,
        cleanup: Object.freeze([]),
        kind: "turnPrepared" as const,
        turnId: 10,
      }) as never,
    ).ok,
    false,
  );

  const afterDenial = new ApplicationController(true);
  assert.ok(afterDenial.turnAccepted(started(11, "change")).ok);
  assert.ok(
    afterDenial.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="file.txt" content=<3 code units>',
        approvalRequired: true,
        callId: "call-11",
        kind: "toolRequested" as const,
        name: "create_file",
        risk: "write" as const,
        turnId: 11,
      }),
    ).ok,
  );
  applyOnlyAction(afterDenial, "/deny\r");
  assert.equal(
    afterDenial.applyRuntime(
      Object.freeze({
        callId: "call-11",
        kind: "toolStarted" as const,
        name: "create_file",
        risk: "write" as const,
        turnId: 11,
      }),
    ).ok,
    false,
  );

  const mismatch = new ApplicationController(true);
  assert.ok(mismatch.turnAccepted(started(12, "inspect")).ok);
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        approvalPreview: "",
        approvalRequired: false,
        callId: "call-12",
        kind: "toolRequested" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        callId: "call-12",
        kind: "toolStarted" as const,
        name: "read_file",
        risk: "read" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.ok(
    mismatch.applyRuntime(
      Object.freeze({
        callId: "call-12",
        kind: "toolFinished" as const,
        name: "read_file",
        risk: "read" as const,
        status: "success" as const,
        turnId: 12,
      }),
    ).ok,
  );
  assert.equal(
    mismatch.applyRuntime(
      Object.freeze({
        checkpointed: false,
        cleanup: Object.freeze([]),
        kind: "turnFinished" as const,
        outcome: Object.freeze({ kind: "cancelled" as const }),
        turnId: 12,
      }),
    ).ok,
    false,
  );
});

test("retains only checkpoint-backed text after cancellation", () => {
  const beforePreparation = new ApplicationController(true);
  assert.ok(beforePreparation.turnAccepted(started(20, "inspect")).ok);
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "backed", turnId: 20 }),
    ).ok,
  );
  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-20",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 20,
    }),
    Object.freeze({
      callId: "call-20",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 20,
    }),
    Object.freeze({
      callId: "call-20",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "success" as const,
      turnId: 20,
    }),
  ]) {
    assert.ok(beforePreparation.applyRuntime(event).ok);
  }
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "prospective", turnId: 20 }),
    ).ok,
  );
  assert.ok(
    beforePreparation.applyRuntime(
      Object.freeze({
        checkpointed: true,
        cleanup: Object.freeze([]),
        kind: "turnFinished" as const,
        outcome: Object.freeze({ kind: "cancelled" as const }),
        turnId: 20,
      }),
    ).ok,
  );
  assert.equal(beforePreparation.transcriptText().includes("backed"), true);
  assert.equal(beforePreparation.transcriptText().includes("prospective"), false);

  const afterPreparation = new ApplicationController(true);
  assert.ok(afterPreparation.turnAccepted(started(21, "inspect")).ok);
  assert.ok(
    afterPreparation.applyRuntime(
      Object.freeze({ kind: "assistantDelta" as const, text: "backed", turnId: 21 }),
    ).ok,
  );
  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "call-21",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 21,
    }),
    Object.freeze({
      callId: "call-21",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 21,
    }),
    Object.freeze({
      callId: "call-21",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "success" as const,
      turnId: 21,
    }),
    Object.freeze({ kind: "assistantDelta" as const, text: "prospective", turnId: 21 }),
  ]) {
    assert.ok(afterPreparation.applyRuntime(event).ok);
  }
  assert.ok(
    afterPreparation.applyRuntime(
      Object.freeze({
        assistant: Object.freeze({ content: "prospective" }),
        checkpointed: true,
        cleanup: Object.freeze([]),
        kind: "turnPrepared" as const,
        turnId: 21,
      }) as never,
    ).ok,
  );
  assert.ok(
    afterPreparation.turnCommitResolved(
      21,
      Object.freeze({ kind: "cancelled" as const }),
    ).ok,
  );
  assert.equal(afterPreparation.transcriptText().includes("backed"), true);
  assert.equal(afterPreparation.transcriptText().includes("prospective"), false);
});
