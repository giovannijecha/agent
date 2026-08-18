import assert from "node:assert/strict";
import test from "node:test";

import type { StartedTurn } from "@agent/runtime";
import {
  type Frame,
  type MotionPhase,
  RichRow,
  type Result,
  TextSpan,
  Viewport,
  ok,
} from "@agent/tui";

import { ApplicationController } from "../dist/application.js";
import { projectCurrentActivity } from "../dist/activity-view.js";
import { createChatRender } from "../dist/chat-view.js";
import { CONVERSATION_DENSITY } from "../dist/conversation-density.js";
import { createConversationDocument } from "../dist/conversation-view.js";

function configuredProviders() {
  return Object.freeze([
    Object.freeze({
      configured: true,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "memory-only API key",
        displayName: "Ollama Cloud",
        model: "qwen3-coder:480b-cloud",
      }),
      ready: true,
      selected: true,
    }),
  ]);
}

function unconfiguredProviders() {
  return Object.freeze([
    Object.freeze({
      configured: false,
      id: "ollamaCloud" as const,
      presentation: Object.freeze({
        authentication: "memory-only API key",
        displayName: "Ollama Cloud",
        model: undefined,
      }),
      ready: false,
      selected: false,
    }),
  ]);
}

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function isComposerRule(row: RichRow | undefined): boolean {
  return (
    row !== undefined &&
    row.spans.some(
      (span) => span.tone === "accent" && span.text.includes("─"),
    ) &&
    row.spans.every((span) => span.surface === "none")
  );
}

function hasSideRail(row: RichRow | undefined): boolean {
  return (
    row !== undefined &&
    row.spans.some(
      (span) => span.text === "\u258c" && span.tone === "muted",
    ) &&
    row.spans.every((span) => span.surface === "none")
  );
}

function isActivityRow(
  row: RichRow,
  action: string,
  state: string,
): boolean {
  return (
    (row.text.includes("\u2022 " + action) || row.text.includes("x " + action)) &&
    row.text.trim().endsWith(state)
  );
}

function frame(
  application: ApplicationController,
  columns: number,
  rows: number,
  motionPhase: MotionPhase = 0,
): Result<Frame, unknown> {
  const rendered = createChatRender(
    application,
    viewport(columns, rows),
    motionPhase,
  );
  return rendered.ok ? ok(rendered.value.frame) : rendered;
}

test("projects a smooth fixed-width active-work pulse on the composer edge", () => {
  const application = new ApplicationController(true, configuredProviders());
  assert.ok(application.turnAccepted(started(91, "question")).ok);

  const frames = ([0, 1, 2, 3, 4, 5] as const).map((phase) => {
    const result = frame(application, 72, 18, phase);
    assert.ok(result.ok);
    return result.value;
  });
  const rendered = frames.map((current) => current.rows.at(-1));

  assert.equal(new Set(rendered.map((row) => row?.text)).size, 1);
  assert.equal(rendered[0]?.text.includes("generating"), false);
  assert.equal(rendered[0]?.text.includes("working"), false);
  assert.equal(rendered[0]?.cellWidth, 71);
  assert.equal(rendered[0]?.text.endsWith("\u2022\u2022\u2022"), true);
  const composer = frames[0]?.rows.at(frames[0]?.caret?.row ?? -1);
  assert.equal(composer?.cellWidth, rendered[0]?.cellWidth);
  assert.equal(composer?.spans.at(-1)?.surface, "none");
  assert.equal(
    rendered[0]?.text.lastIndexOf("\u2022"),
    (composer?.cellWidth ?? 0) - 1,
  );
  assert.deepEqual(
    rendered.map((row) =>
      row?.spans
        .flatMap((span) =>
          [...span.text]
            .filter((character) => character === "\u2022")
            .map(() => span.tone),
        ),
    ),
    [
      ["muted", "muted", "muted"],
      ["plain", "muted", "muted"],
      ["attention", "plain", "muted"],
      ["plain", "attention", "plain"],
      ["muted", "plain", "attention"],
      ["muted", "muted", "plain"],
    ],
  );
});

function started(
  turnId: number,
  content: string,
  historyParentNodeId = 0,
): StartedTurn {
  return Object.freeze({
    historyParentNodeId,
    turnId,
    user: Object.freeze({ content }),
  }) as unknown as StartedTurn;
}

function settleDisplayTurn(
  application: ApplicationController,
  turnId: number,
  user: string,
  assistant: string,
  historyParentNodeId: number,
  historyNodeId: number,
): void {
  assert.ok(application.turnAccepted(
    started(turnId, user, historyParentNodeId),
  ).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: assistant,
    turnId,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: assistant }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId,
  }) as never).ok);
  assert.ok(application.turnCommitResolved(turnId, Object.freeze({
    historyNodeId,
    kind: "committed" as const,
  })).ok);
}

function requestTool(
  application: ApplicationController,
  options: Readonly<{
    approval: boolean;
    callId: string;
    name: string;
    preview?: string;
    risk: "execute" | "read" | "write";
    turnId: number;
  }>,
): void {
  const requested = application.applyRuntime(
    Object.freeze({
      approvalPreview: options.preview ?? "",
      approvalRequired: options.approval,
      callId: options.callId,
      kind: "toolRequested" as const,
      name: options.name,
      risk: options.risk,
      turnId: options.turnId,
    }),
  );
  assert.ok(requested.ok);
}

test("owns one frozen conversation density policy", () => {
  assert.deepEqual(CONVERSATION_DENSITY, {
    contentInsetCells: 1,
    flushCells: 0,
    flushRows: 0,
    composerRuleRows: 1,
    interactionDockMaximumRows: 6,
    rhythmRows: 1,
  });
  assert.equal(Object.isFrozen(CONVERSATION_DENSITY), true);
});

test("keeps an empty session visually empty", () => {
  const application = new ApplicationController(false);
  const rendered = createChatRender(application, viewport(72, 24));

  assert.ok(rendered.ok);
  const rows = rendered.value.frame.rows;
  const text = rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("A quiet, single-agent workspace"), false);
  assert.equal(text.includes("Start with"), false);
  assert.equal(text.includes("Connect an authorized provider"), false);
  assert.equal(text.includes("you\n"), false);
  assert.equal(text.includes("agent\n"), false);
  assert.equal(rendered.value.transcript.contentRows, 0);
  assert.equal(text.includes("\u203a"), false);
  assert.equal(text.includes("\u250c"), false);
  assert.equal(text.includes("\u2514"), false);
  const caretRow = rendered.value.frame.caret?.row ?? -1;
  assert.equal(isComposerRule(rows.at(caretRow - 1)), true);
  assert.equal(isComposerRule(rows.at(caretRow + 1)), true);
  assert.equal(
    rows.at(caretRow)?.spans.every((span) => span.surface === "none"),
    true,
  );
});

