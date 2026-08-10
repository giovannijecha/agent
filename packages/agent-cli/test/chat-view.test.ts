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
  assert.deepEqual(result.value.rows.map((row) => row.text), [""]);
  assert.deepEqual(result.value.rows.at(0)?.spans, []);
  assert.deepEqual(result.value.caret, { row: 0, column: 0 });
});

test("keeps status directly above the final prompt on a short viewport", () => {
  const application = new ApplicationController(false);
  const result = createChatFrame(application, viewport(40, 2));

  assert.ok(result.ok);
  assert.deepEqual(result.value.rows.map((row) => row.text), [
    "No model or tools are configured.",
    "> ",
  ]);
  assert.deepEqual(
    result.value.rows.map((row) => row.spans.at(0)?.tone),
    ["muted", "accent"],
  );
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
  assert.equal(result.value.rows.at(0)?.text.includes("replace_text"), true);
  assert.equal(result.value.rows.at(0)?.text.includes("write"), true);
  assert.equal(result.value.rows.at(0)?.text.includes("approval"), true);
  assert.equal(result.value.rows.at(1)?.text, "> ");
  assert.deepEqual(
    result.value.rows.map((row) => row.spans.at(0)?.tone),
    ["attention", "accent"],
  );
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
  const lines = result.value.rows.map((row) => row.text);
  assert.equal(lines.join("\n").includes("\u001B"), false);
  assert.equal(lines.join("\n").includes("unsafe?partial"), true);
  const partialRow = lines.findIndex((line) =>
    line.includes("unsafe?partial"),
  );
  assert.equal(
    result.value.rows.at(partialRow)?.spans.at(0)?.tone,
    "plain",
  );
  assert.equal(result.value.rows.at(-1)?.text, "> ");
  assert.equal(result.value.caret?.row, result.value.rows.length - 1);
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
  const lines = result.value.rows.map((row) => row.text);
  assert.equal(lines.join("\n").includes("agent  ready"), true);
  assert.deepEqual(
    result.value.rows.at(0)?.spans.map((span) => span.tone),
    ["accent", "muted"],
  );
  assert.equal(lines.join("\n").includes("question"), true);
  assert.equal(lines.join("\n").includes("answer"), true);
});
