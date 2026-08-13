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

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
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
  const application = new ApplicationController(true, {
    authentication: "memory-only API key",
    displayName: "OpenCode Go",
    model: "configured-model",
  });
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
  assert.equal(composer?.spans.at(-1)?.surface, "subtle");
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

function started(turnId: number, content: string): StartedTurn {
  return Object.freeze({
    turnId,
    user: Object.freeze({ content }),
  }) as unknown as StartedTurn;
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
    activityVerticalPadding: 0,
    composerVerticalPadding: 1,
    rhythmRows: 1,
    userVerticalPadding: 1,
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
  assert.equal(
    rows.slice(caretRow - 1, caretRow + 2)
      .every((row) => row.spans.some((span) => span.surface === "subtle")),
    true,
  );
});

test("renders one neutral composer and the exact canonical workspace root", () => {
  const canonicalWorkspaceRoot = "/owned/workspace";
  const application = new ApplicationController(true, {
    authentication: "memory-only API key",
    displayName: "OpenCode Go",
    model: "configured-model",
  }, canonicalWorkspaceRoot);
  application.feed("draft");

  const rendered = frame(application, 72, 18);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const composer = rows.find((row) => row.text.includes("draft"));
  const composerIndex = composer === undefined ? -1 : rows.indexOf(composer);
  assert.equal(rows.some((row) => row.text.includes("\u250c")), false);
  assert.equal(rows.some((row) => row.text.includes("\u2514")), false);
  assert.ok(composerIndex > 0);
  assert.equal(
    rows[composerIndex - 1]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(
    rows[composerIndex + 1]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(composer?.text.includes("\u203a"), false);
  assert.equal(
    composer?.spans.some((span) => span.surface === "subtle"),
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
    rows.at(-1)?.text.includes("OpenCode Go \u00b7 configured-model"),
    true,
  );
  assert.equal(
    rows.at(-1)?.text.indexOf("OpenCode Go \u00b7 configured-model"),
    (() => {
      const name = TextSpan.create("OpenCode Go", "plain");
      const model = TextSpan.create(" \u00b7 configured-model", "muted");
      assert.ok(name.ok);
      assert.ok(model.ok);
      const center = RichRow.create([name.value, model.value]);
      assert.ok(center.ok);
      return Math.floor((72 - center.value.cellWidth) / 2);
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
  assert.equal(
    rows.filter((row) =>
      row.spans.some((span) => span.surface === "subtle"),
    ).length,
    6,
  );
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

test("uses one subtle italic user region and one unboxed assistant turn", () => {
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
  const userContent = user?.spans.filter((span) => span.text.trim().length > 0);
  const userIndex = user === undefined ? -1 : rows.indexOf(user);
  assert.equal(user?.text.trim(), "question");
  assert.equal(
    userContent?.every((span) => span.slant === "italic"),
    true,
  );
  assert.equal(
    user?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(user?.text.includes("\u203a"), false);
  assert.equal(rows[userIndex - 1]?.text.trim(), "");
  assert.equal(
    rows[userIndex - 1]?.spans.some((span) => span.surface === "subtle") ??
      false,
    true,
  );
  assert.equal(rows[userIndex + 1]?.text.trim(), "");
  assert.equal(
    rows[userIndex + 1]?.spans.some((span) => span.surface === "subtle") ??
      false,
    true,
  );
  assert.equal(
    rows[userIndex - 2]?.spans.some((span) => span.surface === "subtle") ??
      false,
    false,
  );
  assert.equal(
    rows[userIndex + 2]?.spans.some((span) => span.surface === "subtle") ??
      false,
    false,
  );
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

test("paints copied Latin prose completely in user and composer surfaces", () => {
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
  assert.equal(
    contentRows.every((row) =>
      row.spans.at(0)?.surface === "none" &&
        row.spans.slice(1).every((span) => span.surface === "subtle"),
    ),
    true,
  );
  const composer = rendered.value.rows.at(rendered.value.caret?.row ?? -1);
  assert.ok(composer !== undefined);
  assert.equal(
    rendered.value.caret?.column,
    composer.text.indexOf(content) + content.length,
  );
});

test("frames multiline user turns with one shared padding row per side", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(4, "first line\nsecond line")).ok);

  const rendered = frame(application, 48, 14);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const first = rows.findIndex((row) => row.text.includes("first line"));
  const second = rows.findIndex((row) => row.text.includes("second line"));
  assert.ok(first >= 0);
  assert.equal(second, first + 1);
  assert.equal(
    rows[first]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(
    rows[second]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(rows[first - 1]?.text.trim(), "");
  assert.equal(
    rows[first - 1]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(rows[second + 1]?.text.trim(), "");
  assert.equal(
    rows[second + 1]?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.equal(
    rows.filter((row) =>
      row.spans.some((span) => span.surface === "subtle"),
    ).length,
    7,
  );
});

test("applies compact surfaces and external rhythm at wide and medium sizes", () => {
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
    const subtleIndexes = rows
      .map((row, index) =>
        row.spans.some((span) => span.surface === "subtle") ? index : -1,
      )
      .filter((index) => index >= 0);
    const activityIndexes = rows
      .map((row, index) =>
        row.spans.some((span) => span.surface === "attention") ? index : -1,
      )
      .filter((index) => index >= 0);
    const userIndex = rows.findIndex((row) => row.text.includes("question"));
    const composerTop = (rendered.value.caret?.row ?? 0) - 1;
    const firstActivity = activityIndexes.at(0);
    const lastActivity = activityIndexes.at(-1);

    assert.equal(subtleIndexes.length, 6);
    assert.equal(activityIndexes.length, 2);
    assert.ok(userIndex >= 0);
    assert.ok(firstActivity !== undefined);
    assert.ok(lastActivity !== undefined);
    assert.equal(subtleIndexes.includes(userIndex), true);
    assert.deepEqual(
      subtleIndexes.slice(0, 3),
      [userIndex - 1, userIndex, userIndex + 1],
    );
    assert.deepEqual(
      subtleIndexes.slice(-3),
      [composerTop, composerTop + 1, composerTop + 2],
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
    row.spans.some((span) => span.surface === "attention"),
  );
  const composerTop = (rendered.value.frame.caret?.row ?? 0) - 1;
  const composerIndexes = rows
    .map((row, index) =>
      index >= composerTop &&
        row.spans.some((span) => span.surface === "subtle")
        ? index
        : -1,
    )
    .filter((index) => index >= 0);
  assert.equal(rows.length, 8);
  assert.deepEqual(rendered.value.transcript, {
    contentRows: 3,
    viewportRows: 2,
  });
  assert.equal(rows.some((row) => row.text.includes("question")), true);
  assert.deepEqual(rendered.value.frame.caret, { row: 5, column: 7 });
  assert.deepEqual(composerIndexes, [4, 5, 6]);
  assert.equal(activityRows.length, 1);
  assert.equal(activityRows.at(0)?.text.includes("read_file"), true);
  assert.equal(activityRows.at(0)?.text.includes("queued"), true);
  assert.equal(
    activityRows.every((row) => row.text.trim().length > 0),
    true,
  );
});

test("composes the maximum retained history plus an active turn within component bounds", () => {
  const entries = Array.from({ length: 128 }, (_, turn) => [
    Object.freeze({ content: "question-" + String(turn), role: "user" as const }),
    Object.freeze({ content: "answer-" + String(turn), role: "assistant" as const }),
  ]).flat();
  entries.push(Object.freeze({ content: "active-question", role: "user" }));

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

test("renders successful tools on one borderless semantic surface", () => {
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
  assert.equal(text.includes("list_directory"), true);
  assert.equal(text.includes("succeeded"), true);
  assert.equal(text.includes("private-read"), false);
  assert.equal(text.split("┌").length - 1, 0);
  const activityRows = rendered.value.rows.filter((row) =>
    row.spans.some((span) => span.surface === "success"),
  );
  assert.equal(activityRows.length, 2);
  assert.equal(activityRows.every((row) => !row.text.includes("│")), true);
  const state = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("succeeded"));
  const name = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("list_directory"));
  assert.equal(state?.tone, "emphasis");
  assert.equal(name?.tone, "emphasis");
  assert.equal(name?.slant, "italic");
  assert.equal(name?.surface, "success");
});

test("renders approval through the same borderless semantic surface", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(3, "change")).ok);
  requestTool(application, {
    approval: true,
    callId: "private-write",
    name: "replace_text",
    preview: 'path="src/index.ts" oldText=<5 code units>',
    risk: "write",
    turnId: 3,
  });

  const rendered = frame(application, 72, 22);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("approval required"), true);
  assert.equal(text.includes("/approve  /deny"), true);
  assert.equal(text.includes("replace_text"), true);
  assert.equal(text.includes('path="src/index.ts"'), true);
  assert.equal(text.includes("private-write"), false);
  assert.equal(text.split("┌").length - 1, 0);
  const activityRows = rendered.value.rows.filter((row) =>
    row.spans.some((span) => span.surface === "attention"),
  );
  assert.equal(activityRows.length, 2);
  assert.equal(activityRows.every((row) => !row.text.includes("│")), true);
  const title = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("approval required"));
  const name = rendered.value.rows
    .flatMap((row) => row.spans)
    .find((span) => span.text.includes("replace_text"));
  assert.equal(title?.tone, "emphasis");
  assert.equal(title?.surface, "attention");
  assert.equal(name?.slant, "italic");
  assert.equal(name?.surface, "attention");
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .find((span) => span.text.includes("/approve"))?.tone,
    "emphasis",
  );
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .find((span) => span.text.includes('path="src/index.ts"'))?.tone,
    "plain",
  );
});

test("places compact phase-independent notices between activity and composer", () => {
  const application = new ApplicationController(true, {
    authentication: "memory-only API key",
    displayName: "OpenCode Go",
    model: "configured-model",
  });
  assert.ok(application.turnAccepted(started(31, "change")).ok);
  requestTool(application, {
    approval: true,
    callId: "notice-write",
    name: "replace_text",
    preview: 'path="src/index.ts" oldText=<5 code units>',
    risk: "write",
    turnId: 31,
  });

  const warningAction = application.feed("/unknown\r").actions.at(0);
  assert.ok(warningAction !== undefined);
  application.applySessionAction(warningAction);
  const warning = frame(application, 72, 22);
  assert.ok(warning.ok);
  const warningRows = warning.value.rows;
  const warningIndex = warningRows.findIndex((row) =>
    row.text.includes("Unknown command"),
  );
  const lastActivityIndex = warningRows
    .map((row) => row.spans.some((span) => span.surface === "attention"))
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

  const infoAction = application.feed("/providers\r").actions.at(0);
  assert.ok(infoAction !== undefined);
  application.applySessionAction(infoAction);
  const info = frame(application, 72, 22);
  assert.ok(info.ok);
  const infoRows = info.value.rows;
  const infoComposerTop = (info.value.caret?.row ?? 0) - 1;
  const providerRows = infoRows.filter(
    (row, index) =>
      index < infoComposerTop &&
      row.text.includes("OpenCode Go \u00b7 configured-model"),
  );
  const infoSpan = providerRows.at(0)?.spans.find((span) =>
    span.text.includes("OpenCode Go"),
  );

  assert.equal(providerRows.length, 1);
  assert.equal(infoSpan?.tone, "muted");
  assert.equal(infoSpan?.surface, "none");
  assert.equal(infoRows.some((row) => row.text.includes("Unknown command")), false);
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
  const spans = rendered.value.rows.flatMap((row) => row.spans);
  const state = spans.find((span) => span.text.includes("failed"));
  assert.equal(state?.tone, "emphasis");
  const name = spans.find((span) => span.text.includes("read_file"));
  assert.equal(name?.tone, "emphasis");
  assert.equal(name?.slant, "italic");
  assert.equal(name?.surface, "failure");
  assert.equal(state?.surface, "failure");
});

test("renders bounded slash completion above the composer", () => {
  const application = new ApplicationController(false);
  application.feed("/");

  const rendered = frame(application, 64, 14);
  assert.ok(rendered.ok);
  const rows = rendered.value.rows;
  const providers = rows.find((row) => row.text.includes("/providers"));
  const approve = rows.find((row) => row.text.includes("/approve"));
  const composerTop = rendered.value.caret?.row ?? -1;
  const providersIndex = rows.findIndex((row) => row === providers);
  assert.ok(providers !== undefined);
  assert.ok(approve !== undefined);
  assert.equal(providersIndex < composerTop, true);
  assert.equal(
    providers.text.trim(),
    "/providers  show integration availability",
  );
  assert.equal(
    providers.text.indexOf("show integration availability"),
    providers.text.indexOf("/providers") + "/providers".length + 2,
  );
  assert.equal(
    providers.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    approve.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    rows.some((row) => row.text.includes("navigate")),
    false,
  );
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
  application.feed("/\u001B[B");

  const active = frame(application, 72, 18);
  assert.ok(active.ok);
  const rows = active.value.rows;
  assert.equal(rows.some((row) => row.text.includes("read_file")), true);
  const activityIndexes = rows
    .map((row, index) =>
      row.spans.some((span) => span.surface === "attention") ? index : -1,
    )
    .filter((index) => index >= 0);
  const approve = rows.find((row) => row.text.includes("/approve"));
  const approveIndex = rows.findIndex((row) => row === approve);
  const firstCompletionIndex = rows.findIndex((row) =>
    row.text.includes("/providers"),
  );
  assert.equal(activityIndexes.length, 2);
  const firstActivityIndex = activityIndexes.at(0);
  const lastActivityIndex = activityIndexes.at(-1);
  assert.ok(firstActivityIndex !== undefined);
  assert.ok(lastActivityIndex !== undefined);
  assert.equal(rows[firstActivityIndex - 1]?.text.trim(), "");
  assert.equal(rows[lastActivityIndex + 1]?.text.trim(), "");
  assert.equal(firstCompletionIndex, lastActivityIndex + 2);
  assert.equal(approveIndex, firstCompletionIndex + 1);
  assert.equal(
    approve?.spans
      .filter((span) => span.text.trim().length > 0)
      .every((span) => span.surface === "none"),
    true,
  );
  assert.equal(
    approve?.spans.find((span) => span.text === "/approve")?.tone,
    "emphasis",
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
      row.text.includes("show integration availability"),
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
      row.spans.some((span) => span.surface === "attention") ? index : -1,
    )
    .filter((index) => index >= 0);
  const composerTopIndex = rows.findIndex(
    (_row, index) => index === (active.value.caret?.row ?? 0) - 1,
  );
  assert.equal(activityIndexes.length, 2);
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
    name: "replace_text",
    preview: 'path="index.html" oldText=<5 code units>',
    risk: "write",
    turnId: 7,
  });

  const pending = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  assert.equal(pending?.name, "replace_text");
  assert.equal(pending?.state, "approval");

  const rendered = frame(application, 72, 14);
  assert.ok(rendered.ok);
  const text = rendered.value.rows.map((row) => row.text).join("\n");
  assert.equal(text.includes("list_directory"), false);
  assert.equal(text.includes("replace_text"), true);
  assert.equal(text.includes("approval required"), true);
  assert.equal(text.includes("\u203a"), false);
  assert.equal(rendered.value.rows.at(-1)?.text.includes("approval"), false);
  assert.equal(rendered.value.rows.at(-1)?.text.includes("\u2022"), false);

  application.applySessionAction({ kind: "approve" });
  assert.ok(
    application.applyRuntime({
      callId: "second-write",
      kind: "toolStarted",
      name: "replace_text",
      risk: "write",
      turnId: 7,
    }).ok,
  );
  assert.ok(
    application.applyRuntime({
      callId: "second-write",
      kind: "toolFinished",
      name: "replace_text",
      risk: "write",
      status: "success",
      turnId: 7,
    }).ok,
  );
  const secondSettled = projectCurrentActivity(
    application.activities,
    application.activeTurnId !== undefined,
  );
  assert.equal(secondSettled?.name, "replace_text");
  assert.equal(secondSettled?.state, "succeeded");

  const afterTool = frame(application, 72, 14);
  assert.ok(afterTool.ok);
  const afterToolText = afterTool.value.rows.map((row) => row.text).join("\n");
  assert.equal(afterToolText.includes("list_directory"), false);
  assert.equal(afterToolText.includes("replace_text"), true);
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
      Object.freeze({ kind: "committed" as const }),
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
  assert.equal(completedText.includes("replace_text"), false);
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

  const pageUp = application.feed("\u001B[5~").actions.at(0);
  assert.ok(pageUp !== undefined);
  application.applySessionAction(pageUp);
  const history = createChatRender(application, viewport(36, 14));
  assert.ok(history.ok);
  assert.equal(history.value.frame.rows.some((row) => row.text.includes("line-20")), false);
  assert.equal(history.value.frame.rows.at(-1)?.text.includes("history"), false);

  for (let count = 0; count < 12 && application.viewingHistory; count += 1) {
    const pageDown = application.feed("\u001B[6~").actions.at(0);
    assert.ok(pageDown !== undefined);
    application.applySessionAction(pageDown);
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
    rendered.value.rows.at(0)?.spans.some((span) => span.surface === "subtle"),
    true,
  );
  assert.deepEqual(rendered.value.caret, { row: 0, column: 2 });
});