test("renders the bounded timeline as an idle branch selector", () => {
  const application = new ApplicationController(true);
  settleDisplayTurn(
    application,
    1,
    "root question",
    "root answer",
    0,
    1,
  );
  settleDisplayTurn(
    application,
    2,
    "original question",
    "original answer",
    1,
    2,
  );
  application.feed("/timeline\r");

  const rendered = createChatRender(application, viewport(72, 20));
  assert.ok(rendered.ok);
  const text = rendered.value.frame.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("Timeline"), true);
  assert.equal(text.includes("current process"), true);
  assert.equal(text.includes("root"), true);
  assert.equal(text.includes("#1 root question"), true);
  assert.equal(text.includes("#2 original question"), true);
  assert.equal(text.includes("active"), true);
});

test("windows timeline rows beyond the generic selection-list bound", () => {
  const application = new ApplicationController(true);
  for (let turnId = 1; turnId <= 32; turnId += 1) {
    settleDisplayTurn(
      application,
      turnId,
      "question-" + turnId.toString(10),
      "answer-" + turnId.toString(10),
      turnId - 1,
      turnId,
    );
  }
  application.feed("/timeline\r");

  const rendered = createChatRender(application, viewport(72, 20));
  assert.ok(rendered.ok);
  const text = rendered.ok
    ? rendered.value.frame.rows.map((row) => row.text).join("\n")
    : "";
  assert.equal(text.includes("Timeline"), true);
  assert.equal(text.includes("current process 33-33/33"), true);
  assert.equal(text.includes("#32 question-32"), true);
  assert.equal(text.includes("active"), true);

  for (let index = 0; index < 32; index += 1) {
    application.applySessionAction(Object.freeze({
      direction: "previous" as const,
      kind: "moveContextSelection" as const,
    }));
  }
  const rootWindow = createChatRender(application, viewport(72, 20));
  assert.ok(rootWindow.ok);
  const rootText = rootWindow.ok
    ? rootWindow.value.frame.rows.map((row) => row.text).join("\n")
    : "";
  assert.equal(rootText.includes("current process 1-32/33"), true);
  assert.equal(rootText.includes("root"), true);
});

test("renders one ruled composer and the exact canonical workspace root", () => {
  const canonicalWorkspaceRoot = "/owned/workspace";
  const application = new ApplicationController(
    true,
    configuredProviders(),
    canonicalWorkspaceRoot,
  );
  application.feed("draft");

  const rendered = frame(application, 96, 18);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const composer = rows.find((row) => row.text.includes("draft"));
  const composerIndex = composer === undefined ? -1 : rows.indexOf(composer);
  assert.equal(rows.some((row) => row.text.includes("\u250c")), false);
  assert.equal(rows.some((row) => row.text.includes("\u2514")), false);
  assert.ok(composerIndex > 0);
  assert.equal(isComposerRule(rows.at(composerIndex - 1)), true);
  assert.equal(isComposerRule(rows.at(composerIndex + 1)), true);
  assert.equal(composer?.text.includes("\u203a"), false);
  assert.equal(
    composer?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    composer?.spans.find((span) => span.text.includes("draft"))?.tone,
    "plain",
  );
  assert.equal(
    rows.slice(composerIndex + 2)
      .some((row) => row.text.includes("\u2500".repeat(20))),
    false,
  );
  assert.equal(rows[composerIndex + 2]?.text.trim(), "");
  assert.equal(
    rows[composerIndex + 2]?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(rows.at(-1)?.text.includes(canonicalWorkspaceRoot), true);
  assert.equal(rows.at(-1)?.text.indexOf(canonicalWorkspaceRoot), 1);
  assert.equal(
    rows.at(-1)?.text.includes("Ollama Cloud \u00b7 qwen3-coder:480b-cloud"),
    true,
  );
  assert.equal(
    rows.at(-1)?.text.indexOf("Ollama Cloud \u00b7 qwen3-coder:480b-cloud"),
    (() => {
      const name = TextSpan.create("Ollama Cloud", "plain");
      const model = TextSpan.create(" \u00b7 qwen3-coder:480b-cloud", "muted");
      assert.ok(name.ok);
      assert.ok(model.ok);
      const center = RichRow.create([name.value, model.value]);
      assert.ok(center.ok);
      return Math.floor((96 - center.value.cellWidth) / 2);
    })(),
  );
  assert.equal(rows.at(-1)?.text.includes("ready"), false);
  assert.equal(rows.at(-1)?.text.includes("\u2022"), false);
});

test("grows the composer for wrapped and pasted lines without displacing the footer", () => {
  const canonicalWorkspaceRoot = "/owned/workspace";
  const application = new ApplicationController(
    false,
    undefined,
    canonicalWorkspaceRoot,
  );
  application.feed(
    "\u001B[200~first line\nsecond line that wraps\nthird line\u001B[201~",
  );

  const rendered = frame(application, 24, 16);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const text = rows.map((row) => row.text);

  assert.equal(text.some((row) => row.includes("first line")), true);
  assert.equal(text.some((row) => row.includes("second line that")), true);
  assert.equal(text.some((row) => row.includes("wraps")), true);
  assert.equal(text.some((row) => row.includes("third line")), true);
  const composerRuleIndexes = rows
    .map((row, index) => (isComposerRule(row) ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(composerRuleIndexes.length, 2);
  const composerTop = composerRuleIndexes.at(0);
  const composerBottom = composerRuleIndexes.at(1);
  assert.equal(composerTop === undefined, false);
  assert.equal(composerBottom === undefined, false);
  if (composerTop !== undefined && composerBottom !== undefined) {
    assert.equal(composerBottom - composerTop + 1, 6);
    assert.equal(
      rows
        .slice(composerTop + 1, composerBottom)
        .every((row) => row.spans.every((span) => span.surface === "none")),
      true,
    );
  }
  assert.equal(rows.at(-1)?.text.includes(canonicalWorkspaceRoot), true);
  assert.equal(rendered.value.caret !== undefined, true);
});

test("keeps a valid caret as the only one-cell priority", () => {
  const application = new ApplicationController(false);
  application.feed("draft");

  const rendered = frame(application, 1, 1);
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [" "]);
  assert.deepEqual(rendered.value.caret, { row: 0, column: 0 });
});

test("uses one transparent accented italic user region and one unboxed assistant turn", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "question")).ok);
  assert.ok(
    application.applyRuntime({
      kind: "assistantDelta",
      text: "**answer**",
      turnId: 1,
    }).ok,
  );

  const rendered = frame(application, 48, 20);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const user = rows.find((row) => row.text.includes("question"));
  const assistant = rows.find((row) => row.text.includes("answer"));
  const userContent = user?.spans.filter((span) => span.text.includes("question"));
  const userIndex = user === undefined ? -1 : rows.indexOf(user);
  const userColumn = user?.text.indexOf("question") ?? -1;
  const assistantColumn = assistant?.text.indexOf("answer") ?? -1;
  assert.equal(userColumn, assistantColumn);
  assert.equal(userColumn, rendered.value.caret?.column);
  assert.equal(userColumn >= CONVERSATION_DENSITY.contentInsetCells, true);
  assert.equal(user?.text.trimEnd().endsWith("question"), true);
  assert.equal(hasSideRail(user), false);
  assert.equal(
    userContent?.every((span) => span.slant === "italic"),
    true,
  );
  assert.equal(
    userContent?.every((span) => span.tone === "accent"),
    true,
  );
  assert.equal(
    user?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(user?.text.includes("\u203a"), false);
  assert.equal(rows.some((row) => hasSideRail(row)), false);
  assert.equal(hasSideRail(rows[userIndex - 1]), false);
  assert.equal(hasSideRail(rows[userIndex + 1]), false);
  assert.equal(assistant?.text.trim(), "answer");
  assert.equal(
    assistant?.spans.find((span) => span.text.includes("answer"))?.tone,
    "emphasis",
  );
  assert.equal(
    assistant?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(rows.some((row) => row.text.trim() === "you"), false);
  assert.equal(rows.some((row) => row.text.trim() === "agent"), false);
});

