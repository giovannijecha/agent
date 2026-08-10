import assert from "node:assert/strict";
import test from "node:test";

import type { StartedTurn } from "@agent/runtime";
import { ok, type Frame, type Result, Viewport } from "@agent/tui";

import { ApplicationController } from "../dist/application.js";
import { createChatRender } from "../dist/chat-view.js";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function createChatFrame(
  application: ApplicationController,
  size: Viewport,
): Result<Frame, unknown> {
  const rendered = createChatRender(application, size);
  return rendered.ok ? ok(rendered.value.frame) : rendered;
}

test("exposes exact transcript geometry with the planned chat frame", () => {
  const application = new ApplicationController(false);
  const rendered = createChatRender(application, viewport(40, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.transcript, {
    contentRows: 0,
    viewportRows: 0,
  });
});

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
    " No model or tools are configured.",
    " \u2192 ",
  ]);
  assert.equal(result.value.rows.at(0)?.spans.at(1)?.tone, "muted");
  assert.equal(
    result.value.rows.at(1)?.spans.every((span) => span.tone === "plain"),
    true,
  );
  assert.deepEqual(result.value.caret, { row: 1, column: 3 });
});

test("composes one framed prompt and one truthful semantic footer", () => {
  const application = new ApplicationController(true, {
    authentication: "memory-only API key",
    displayName: "OpenCode Go",
    model: "configured-model",
  });
  const result = createChatRender(application, viewport(44, 8));

  assert.ok(result.ok);
  const rows = result.value.frame.rows.map((row) => row.text);
  const border = " " + "┌" + "─".repeat(40) + "┐";
  const closingBorder = " " + "└" + "─".repeat(40) + "┘";
  assert.equal(rows.filter((row) => row === border).length, 1);
  assert.equal(rows.filter((row) => row === closingBorder).length, 1);
  assert.equal(rows.some((row) => row.startsWith(" │ \u2192 ") && row.endsWith("│")), true);
  assert.equal(rows.at(-1)?.trimStart().startsWith("OpenCode Go / configured-model"), true);
  assert.equal(rows.at(-1)?.endsWith("ready"), true);
  assert.equal(rows.join("\n").split("OpenCode Go").length - 1, 1);
  assert.equal(rows.join("\n").includes("/help"), false);
  assert.equal(rows.join("\n").includes("agent"), false);
  assert.equal(rows.some((row) => row.includes("Ready. Use")), false);
  assert.equal(result.value.frame.rows.at(-1)?.spans.at(-1)?.tone, "success");
  assert.deepEqual(result.value.transcript, {
    contentRows: 0,
    viewportRows: 4,
  });
});

test("renders every tool through one canonical contextual activity block", () => {
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
  assert.equal(
    result.value.rows.at(0)?.text,
    "                        /approve  /deny",
  );
  assert.equal(result.value.rows.at(1)?.text, " \u2192 ");
  assert.deepEqual(
    result.value.rows.at(0)?.spans.map((span) => span.tone),
    ["plain", "attention"],
  );
  assert.equal(
    result.value.rows.map((row) => row.text).join("\n").includes("call-2"),
    false,
  );
});

test("keeps the activity lifecycle state visible in a narrow viewport", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(5, "change")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="src/index.ts" content=<8 code units>',
        approvalRequired: true,
        callId: "private-call-5",
        kind: "toolRequested" as const,
        name: "replace_text",
        risk: "write" as const,
        turnId: 5,
      }),
    ).ok,
  );

  const result = createChatFrame(application, viewport(20, 2));

  assert.ok(result.ok);
  assert.equal(result.value.rows.at(0)?.text, "    /approve  /deny");
  assert.equal(result.value.rows.at(0)?.text.includes("/approve"), true);
  assert.equal(result.value.rows.at(1)?.text, " \u2192 ");
});

test("shows the safe approval scope below the canonical activity header", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(3, "change")).ok);
  assert.ok(
    application.applyRuntime(
      Object.freeze({
        approvalPreview: 'path="src/index.ts" content=<8 code units>',
        approvalRequired: true,
        callId: "private-call-3",
        kind: "toolRequested" as const,
        name: "replace_text",
        risk: "write" as const,
        turnId: 3,
      }),
    ).ok,
  );

  const result = createChatFrame(application, viewport(48, 12));

  assert.ok(result.ok);
  const rows = result.value.rows.map((row) => row.text);
  const topBorder = " " + "┌" + "─".repeat(44) + "┐";
  const bottomBorder = " " + "└" + "─".repeat(44) + "┘";
  assert.equal(rows.filter((row) => row === topBorder).length, 2);
  assert.equal(rows.filter((row) => row === bottomBorder).length, 3);
  assert.equal(rows.some((row) => row.includes("/approve  /deny")), true);
  assert.equal(rows.some((row) => row.includes("replace_text")), true);
  assert.equal(rows.some((row) => row.includes("scope  path=\"src/index.ts\"")), true);
  assert.equal(rows.join("\n").includes("private-call-3"), false);
  const approvalName = result.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("replace_text"));
  assert.equal(approvalName?.tone, "attention");
});

