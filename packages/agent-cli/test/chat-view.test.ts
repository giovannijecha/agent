import assert from "node:assert/strict";
import test from "node:test";

import type { StartedTurn } from "@agent/runtime";
import { Viewport } from "@agent/tui";

import { ApplicationController } from "../dist/application.js";
import { createChatFrame } from "../dist/chat-view.js";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function started(turnId: number, content: string): StartedTurn {
  return Object.freeze({
    turnId,
    user: Object.freeze({ content }),
  }) as unknown as StartedTurn;
}

test("keeps only a valid prompt and caret in a one-cell viewport", () => {
  const application = new ApplicationController(false);
  application.feed("draft");

  const result = createChatFrame(application, viewport(1, 1));

  assert.ok(result.ok);
  assert.deepEqual(result.value.lines, [""]);
  assert.deepEqual(result.value.caret, { row: 0, column: 0 });
});

test("keeps status directly above the final prompt on a short viewport", () => {
  const application = new ApplicationController(false);
  const result = createChatFrame(application, viewport(40, 2));

  assert.ok(result.ok);
  assert.deepEqual(result.value.lines, [
    "No model or tools are configured.",
    "> ",
  ]);
  assert.deepEqual(result.value.caret, { row: 1, column: 2 });
});

test("keeps tool identity, risk, and approval state visible in two rows", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(2, "change")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="src/index.ts" content=<8 code units>',
        approvalRequired: true,
        callId: "call-2",
        kind: "toolRequested" as const,
        name: "replace_text",
        risk: "write" as const,
        turnId: 2,
      }),
    ).ok,
  );

  const result = createChatFrame(application, viewport(40, 2));

  assert.ok(result.ok);
  assert.equal(result.value.lines.at(0)?.includes("replace_text"), true);
  assert.equal(result.value.lines.at(0)?.includes("write"), true);
  assert.equal(result.value.lines.at(0)?.includes("approval"), true);
  assert.equal(result.value.lines.at(1), "> ");
});

test("renders a tail-anchored prospective transcript through text safety", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "unsafe\u001Bpartial",
      turnId: 1,
    }),
  );

  const result = createChatFrame(application, viewport(40, 7));

  assert.ok(result.ok);
  assert.equal(result.value.lines.join("\n").includes("\u001B"), false);
  assert.equal(result.value.lines.join("\n").includes("unsafe?partial"), true);
  assert.equal(result.value.lines.at(-1), "> ");
  assert.equal(result.value.caret?.row, result.value.lines.length - 1);
});

test("shows completed chat and idle phase without product concepts in TUI", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(1, "question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "answer",
      turnId: 1,
    }),
  );
  application.applyRuntime(
    Object.freeze({
      assistant: Object.freeze({ content: "answer" }),
      checkpointed: false,
      cleanup: Object.freeze([]),
      kind: "turnPrepared" as const,
      turnId: 1,
    }) as never,
  );
  application.turnCommitResolved(
    1,
    Object.freeze({ kind: "committed" as const }),
  );

  const result = createChatFrame(application, viewport(40, 8));

  assert.ok(result.ok);
  assert.equal(result.value.lines.join("\n").includes("agent - ready"), true);
  assert.equal(result.value.lines.join("\n").includes("question"), true);
  assert.equal(result.value.lines.join("\n").includes("answer"), true);
});