test("paints copied Latin prose completely in user and composer regions", () => {
  const content = "perch\u00e9 l\u2019agent";
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(2, content)).ok);
  application.feed("\u001B[200~" + content + "\u001B[201~");

  const rendered = frame(application, 48, 14);

  assert.ok(rendered.ok);
  const contentRows = rendered.value.rows.filter((row) =>
    row.text.includes(content),
  );
  assert.equal(contentRows.length, 2);
  assert.equal(
    contentRows.every((row) => row.text.length === row.cellWidth),
    true,
  );
  assert.equal(contentRows.some((row) => hasSideRail(row)), false);
  const user = contentRows.find((row) =>
    row.spans.some(
      (span) => span.text.includes(content) && span.slant === "italic",
    )
  );
  const composerRow = contentRows.find((row) => row !== user);
  assert.ok(user !== undefined);
  assert.ok(composerRow !== undefined);
  assert.equal(
    user.spans
      .filter((span) => span.text.includes(content))
      .every((span) => span.slant === "italic"),
    true,
  );
  assert.equal(
    user.spans
      .filter((span) => span.text.includes(content))
      .every((span) => span.tone === "accent"),
    true,
  );
  assert.equal(user.spans.every((span) => span.surface === "none"), true);
  assert.equal(
    composerRow.spans.every((span) => span.surface === "none"),
    true,
  );
  const composer = rendered.value.rows.at(rendered.value.caret?.row ?? -1);
  assert.ok(composer !== undefined);
  assert.equal(
    rendered.value.caret?.column,
    composer.text.indexOf(content) + content.length,
  );
});

test("frames multiline user turns without rails and with accented prose", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(4, "first line\nsecond line")).ok);

  const rendered = frame(application, 48, 14);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const first = rows.findIndex((row) => row.text.includes("first line"));
  const second = rows.findIndex((row) => row.text.includes("second line"));
  assert.ok(first >= 0);
  assert.equal(second, first + 1);
  assert.equal(hasSideRail(rows[first]), false);
  assert.equal(hasSideRail(rows[second]), false);
  assert.equal(rows.some((row) => hasSideRail(row)), false);
  assert.equal(
    rows[first]?.spans
      .filter((span) => span.text.includes("first line"))
      .every((span) => span.slant === "italic"),
    true,
  );
  assert.equal(
    rows[first]?.spans
      .filter((span) => span.text.includes("first line"))
      .every((span) => span.tone === "accent"),
    true,
  );
  assert.equal(
    rows[second]?.spans
      .filter((span) => span.text.includes("second line"))
      .every((span) => span.slant === "italic"),
    true,
  );
  assert.equal(
    rows[second]?.spans
      .filter((span) => span.text.includes("second line"))
      .every((span) => span.tone === "accent"),
    true,
  );
  assert.equal(hasSideRail(rows[first - 1]), false);
  assert.equal(hasSideRail(rows[second + 1]), false);
});

test("keeps registered Markdown tones authoritative inside accented user prose", () => {
  const application = new ApplicationController(true);
  assert.ok(
    application.turnAccepted(
      started(41, "ordinary **strong** and `literal`"),
    ).ok,
  );

  const rendered = frame(application, 48, 14);
  assert.ok(rendered.ok);
  const row = rendered.value.rows.find((candidate) =>
    candidate.text.includes("ordinary strong and literal")
  );
  assert.ok(row !== undefined);
  assert.equal(hasSideRail(row), false);
  assert.equal(row.spans.find((span) => span.text.includes("ordinary"))?.tone, "accent");
  assert.equal(row.spans.find((span) => span.text === "strong")?.tone, "emphasis");
  assert.equal(row.spans.find((span) => span.text.includes("literal"))?.tone, "accent");
  assert.equal(
    row.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.slant === "italic"),
    true,
  );
});

test("applies compact transparent activity and external rhythm at wide and medium sizes", () => {
  for (const [columns, rowCount] of [[72, 22], [48, 14]] as const) {
    const application = new ApplicationController(true);
    assert.ok(application.turnAccepted(started(5, "question")).ok);
    requestTool(application, {
      approval: false,
      callId: "density-read",
      name: "read_file",
      risk: "read",
      turnId: 5,
    });
    application.feed("draft");

    const rendered = frame(application, columns, rowCount);
    assert.ok(rendered.ok);
    const rows = rendered.value.rows;
    const activityIndexes = rows
      .map((row, index) =>
        isActivityRow(row, "Read", "queued") ? index : -1,
      )
      .filter((index) => index >= 0);
    const userIndex = rows.findIndex((row) => row.text.includes("question"));
    const composerTop = (rendered.value.caret?.row ?? 0) - 1;
    const firstActivity = activityIndexes.at(0);
    const lastActivity = activityIndexes.at(-1);

    assert.equal(rows.some((row) => hasSideRail(row)), false);
    assert.equal(activityIndexes.length, 1);
    assert.ok(userIndex >= 0);
    assert.ok(firstActivity !== undefined);
    assert.ok(lastActivity !== undefined);
    assert.equal(isComposerRule(rows.at(composerTop)), true);
    assert.equal(isComposerRule(rows.at(composerTop + 2)), true);
    assert.equal(
      rows.at(composerTop + 1)?.spans.every(
        (span) => span.surface === "none",
      ),
      true,
    );
    assert.equal(rows[firstActivity - 1]?.text.trim(), "");
    assert.equal(
      rows[firstActivity - 1]?.spans.every(
        (span) => span.surface === "none",
      ),
      true,
    );
    assert.equal(rows[lastActivity + 1]?.text.trim(), "");
    assert.equal(composerTop, lastActivity + 2);
    assert.equal(
      rows[firstActivity]?.spans.every((span) => span.surface === "none"),
      true,
    );
  }
});