test("keeps the newest activity header when the activity viewport collapses", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(4, "inspect")).ok);
  for (const [callId, name] of [
    ["private-old", "read_file"],
    ["private-new", "list_directory"],
  ] as const) {
    assert.ok(
      application.applyRuntime(
        Object.freeze({
          approvalPreview: "",
          approvalRequired: false,
          callId,
          kind: "toolRequested" as const,
          name,
          risk: "read" as const,
          turnId: 4,
        }),
      ).ok,
    );
    assert.ok(
      application.applyRuntime(
        Object.freeze({
          callId,
          kind: "toolStarted" as const,
          name,
          risk: "read" as const,
          turnId: 4,
        }),
      ).ok,
    );
    assert.ok(
      application.applyRuntime(
        Object.freeze({
          callId,
          kind: "toolFinished" as const,
          name,
          risk: "read" as const,
          status: "success" as const,
          turnId: 4,
        }),
      ).ok,
    );
  }

  const result = createChatFrame(application, viewport(48, 4));

  assert.ok(result.ok);
  const rows = result.value.rows.map((row) => row.text);
  assert.equal(rows.some((row) => row.includes("list_directory")), true);
  assert.equal(rows.some((row) => row.includes("read_file")), false);
  assert.equal(rows.join("\n").includes("private-"), false);
  const successSpans = result.value.rows
    .flatMap((row) => row.spans)
    .filter((span) => span.text.includes("list_directory"));
  assert.deepEqual(successSpans.map((span) => span.tone), ["success"]);
});

test("renders failed tool truth through the shared failure tone", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(6, "inspect")).ok);
  for (const event of [
    Object.freeze({
      approvalPreview: "",
      approvalRequired: false,
      callId: "private-failed",
      kind: "toolRequested" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 6,
    }),
    Object.freeze({
      callId: "private-failed",
      kind: "toolStarted" as const,
      name: "read_file",
      risk: "read" as const,
      turnId: 6,
    }),
    Object.freeze({
      callId: "private-failed",
      kind: "toolFinished" as const,
      name: "read_file",
      risk: "read" as const,
      status: "failure" as const,
      turnId: 6,
    }),
  ]) {
    assert.ok(application.applyRuntime(event).ok);
  }

  const result = createChatFrame(application, viewport(48, 8));

  assert.ok(result.ok);
  const failureSpans = result.value.rows
    .flatMap((row) => row.spans)
    .filter((span) => span.text === "read_file" || span.text === "failed");
  assert.deepEqual(failureSpans.map((span) => span.tone), ["failure", "failure"]);
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

  const result = createChatFrame(application, viewport(40, 8));

  assert.ok(result.ok);
  const lines = result.value.rows.map((row) => row.text);
  assert.equal(lines.join("\n").includes("\u001B"), false);
  assert.equal(lines.join("\n").includes("unsafe?partial"), true);
  const partialRow = lines.findIndex((line) =>
    line.includes("unsafe?partial"),
  );
  assert.equal(
    result.value.rows.at(partialRow)?.spans.at(-1)?.tone,
    "plain",
  );
  const promptRow = lines.findIndex((line) => line.startsWith(" │ \u2192 "));
  assert.equal(promptRow >= 0, true);
  assert.equal(result.value.caret?.row, promptRow);
  assert.equal(lines.at(-1)?.trim(), "generating");
  assert.equal(result.value.rows.at(-1)?.spans.at(-1)?.tone, "attention");
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

  const result = createChatFrame(application, viewport(40, 12));

  assert.ok(result.ok);
  const lines = result.value.rows.map((row) => row.text);
  assert.equal(lines.at(-1)?.trim(), "ready");
  assert.equal(lines.join("\n").includes("/help"), false);
  assert.equal(result.value.rows.at(-1)?.spans.at(-1)?.tone, "success");
  assert.equal(lines.join("\n").includes("question"), true);
  assert.equal(lines.join("\n").includes("answer"), true);
});

test("renders the owned Markdown subset only through transcript semantics", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(8, "question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "**strong** and `code`",
      turnId: 8,
    }),
  );

  const result = createChatFrame(application, viewport(40, 8));

  assert.ok(result.ok);
  const row = result.value.rows.find((candidate) =>
    candidate.text.includes("strong and code"),
  );
  assert.deepEqual(
    row?.spans.map((span) => ({ text: span.text, tone: span.tone })),
    [
      { text: " ", tone: "plain" },
      { text: "│ ", tone: "muted" },
      { text: "strong", tone: "emphasis" },
      { text: " and ", tone: "plain" },
      { text: "code", tone: "emphasis" },
    ],
  );
  assert.equal(
    result.value.rows.some((candidate) =>
      candidate.spans.some(
        (span) => span.tone === "accent" && span.text.includes("strong"),
      ),
    ),
    false,
  );
});