test("keeps required compact content and the caret in a short viewport", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(6, "question")).ok);
  requestTool(application, {
    approval: false,
    callId: "short-density-read",
    name: "read_file",
    risk: "read",
    turnId: 6,
  });
  application.feed("draft");

  const rendered = createChatRender(application, viewport(24, 8));
  assert.ok(rendered.ok);
  const rows = rendered.value.frame.rows;
  const activityRows = rows.filter((row) =>
    isActivityRow(row, "Read", "queued")
  );
  const composerTop = (rendered.value.frame.caret?.row ?? 0) - 1;
  const composerRuleIndexes = rows
    .map((row, index) =>
      index >= composerTop && isComposerRule(row) ? index : -1,
    )
    .filter((index) => index >= 0);
  assert.equal(rows.length, 8);
  assert.deepEqual(rendered.value.transcript, {
    contentRows: 1,
    startRow: 0,
    viewportRows: 2,
  });
  assert.equal(rows.some((row) => row.text.includes("question")), true);
  assert.deepEqual(rendered.value.frame.caret, { row: 5, column: 7 });
  assert.deepEqual(composerRuleIndexes, [4, 6]);
  assert.equal(
    rows.at(5)?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("\u2022 Read"), true);
  assert.equal(activityRows.at(0)?.text.includes("read_file"), false);
  assert.equal(activityRows.at(0)?.text.includes(" read "), false);
  assert.equal(activityRows.at(0)?.text.includes("queued"), true);
  assert.equal(activityRows.at(0)?.text.trim().endsWith("queued"), true);
  assert.equal(
    activityRows.every((row) => row.text.trim().length > 0),
    true,
  );
});

test("composes the maximum retained history plus an active turn within component bounds", () => {
  const entries = Array.from({ length: 128 }, (_, turn) => [
    Object.freeze({ content: "question-" + String(turn), document: turn * 2, role: "user" as const }),
    Object.freeze({ content: "answer-" + String(turn), document: turn * 2 + 1, role: "assistant" as const }),
  ]).flat();
  entries.push(Object.freeze({ content: "active-question", document: 256, role: "user" }));

  const document = createConversationDocument(entries);

  assert.ok(document.ok);
});

test("uses transparent structured regions and syntax roles for assistant output", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(8, "show code")).ok);
  assert.ok(
    application.applyRuntime({
      kind: "assistantDelta",
      text: "```ts\nconst value = 1;\n```",
      turnId: 8,
    }).ok,
  );

  const rendered = frame(application, 48, 20);
  assert.ok(rendered.ok);
  const language = rendered.value.rows.find((row) => row.text.trim() === "ts");
  const code = rendered.value.rows.find(
    (row) => row.text.trim() === "const value = 1;",
  );
  assert.equal(
    language?.spans.find((span) => span.text.includes("ts"))?.tone,
    "accent",
  );
  assert.equal(
    language?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    code?.spans.find((span) => span.text.trim() === "const")?.tone,
    "syntaxKeyword",
  );
  assert.equal(
    code?.spans.find((span) => span.text === "1")?.tone,
    "syntaxLiteral",
  );
  assert.equal(
    code?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
});

test("renders successful tools on one transparent semantic line", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(2, "inspect")).ok);
  requestTool(application, {
    approval: false,
    callId: "private-read",
    name: "list_directory",
    risk: "read",
    turnId: 2,
  });
  assert.ok(
    application.applyRuntime({
      callId: "private-read",
      kind: "toolStarted",
      name: "list_directory",
      risk: "read",
      turnId: 2,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "private-read",
      kind: "toolFinished",
      name: "list_directory",
      risk: "read",
      status: "success",
      turnId: 2,
    }).ok,
  );

  const rendered = frame(application, 64, 18);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("list_directory"), false);
  assert.equal(text.includes("succeeded"), true);
  assert.equal(text.includes("private-read"), false);
  assert.equal(text.split("┌").length - 1, 0);
  const activityRows = rendered.value.rows.filter((row) =>
    isActivityRow(row, "List", "succeeded")
  );
  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("\u2022 List"), true);
  assert.equal(activityRows.at(0)?.text.includes(" read"), false);
  assert.equal(activityRows.every((row) => !row.text.includes("│")), true);
  const state = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("succeeded"));
  const marker = activityRows.at(0)?.spans.find((span) =>
    span.text.includes("\u2022")
  );
  assert.equal(state?.tone, "success");
  assert.equal(marker?.tone, "success");
  assert.equal(
    activityRows.at(0)?.spans.every((span) => span.surface === "none"),
    true,
  );
});

test("keeps running tools compact with transparent attention truth", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(22, "verify")).ok);
  requestTool(application, {
    approval: false,
    callId: "private-run",
    name: "shell",
    risk: "execute",
    turnId: 22,
  });
  assert.ok(
    application.applyRuntime({
      callId: "private-run",
      kind: "toolStarted",
      name: "shell",
      risk: "execute",
      turnId: 22,
    }).ok,
  );

  const rendered = frame(application, 64, 18);
  assert.ok(rendered.ok);
  const activityRows = rendered.value.rows.filter((row) =>
    isActivityRow(row, "Run", "running")
  );
  const spans = activityRows.flatMap((row) => row.spans);

  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("\u2022 Run"), true);
  assert.equal(activityRows.at(0)?.text.includes("shell"), false);
  assert.equal(activityRows.at(0)?.text.includes("running"), true);
  assert.equal(activityRows.at(0)?.text.trim().endsWith("running"), true);
  assert.equal(
    spans.find((span) => span.text.includes("running"))?.tone,
    "attention",
  );
  assert.equal(
    spans.find((span) => span.text.includes("\u2022"))?.tone,
    "attention",
  );
  assert.equal(spans.every((span) => span.surface === "none"), true);
});

test("keeps completed mutation activity compact after exact permission", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(23, "change styles")).ok);
  const preview =
    "Path: index.html\n- " + "x".repeat(512) +
    "\n+ " + "y".repeat(512);
  requestTool(application, {
    approval: true,
    callId: "private-large-write",
    name: "apply_patch",
    preview,
    risk: "write",
    turnId: 23,
  });
  application.feed("\r");
  assert.ok(
    application.applyRuntime({
      callId: "private-large-write",
      kind: "toolStarted",
      name: "apply_patch",
      risk: "write",
      turnId: 23,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "private-large-write",
      kind: "toolFinished",
      name: "apply_patch",
      risk: "write",
      status: "success",
      turnId: 23,
    }).ok,
  );

  const rendered = frame(application, 72, 18);
  assert.ok(rendered.ok);
  const activityRows = rendered.value.rows.filter((row) =>
    isActivityRow(row, "Write", "succeeded")
  );
  const activityText = activityRows.map((row) => row.text).join("\n");

  assert.equal(activityRows.length, 1);
  assert.equal(activityText.includes("\u2022 Write"), true);
  assert.equal(activityText.includes("apply_patch"), false);
  assert.equal(activityText.includes("index.html"), true);
  assert.equal(activityText.includes("succeeded"), true);
  assert.equal(activityText.includes(" write "), false);
  assert.equal(activityText.includes("x".repeat(32)), false);
  assert.equal(
    activityRows.every((row) =>
      row.spans.every((span) => span.surface === "none")
    ),
    true,
  );
});

test("renders a pending permission through the shared activity and contextual selection paths", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(3, "change")).ok);
  requestTool(application, {
    approval: true,
    callId: "private-write",
    name: "apply_patch",
    preview: "Path: src/index.ts\n- old\n+ new",
    risk: "write",
    turnId: 3,
  });

  const rendered = frame(application, 72, 22);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("permission"), true);
  assert.equal(text.includes("Allow once"), true);
  assert.equal(text.includes("Allow for session"), true);
  assert.equal(text.includes("Deny"), true);
  assert.equal(text.includes("apply_patch"), false);
  assert.equal(text.includes("src/index.ts"), true);
  assert.equal(text.includes("- old"), true);
  assert.equal(text.includes("+ new"), true);
  assert.equal(text.includes("private-write"), false);
  assert.equal(text.split("┌").length - 1, 0);
  const activityRow = rendered.value.rows.find((row) =>
    isActivityRow(row, "Write", "permission")
  );
  const removed = rendered.value.rows.find((row) =>
    row.text.includes("- old")
  );
  const inserted = rendered.value.rows.find((row) =>
    row.text.includes("+ new")
  );
  assert.ok(activityRow !== undefined);
  assert.equal(activityRow.text.includes("src/index.ts"), true);
  assert.equal(activityRow.text.includes("apply_patch"), false);
  assert.equal(activityRow.text.includes(" write "), false);
  assert.equal(activityRow.text.includes("Allow once"), false);
  assert.equal(removed?.text.includes("Allow once"), false);
  assert.equal(inserted?.text.includes("Allow once"), false);
  assert.equal(
    [activityRow, removed, inserted].every((row) =>
      row?.spans.every((span) => span.surface === "none") === true
    ),
    true,
  );
  const title = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.trim() === "permission");
  const action = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("Write"));
  const detail = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("src/index.ts"));
  assert.equal(title?.tone, "attention");
  assert.equal(title?.surface, "none");
  assert.equal(action?.tone, "emphasis");
  assert.equal(action?.surface, "none");
  assert.equal(detail?.tone, "plain");
  assert.equal(detail?.surface, "none");
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .find((span) => span.text.includes("Allow once"))?.tone,
    "accent",
  );
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .find((span) => span.text.includes("- old"))?.tone,
    "diffRemoved",
  );
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .find((span) => span.text.includes("+ new"))?.tone,
    "diffAdded",
  );

  application.clipboardSettled("failed");
  const withStatus = frame(application, 72, 22);
  assert.ok(withStatus.ok);
  assert.equal(
    withStatus.value.rows.some((row) => row.text.includes("Copy failed!")),
    true,
  );
  assert.equal(
    withStatus.value.rows.some((row) => row.text.includes("Allow once")),
    true,
  );
});

test("retains the compact action, state, and selected permission before preview", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(31, "change")).ok);
  requestTool(application, {
    approval: true,
    callId: "short-permission",
    name: "apply_patch",
    preview: "Path: src/index.ts\n- alpha beta gamma delta\n+ replacement",
    risk: "write",
    turnId: 31,
  });

  const rendered = frame(application, 24, 8);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const activityRows = rows.filter((row) =>
    isActivityRow(row, "Write", "permission")
  );

  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("\u2022 Write"), true);
  assert.equal(activityRows.at(0)?.text.includes("permission"), true);
  assert.equal(activityRows.at(0)?.text.includes("apply_patch"), false);
  assert.equal(rows.some((row) => row.text.includes("Allow once")), true);
  assert.equal(rows.some((row) => row.text.includes("Allow for session")), true);
  assert.equal(rows.some((row) => row.text.includes("Deny")), false);
  assert.equal(rows.some((row) => row.text.includes("alpha beta")), false);
  assert.equal(
    activityRows.at(0)?.spans.every((span) => span.surface === "none"),
    true,
  );
});

test("keeps non-patch permission previews neutral", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(42, "create docs")).ok);
  requestTool(application, {
    approval: true,
    callId: "private-manage",
    name: "manage_path",
    preview: "Operation: create_directory\nPath: docs",
    risk: "write",
    turnId: 42,
  });

  const rendered = frame(application, 48, 18);
  assert.ok(rendered.ok);
  for (const text of ["Operation: create_directory", "Path: docs"]) {
    const span = rendered.value.rows
      .flatMap((row) => row.spans)
      .find((candidate) => candidate.text.includes(text));
    assert.equal(span?.tone, "plain");
    assert.equal(span?.surface, "none");
  }
});

test("wraps exact effect previews while retaining the contextual decision", () => {
  const application = new ApplicationController(true);
  assert.ok(
    application.turnAccepted(started(32, "change several sections")).ok,
  );
  const preview =
    "Path: src/long-example.ts\n- " +
    "alpha beta gamma delta ".repeat(8) +
    "\n+ replacement";
  requestTool(application, {
    approval: true,
    callId: "private-wrapped-write",
    name: "apply_patch",
    preview,
    risk: "write",
    turnId: 32,
  });

  const rendered = frame(application, 48, 30);
  assert.ok(rendered.ok);
  const headerIndex = rendered.value.rows.findIndex((row) =>
    isActivityRow(row, "Write", "permission")
  );
  const decisionIndex = rendered.value.rows.findIndex((row) =>
    row.text.includes("Allow once")
  );
  const activityRows = rendered.value.rows
    .slice(headerIndex, decisionIndex)
    .filter((row) => row.text.trim().length > 0);
  const activityText = activityRows.map((row) => row.text).join("\n");

  assert.equal(activityRows.length > 2, true);
  assert.equal(activityRows.at(0)?.text.includes("\u2022 Write"), true);
  assert.equal(activityRows.at(0)?.text.includes("src/long-example.ts"), true);
  assert.equal(activityRows.at(0)?.text.includes("permission"), true);
  assert.equal(activityRows.at(0)?.text.includes("apply_patch"), false);
  assert.equal(activityRows.at(1)?.text.includes("Allow once"), false);
  assert.equal(activityRows.at(1)?.text.includes("- alpha"), true);
  assert.equal(activityText.includes("alpha beta gamma"), true);
  assert.equal(activityText.includes("+ replacement"), true);
  assert.equal(activityText.includes("Allow once"), false);
  const insertedIndex = activityRows.findIndex((row) =>
    row.text.includes("+ replacement")
  );
  assert.equal(insertedIndex > 1, true);
  assert.equal(
    activityRows.slice(1, insertedIndex).every((row) =>
      row.spans
        .filter((span) => span.text.trim().length > 0)
        .every((span) => span.tone === "diffRemoved")
    ),
    true,
  );
  assert.equal(
    activityRows.at(insertedIndex)?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.tone === "diffAdded"),
    true,
  );
  assert.equal(
    activityRows.every((row) =>
      row.spans.every((span) => span.surface === "none")
    ),
    true,
  );
  assert.equal(
    rendered.value.rows.some((row) => row.text.includes("Allow for session")),
    true,
  );
});