test("keeps an incomplete streamed delimiter literal until it closes", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(9, "question"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "**partial",
      turnId: 9,
    }),
  );

  const incomplete = createChatFrame(application, viewport(40, 8));
  assert.ok(incomplete.ok);
  const literal = incomplete.value.rows.find((candidate) =>
    candidate.text.includes("**partial"),
  );
  assert.deepEqual(literal?.spans.map((span) => span.tone), [
    "plain",
    "muted",
    "plain",
  ]);

  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "**",
      turnId: 9,
    }),
  );
  const complete = createChatFrame(application, viewport(40, 8));
  assert.ok(complete.ok);
  const emphasized = complete.value.rows.find(
    (candidate) => candidate.text.includes("partial"),
  );
  assert.equal(emphasized?.spans.at(-1)?.tone, "emphasis");
});

test("isolates fenced Markdown at every transcript message boundary", () => {
  const application = new ApplicationController(true);
  application.turnAccepted(started(10, "```ts\nvalue"));
  application.applyRuntime(
    Object.freeze({
      kind: "assistantDelta" as const,
      text: "```\n**answer**",
      turnId: 10,
    }),
  );

  const result = createChatFrame(application, viewport(40, 12));

  assert.ok(result.ok);
  const answer = result.value.rows.find(
    (candidate) => candidate.text.includes("answer"),
  );
  assert.equal(
    result.value.rows.some((candidate) =>
      candidate.text.trim() === "agent" || candidate.text.trim() === "you"
    ),
    false,
  );
  assert.equal(answer?.spans.at(-1)?.tone, "emphasis");
});

test("navigates long transcript history and visibly resumes follow-end", () => {
  const application = new ApplicationController(true);
  const question = Array.from(
    { length: 20 },
    (_, index) => "line-" + String(index + 1).padStart(2, "0"),
  ).join("\n");
  assert.ok(application.turnAccepted(started(11, question)).ok);

  const initial = createChatRender(application, viewport(32, 12));
  assert.ok(initial.ok);
  assert.ok(
    application.observeTranscriptGeometry(
      initial.value.transcript.contentRows,
      initial.value.transcript.viewportRows,
    ).ok,
  );
  assert.equal(
    initial.value.frame.rows.some((row) => row.text.includes("line-20")),
    true,
  );
  const initialTranscriptLines = initial.value.frame.rows
    .map((row) => row.text)
    .filter((line) => line.includes("line-"));

  const pageUp = application.feed("\u001B[5~").actions.at(0);
  assert.ok(pageUp !== undefined);
  assert.equal(application.applySessionAction(pageUp).redraw, true);
  const history = createChatRender(application, viewport(32, 12));
  assert.ok(history.ok);
  assert.ok(
    application.observeTranscriptGeometry(
      history.value.transcript.contentRows,
      history.value.transcript.viewportRows,
    ).ok,
  );
  assert.equal(
    history.value.frame.rows.at(-1)?.text.trim(),
    "generating  history",
  );
  assert.equal(
    history.value.frame.rows.some((row) => row.text.includes("line-20")),
    false,
  );
  assert.equal(
    history.value.frame.rows.some((row) => row.text.includes("line-14")),
    true,
  );
  const historyTranscriptLines = history.value.frame.rows
    .map((row) => row.text)
    .filter((line) => line.includes("line-"));
  assert.equal(
    historyTranscriptLines.at(-1),
    initialTranscriptLines.at(0),
  );

  for (let count = 0; count < 8 && application.viewingHistory; count += 1) {
    const pageDown = application.feed("\u001B[6~").actions.at(0);
    assert.ok(pageDown !== undefined);
    application.applySessionAction(pageDown);
  }
  const latest = createChatRender(application, viewport(32, 12));
  assert.ok(latest.ok);
  assert.equal(application.viewingHistory, false);
  assert.equal(
    latest.value.frame.rows.some((row) => row.text.includes("history")),
    false,
  );
  assert.equal(
    latest.value.frame.rows.some((row) => row.text.includes("line-20")),
    true,
  );
});

test("keeps the prompt above history chrome in a one-row viewport", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(12, "line-1\nline-2\nline-3")).ok);
  assert.ok(application.observeTranscriptGeometry(20, 5).ok);
  const pageUp = application.feed("\u001B[5~").actions.at(0);
  assert.ok(pageUp !== undefined);
  application.applySessionAction(pageUp);
  assert.equal(application.viewingHistory, true);

  const rendered = createChatRender(application, viewport(16, 1));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.frame.rows.map((row) => row.text), [" \u2192 "]);
  assert.equal(
    rendered.value.frame.rows.some((row) => row.text.includes("history")),
    false,
  );
  assert.deepEqual(rendered.value.transcript, {
    contentRows: 5,
    viewportRows: 0,
  });
});