test("places compact phase-independent notices between activity and composer", () => {
  const application = new ApplicationController(true, configuredProviders());
  assert.ok(application.turnAccepted(started(31, "change")).ok);
  requestTool(application, {
    approval: false,
    callId: "notice-write",
    name: "read_file",
    risk: "read",
    turnId: 31,
  });

  application.feed("/unknown\r");
  const warning = frame(application, 72, 22);
  assert.ok(warning.ok);
  const warningRows = warning.value.rows;
  const warningIndex = warningRows.findIndex((row) =>
    row.text.includes("Unknown command"),
  );
  const lastActivityIndex = warningRows
    .map((row) => isActivityRow(row, "Read", "queued"))
    .lastIndexOf(true);
  const composerTop = (warning.value.caret?.row ?? 0) - 1;
  const warningSpan = warningRows.at(warningIndex)?.spans.find((span) =>
    span.text.includes("Unknown command"),
  );

  assert.equal(warningIndex, lastActivityIndex + 2);
  assert.equal(composerTop, warningIndex + 2);
  assert.equal(warningRows.at(warningIndex)?.text.indexOf("Unknown command"), 2);
  assert.equal(warningSpan?.tone, "attention");
  assert.equal(warningSpan?.surface, "none");

  application.feed("/providers\r");
  const info = frame(application, 72, 22);
  assert.ok(info.ok);
  const infoRows = info.value.rows;
  const infoComposerTop = (info.value.caret?.row ?? 0) - 1;
  const providerRows = infoRows.filter(
    (row, index) =>
      index < infoComposerTop &&
      row.text.includes("Provider selection is available only while idle."),
  );
  const infoSpan = providerRows.at(0)?.spans.find((span) =>
    span.text.includes("Provider selection"),
  );

  assert.equal(providerRows.length, 1);
  assert.equal(infoSpan?.tone, "attention");
  assert.equal(infoSpan?.surface, "none");
  assert.equal(infoRows.some((row) => row.text.includes("Unknown command")), false);
});

test("places copy feedback on the composer edge without moving the transcript", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(32, "copy this answer")).ok);
  application.feed("draft");
  const size = viewport(72, 18);
  const before = createChatRender(application, size);
  assert.ok(before.ok);

  application.clipboardSettled("copied");
  const after = createChatRender(application, size);
  assert.ok(after.ok);

  assert.deepEqual(after.value.transcript, before.value.transcript);
  assert.deepEqual(after.value.composer, before.value.composer);
  assert.deepEqual(after.value.frame.caret, before.value.frame.caret);
  assert.equal(after.value.frame.rows.length, before.value.frame.rows.length);
  const copiedRows = after.value.frame.rows.filter((row) =>
    row.text.includes("Copied!")
  );
  assert.equal(copiedRows.length, 1);
  assert.equal(
    copiedRows.at(0),
    after.value.frame.rows.at(after.value.frame.caret?.row ?? -1),
  );
  assert.equal(copiedRows.at(0)?.text.endsWith("Copied! "), true);
  assert.equal(
    copiedRows.at(0)?.spans.find((span) =>
      span.text.includes("Copied!")
    )?.tone,
    "muted",
  );
  assert.equal(
    after.value.frame.rows.some((row) =>
      row.text.includes("Copied to clipboard")
    ),
    false,
  );
});

test("renders failed tool truth only through failure state", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(4, "inspect")).ok);
  requestTool(application, {
    approval: false,
    callId: "private-failure",
    name: "read_file",
    risk: "read",
    turnId: 4,
  });
  assert.ok(
    application.applyRuntime({
      callId: "private-failure",
      kind: "toolStarted",
      name: "read_file",
      risk: "read",
      turnId: 4,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "private-failure",
      kind: "toolFinished",
      name: "read_file",
      risk: "read",
      status: "failure",
      turnId: 4,
    }).ok,
  );

  const rendered = frame(application, 56, 18);
  assert.ok(rendered.ok);
  const activityRows = rendered.value.rows.filter((row) =>
    isActivityRow(row, "Read", "failed")
  );
  const spans = activityRows.flatMap((row) => row.spans);
  const state = spans.find((span) => span.text.includes("failed"));
  assert.equal(state?.tone, "failure");
  const marker = spans.find((span) => span.text.includes("x "));
  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("x Read"), true);
  assert.equal(activityRows.at(0)?.text.trim().endsWith("failed"), true);
  assert.equal(activityRows.at(0)?.text.includes("read_file"), false);
  assert.equal(marker?.tone, "failure");
  assert.equal(state?.surface, "none");
  assert.equal(spans.every((span) => span.surface === "none"), true);
});

test("renders bounded slash completion above the composer", () => {
  const application = new ApplicationController(false);
  application.feed("/");

  const rendered = frame(application, 64, 14);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const providers = rows.find((row) => row.text.includes("/providers"));
  const permissions = rows.find((row) => row.text.includes("/permissions"));
  const composerTop = rendered.value.caret?.row ?? -1;
  const providersIndex = rows.findIndex((row) => row === providers);
  assert.ok(providers !== undefined);
  assert.ok(permissions !== undefined);
  assert.equal(providersIndex < composerTop, true);
  assert.equal(
    providers.text.trim(),
    "/providers  configure or select provider",
  );
  assert.equal(
    providers.text.indexOf("configure or select provider"),
    providers.text.indexOf("/providers") + "/providers".length + 2,
  );
  assert.equal(
    providers.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    permissions.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    rows.some((row) => row.text.includes("navigate")),
    false,
  );
});

test("renders the current-session provider selector without a box", () => {
  const application = new ApplicationController(true, configuredProviders());
  application.feed("/providers\r");

  const rendered = frame(application, 72, 16);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const provider = rows.find((row) => row.text.includes("Ollama Cloud"));
  const providerIndex = rows.findIndex((row) => row === provider);
  const ruleIndexes = rows
    .map((row, index) => isComposerRule(row) ? index : -1)
    .filter((index) => index >= 0);

  assert.equal(rows.some((row) => row.text.includes("Providers")), true);
  assert.equal(ruleIndexes.length, 2);
  assert.equal(providerIndex > (ruleIndexes.at(0) ?? providerIndex), true);
  assert.equal(providerIndex < (ruleIndexes.at(1) ?? providerIndex), true);
  assert.equal(rendered.value.caret, undefined);
  assert.equal(provider?.text.includes("qwen3-coder:480b-cloud"), true);
  assert.equal(provider?.text.includes("active"), true);
  assert.equal(
    provider?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.tone === "accent"),
    true,
  );
  assert.equal(
    rows
      .flatMap((row) => row.spans)
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
});

test("keeps composer copy feedback visible while a selector retains the dock", () => {
  const application = new ApplicationController(true, configuredProviders());
  application.feed("retained draft");
  application.applySessionAction(Object.freeze({ kind: "openProviders" }));
  const size = viewport(72, 16);
  const before = createChatRender(application, size);
  assert.ok(before.ok);

  application.clipboardSettled("copied");
  const after = createChatRender(application, size);
  assert.ok(after.ok);
  assert.deepEqual(after.value.composer, before.value.composer);
  assert.equal(after.value.frame.caret, undefined);
  assert.equal(
    after.value.frame.rows.some((row) => row.text.includes("Providers")),
    true,
  );
  assert.equal(
    after.value.frame.rows.some((row) => row.text.includes("Copied!")),
    true,
  );
  assert.equal(
    after.value.frame.rows.some((row) => row.text.includes("retained draft")),
    false,
  );
});

test("renders concealed credential entry guidance inside the composer", () => {
  const application = new ApplicationController(
    true,
    unconfiguredProviders(),
  );
  application.feed("/providers\r\r");

  const rendered = frame(application, 72, 16);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;

  assert.equal(
    rows.some((row) => row.text.includes("Connect Ollama Cloud")),
    true,
  );
  assert.equal(rows.some((row) => row.text.includes("process only")), true);
  assert.equal(
    rows.some((row) =>
      row.text.includes("API key is concealed and discarded on exit.")),
    false,
  );
  assert.equal(
    rows.some((row) => row.text.includes("Enter confirms; Ctrl+C cancels.")),
    false,
  );
  const guidance = rows.find((row) =>
    row.text.includes("Enter API key · Ctrl+C cancels"));
  assert.ok(guidance !== undefined);
  assert.equal(
    guidance.spans.some((span) =>
      span.text === "Enter API key · Ctrl+C cancels" &&
      span.tone === "muted" &&
      span.surface === "none"),
    true,
  );
  assert.equal(rendered.value.caret?.column, 2);
});

test("renders the transient six-tool session permission editor without a box", () => {
  const application = new ApplicationController(false);
  application.feed(
    "/permissions\r\u001B[B\u001B[B\u001B[B\u001B[C",
  );

  const rendered = frame(application, 72, 18);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  assert.equal(rows.some((row) => row.text.includes("Permissions")), true);
  assert.equal(rows.some((row) => row.text.includes("current session")), true);
  for (const name of [
    "read_file",
    "list_directory",
    "search_text",
    "apply_patch",
    "manage_path",
  ]) {
    assert.equal(rows.some((row) => row.text.includes(name)), true);
  }
  assert.equal(rows.some((row) => row.text.includes("shell")), false);
  const selected = rows.find((row) => row.text.includes("apply_patch"));
  assert.equal(
    selected?.spans.find((span) => span.text.includes("apply_patch"))?.tone,
    "accent",
  );
  assert.equal(
    selected?.spans.find((span) => span.text.includes("Allow"))?.tone,
    "accent",
  );
  assert.equal(
    rows
      .flatMap((row) => row.spans)
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(rows.some((row) => row.text.includes("/approve")), false);
  assert.equal(rows.some((row) => row.text.includes("/deny")), false);
  assert.equal(rendered.value.caret, undefined);
});

test("moves slash selection, hides exact completion, and coexists with activity", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(9, "inspect")).ok);
  requestTool(application, {
    approval: false,
    callId: "private-read",
    name: "read_file",
    risk: "read",
    turnId: 9,
  });
  application.feed("/\u001B[B\u001B[B");

  const active = frame(application, 72, 18);
  assert.ok(active.ok);
  const rows = active.value.rows;
  assert.equal(rows.some((row) => row.text.includes("\u2022 Read")), true);
  assert.equal(rows.some((row) => row.text.includes("read_file")), false);
  const activityIndexes = rows
    .map((row, index) =>
      isActivityRow(row, "Read", "queued") ? index : -1,
    )
    .filter((index) => index >= 0);
  const permissions = rows.find((row) => row.text.includes("/permissions"));
  const permissionsIndex = rows.findIndex((row) => row === permissions);
  const firstCompletionIndex = rows.findIndex((row) =>
    row.text.includes("/providers"),
  );
  assert.equal(activityIndexes.length, 1);
  const firstActivityIndex = activityIndexes.at(0);
  const lastActivityIndex = activityIndexes.at(-1);
  assert.ok(firstActivityIndex !== undefined);
  assert.ok(lastActivityIndex !== undefined);
  assert.equal(rows[firstActivityIndex - 1]?.text.trim(), "");
  assert.equal(rows[lastActivityIndex + 1]?.text.trim(), "");
  assert.equal(firstCompletionIndex, lastActivityIndex + 2);
  assert.equal(permissionsIndex, firstCompletionIndex + 2);
  assert.equal(
    permissions?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    permissions?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.tone === "accent"),
    true,
  );
  const providers = rows.find((row) => row.text.includes("/providers"));
  assert.equal(
    providers?.spans.find((span) => span.text.includes("/providers"))?.tone,
    "plain",
  );
  const lastCompletionIndex = rows.findIndex((row) =>
    row.text.includes("/exit"),
  );
  const composerTopIndex = (active.value.caret?.row ?? 0) - 1;
  assert.equal(rows[lastCompletionIndex + 1]?.text.trim(), "");
  assert.equal(composerTopIndex, lastCompletionIndex + 2);

  const exact = new ApplicationController(false);
  exact.feed("/providers");
  const hidden = frame(exact, 72, 14);
  assert.ok(hidden.ok);
  assert.equal(
    hidden.value.rows.some((row) =>
      row.text.includes("configure or select provider"),
    ),
    false,
  );
});

test("separates activity from the composer with one stage rhythm row", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(10, "inspect")).ok);
  requestTool(application, {
    approval: false,
    callId: "direct-read",
    name: "read_file",
    risk: "read",
    turnId: 10,
  });

  const active = frame(application, 72, 18);
  assert.ok(active.ok);
  const rows = active.value.rows;
  const activityIndexes = rows
    .map((row, index) =>
      isActivityRow(row, "Read", "queued") ? index : -1,
    )
    .filter((index) => index >= 0);
  const composerTopIndex = rows.findIndex(
    (_row, index) => index === (active.value.caret?.row ?? 0) - 1,
  );
  assert.equal(activityIndexes.length, 1);
  const firstActivityIndex = activityIndexes.at(0);
  const lastActivityIndex = activityIndexes.at(-1);
  assert.ok(firstActivityIndex !== undefined);
  assert.ok(lastActivityIndex !== undefined);
  assert.equal(rows[firstActivityIndex - 1]?.text.trim(), "");
  assert.equal(rows[lastActivityIndex + 1]?.text.trim(), "");
  assert.equal(composerTopIndex, lastActivityIndex + 2);
});

test("replaces the contextual tool and clears it when the turn settles", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(7, "change")).ok);
  requestTool(application, {
    approval: false,
    callId: "first-read",
    name: "list_directory",
    risk: "read",
    turnId: 7,
  });
  assert.ok(
    application.applyRuntime({
      callId: "first-read",
      kind: "toolStarted",
      name: "list_directory",
      risk: "read",
      turnId: 7,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "first-read",
      kind: "toolFinished",
      name: "list_directory",
      risk: "read",
      status: "success",
      turnId: 7,
    }).ok,
  );

  const firstSettled = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  assert.equal(firstSettled?.name, "list_directory");
  assert.equal(firstSettled?.state, "succeeded");

  requestTool(application, {
    approval: true,
    callId: "second-write",
    name: "apply_patch",
    preview: "Path: index.html\n- old\n+ new",
    risk: "write",
    turnId: 7,
  });

  const pending = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  assert.equal(pending?.name, "apply_patch");
  assert.equal(pending?.state, "permission");

  const rendered = frame(application, 72, 14);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("list_directory"), false);
  assert.equal(text.includes("apply_patch"), false);
  assert.equal(text.includes("index.html"), true);
  assert.equal(text.includes("permission"), true);
  assert.equal(text.includes("\u203a"), false);
  assert.equal(rendered.value.rows.at(-1)?.text.includes("approval"), false);
  assert.equal(rendered.value.rows.at(-1)?.text.includes("\u2022"), false);

  application.applySessionAction({ kind: "activateContextSelection" });
  assert.ok(
    application.applyRuntime({
      callId: "second-write",
      kind: "toolStarted",
      name: "apply_patch",
      risk: "write",
      turnId: 7,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "second-write",
      kind: "toolFinished",
      name: "apply_patch",
      risk: "write",
      status: "success",
      turnId: 7,
    }).ok,
  );
  const secondSettled = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  assert.equal(secondSettled?.name, "apply_patch");
  assert.equal(secondSettled?.state, "succeeded");

  const afterTool = frame(application, 72, 14);
  assert.ok(afterTool.ok);
  const afterToolText = afterTool.value.rows.map((row) => row.text).join("\n");
  assert.equal(afterToolText.includes("list_directory"), false);
  assert.equal(afterToolText.includes("apply_patch"), false);
  assert.equal(afterToolText.includes("index.html"), true);
  assert.equal(afterToolText.includes("succeeded"), true);

  assert.ok(
    application.applyRuntime({
      kind: "assistantDelta",
      text: "done",
      turnId: 7,
    }).ok,
  );
  const prepared = application.applyRuntime({
    assistant: Object.freeze({ content: "done" }),
    checkpointed: true,
    cleanup: Object.freeze([]),
    kind: "turnPrepared",
    turnId: 7,
  } as never);
  assert.ok(prepared.ok);
  assert.ok(
    application.turnCommitResolved(
      7,
      Object.freeze({ historyNodeId: 1, kind: "committed" as const }),
    ).ok,
  );
  assert.equal(
    projectCurrentActivity(
      application.activities,
      application.activeTurnId !== undefined,
    ),
    undefined,
  );

  const completed = frame(application, 72, 14);
  assert.ok(completed.ok);
  const completedText = completed.value.rows.map((row) => row.text).join("\n");
  assert.equal(completedText.includes("list_directory"), false);
  assert.equal(completedText.includes("apply_patch"), false);
  assert.equal(completedText.includes("index.html"), false);
});

test("sanitizes streamed terminal controls before the assistant document", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(5, "question")).ok);
  assert.ok(
    application.applyRuntime({
      kind: "assistantDelta",
      text: "unsafe\u001Bpartial",
      turnId: 5,
    }).ok,
  );

  const rendered = frame(application, 48, 14);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("\u001B"), false);
  assert.equal(text.includes("unsafe?partial"), true);
});

test("renders streamed single-asterisk assistant emphasis without delimiters", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(33, "tell me a story")).ok);
  assert.ok(
    application.applyRuntime({
      kind: "assistantDelta",
      text: "*Fine.*",
      turnId: 33,
    }).ok,
  );

  const rendered = frame(application, 48, 14);
  assert.ok(rendered.ok);
  const assistant = rendered.value.rows.find((row) => row.text.trim() === "Fine.");
  const emphasis = assistant?.spans.find((span) => span.text === "Fine.");

  assert.ok(assistant !== undefined);
  assert.equal(emphasis?.tone, "plain");
  assert.equal(emphasis?.slant, "italic");
  assert.equal(
    rendered.value.rows.some((row) => row.text.includes("*Fine.*")),
    false,
  );
});

test("navigates the conversation document and resumes follow-end", () => {
  const application = new ApplicationController(true);
  const question = Array.from(
    { length: 20 },
    (_, index) => "line-" + String(index + 1).padStart(2, "0"),
  ).join("\n");
  assert.ok(application.turnAccepted(started(6, question)).ok);

  const initial = createChatRender(application, viewport(36, 14));
  assert.ok(initial.ok);
  assert.ok(
    application.observeTranscriptGeometry(
      initial.value.transcript.contentRows,
      initial.value.transcript.viewportRows,
    ).ok,
  );
  assert.equal(initial.value.frame.rows.some((row) => row.text.includes("line-20")), true);

  application.feed("\u001B[5~");
  const history = createChatRender(application, viewport(36, 14));
  assert.ok(history.ok);
  assert.equal(history.value.frame.rows.some((row) => row.text.includes("line-20")), false);
  assert.equal(history.value.frame.rows.at(-1)?.text.includes("history"), false);

  for (let count = 0; count < 12 && application.viewingHistory; count += 1) {
    application.feed("\u001B[6~");
  }
  const latest = createChatRender(application, viewport(36, 14));
  assert.ok(latest.ok);
  assert.equal(application.viewingHistory, false);
  assert.equal(latest.value.frame.rows.some((row) => row.text.includes("line-20")), true);
  assert.equal(latest.value.frame.rows.at(-1)?.text.includes("history"), false);
});

test("separates a scrollable transcript from the composer", () => {
  const application = new ApplicationController(true);
  const question = Array.from(
    { length: 20 },
    (_, index) => "line-" + String(index + 1).padStart(2, "0"),
  ).join("\n");
  assert.ok(application.turnAccepted(started(12, question)).ok);

  const rendered = createChatRender(application, viewport(36, 14));
  assert.ok(rendered.ok);
  const composerTop = (rendered.value.frame.caret?.row ?? 0) - 1;

  assert.equal(
    rendered.value.transcript.contentRows >
      rendered.value.transcript.viewportRows,
    true,
  );
  assert.equal(
    rendered.value.frame.rows.at(rendered.value.transcript.viewportRows)?.text.trim(),
    "",
  );
  assert.equal(
    composerTop,
    rendered.value.transcript.viewportRows + 1,
  );
});

test("keeps the composer ahead of every other region on one row", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(7, "line-1\nline-2")).ok);
  const rendered = frame(application, 16, 1);

  assert.ok(rendered.ok);
  assert.equal(
    rendered.value.rows.at(0)?.spans.every((span) => span.surface === "none"),
    true,
  );
  assert.equal(isComposerRule(rendered.value.rows.at(0)), false);
  assert.deepEqual(rendered.value.caret, { row: 0, column: 2 });
});
