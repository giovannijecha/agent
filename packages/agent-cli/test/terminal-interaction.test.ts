import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeEvent, StartedTurn } from "@agent/runtime";
import {
  type PointerAction,
  type PointerEvent,
  type TextPosition,
  Viewport,
} from "@agent/tui";

import {
  ApplicationController,
  type PointerProjection,
} from "../dist/application.js";
import {
  createChatRender,
  type ChatRender,
} from "../dist/chat-view.js";
import { CONVERSATION_DENSITY } from "../dist/conversation-density.js";

type Cell = Readonly<{ column: number; row: number }>;

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

function render(
  application: ApplicationController,
  columns = 40,
  rows = 16,
): ChatRender {
  const viewport = Viewport.create(columns, rows);
  assert.ok(viewport.ok);
  const rendered = createChatRender(application, viewport.value);
  assert.ok(rendered.ok);
  const observed = application.observeTranscriptGeometry(
    rendered.value.transcript.contentRows,
    rendered.value.transcript.viewportRows,
  );
  assert.ok(observed.ok);
  return rendered.value;
}

function projection(rendered: ChatRender): PointerProjection {
  return Object.freeze({
    composer: rendered.composer,
    composerPointer: rendered.composerPointer,
    frame: rendered.frame,
    interactionFocus: rendered.interactionFocus,
    stageColumns: rendered.stage.columns,
    stageLeft: rendered.stage.left,
    transcript: rendered.transcript,
  });
}

function pointerSequence(
  cell: Cell,
  action: "move" | "press" | "release",
): string {
  const code = action === "move" ? 32 : 0;
  const suffix = action === "release" ? "m" : "M";
  return (
    "\u001B[<" +
    code.toString() +
    ";" +
    (cell.column + 1).toString() +
    ";" +
    (cell.row + 1).toString() +
    suffix
  );
}

function cellFor(
  rendered: ChatRender,
  target: TextPosition,
): Cell {
  for (let row = 0; row < rendered.frame.rows.length; row += 1) {
    const line = rendered.frame.rows.at(row);
    if (line === undefined) continue;
    let column = 0;
    for (const span of line.spans) {
      let offset = span.position?.offset;
      for (const character of span.text) {
        if (
          span.position?.document === target.document &&
          offset === target.offset
        ) {
          return Object.freeze({ column, row });
        }
        assert.equal(character.codePointAt(0) !== undefined, true);
        column += 1;
        if (offset !== undefined) offset += 1;
      }
    }
  }
  throw new Error("logical text position was not visible in the planned frame");
}

function composerCellAt(
  rendered: ChatRender,
  draft: string,
  offset: number,
): Cell {
  const caret = rendered.frame.caret;
  assert.ok(caret !== undefined);
  return Object.freeze({
    column: caret.column - draft.length + offset,
    row: caret.row,
  });
}

function composerBodyCell(rendered: ChatRender): Cell {
  return Object.freeze({
    column: rendered.stage.left + CONVERSATION_DENSITY.contentInsetCells,
    row:
      rendered.composer.startRow + CONVERSATION_DENSITY.composerRuleRows,
  });
}

function pointer(
  application: ApplicationController,
  rendered: ChatRender,
  cell: Cell,
  action: PointerAction,
  timeMilliseconds: number,
  shift = false,
): void {
  const event: PointerEvent = Object.freeze({
    action,
    alt: false,
    button: "left",
    column: cell.column,
    control: false,
    kind: "pointer",
    row: cell.row,
    shift,
    wheel: undefined,
  });
  application.applySessionAction(
    Object.freeze({ event, kind: "pointer", timeMilliseconds }),
    projection(rendered),
  );
}

function wheel(
  application: ApplicationController,
  rendered: ChatRender,
  direction: "down" | "up",
): boolean {
  const event: PointerEvent = Object.freeze({
    action: "wheel",
    alt: false,
    button: "none",
    column: rendered.stage.left,
    control: false,
    kind: "pointer",
    row: rendered.transcript.startRow,
    shift: false,
    wheel: direction,
  });
  return application.applySessionAction(
    Object.freeze({ event, kind: "pointer", timeMilliseconds: 0 }),
    projection(rendered),
  ).redraw;
}

test("selects planned transcript positions and preserves them through wheel scroll", () => {
  const application = new ApplicationController(true);
  const content = Array.from(
    { length: 20 },
    (_, index) =>
      "line" + index.toString().padStart(2, "0") + " alpha beta",
  ).join("\n");
  assert.ok(application.turnAccepted(started(1, content)).ok);
  let rendered = render(application, 32, 12);
  assert.equal(rendered.transcript.contentRows > rendered.transcript.viewportRows, true);
  const visible = rendered.frame.rows
    .flatMap((row) => row.spans)
    .find((span) => span.position?.document === 0);
  assert.ok(visible?.position !== undefined);
  const start = cellFor(rendered, visible.position);
  const end = cellFor(rendered, {
    document: 0,
    offset: visible.position.offset + Math.min(4, visible.text.length - 1),
  });

  pointer(application, rendered, start, "press", 100);
  pointer(application, rendered, end, "move", 120);
  pointer(application, rendered, end, "release", 130);
  assert.ok(
    application.transcriptSelection !== undefined &&
    !application.transcriptSelection.empty,
  );
  assert.ok(application.takePendingCopy() !== undefined);

  pointer(application, rendered, start, "press", 140);
  pointer(application, rendered, end, "move", 150);
  pointer(
    application,
    rendered,
    { column: rendered.stage.left, row: rendered.transcript.startRow },
    "release",
    160,
  );
  assert.ok(application.takePendingCopy() !== undefined);
  const selection = application.transcriptSelection;
  assert.ok(selection !== undefined);

  const oldOffset = application.transcriptScroll.offset;
  assert.equal(wheel(application, rendered, "up"), true);
  assert.equal(application.transcriptScroll.offset < oldOffset, true);
  assert.equal(application.transcriptSelection, selection);
  rendered = render(application, 32, 12);
  assert.equal(
    rendered.frame.rows
      .flatMap((row) => row.spans)
      .some((span) => span.mark === "selected"),
    true,
  );
});

test("extends one active transcript drag through a changed scroll viewport", () => {
  const application = new ApplicationController(true);
  const content = Array.from(
    { length: 30 },
    (_, index) =>
      "line" + index.toString().padStart(2, "0") + " alpha beta",
  ).join("\n");
  assert.ok(application.turnAccepted(started(1, content)).ok);
  let rendered = render(application, 32, 12);
  const tailPosition = rendered.frame.rows
    .flatMap((row) => row.spans)
    .find((span) => span.position?.document === 0)?.position;
  assert.ok(tailPosition !== undefined);
  const tail = cellFor(rendered, tailPosition);

  pointer(application, rendered, tail, "press", 100);
  assert.equal(wheel(application, rendered, "up"), true);
  rendered = render(application, 32, 12);
  const earlierPosition = rendered.frame.rows
    .flatMap((row) => row.spans)
    .find((span) =>
      span.position?.document === 0 &&
      span.position.offset < tailPosition.offset
    )?.position;
  assert.ok(earlierPosition !== undefined);
  const earlier = cellFor(rendered, earlierPosition);

  pointer(application, rendered, earlier, "move", 140);
  pointer(application, rendered, earlier, "release", 150);

  const selection = application.transcriptSelection;
  assert.ok(selection !== undefined);
  assert.deepEqual(selection.start, earlierPosition);
  assert.deepEqual(selection.end, {
    document: tailPosition.document,
    offset: tailPosition.offset + 1,
  });
  assert.ok(application.takePendingCopy() !== undefined);
});

test("double click selects one transcript word and Shift preserves native handling", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "alpha beta gamma")).ok);
  const rendered = render(application);
  const beta = cellFor(rendered, { document: 0, offset: 6 });

  pointer(application, rendered, beta, "press", 100);
  pointer(application, rendered, beta, "release", 110);
  assert.equal(application.takePendingCopy(), undefined);
  pointer(application, rendered, beta, "press", 450);
  assert.equal(application.takePendingCopy(), undefined);
  pointer(application, rendered, beta, "release", 460);
  assert.equal(application.takePendingCopy(), "beta");

  const selected = application.transcriptSelection;
  pointer(application, rendered, beta, "press", 500, true);
  assert.equal(application.transcriptSelection, selected);

  assert.equal(
    application.feed(
      "\u001B[<0;9;2M",
      Number.NaN,
      projection(rendered),
    ).redraw,
    false,
  );
});

test("copies one logical range across message documents in chronological order", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "first")).ok);
  const delta: RuntimeEvent<string> = Object.freeze({
    kind: "assistantDelta",
    text: "second",
    turnId: 1,
  });
  assert.ok(application.applyRuntime(delta).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: "second" }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared",
    turnId: 1,
  }) as unknown as RuntimeEvent<string>).ok);
  assert.ok(
    application.turnCommitResolved(1, {
      historyNodeId: 1,
      kind: "committed",
    }).ok,
  );
  const rendered = render(application);
  const first = cellFor(rendered, { document: 0, offset: 3 });
  const second = cellFor(rendered, { document: 2, offset: 2 });

  pointer(application, rendered, first, "press", 100);
  pointer(application, rendered, second, "move", 120);
  pointer(application, rendered, second, "release", 130);

  assert.equal(application.takePendingCopy(), "st\n\nsec");

  pointer(application, rendered, second, "press", 200);
  pointer(application, rendered, first, "move", 220);
  pointer(application, rendered, first, "release", 230);
  assert.equal(application.takePendingCopy(), "st\n\nsec");
});

test("copies late tool-loop reasoning before its earlier assistant preamble", () => {
  const application = new ApplicationController(true, configuredProviders());
  application.feed("/thinking\r\u001B[C\u001B[B\u001B[C\u001B[C\r");
  assert.ok(application.turnAccepted(started(1, "question")).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "tool preamble",
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    approvalPreview: "",
    approvalRequired: false,
    callId: "call-1",
    kind: "toolRequested" as const,
    name: "read_file",
    risk: "read" as const,
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    callId: "call-1",
    kind: "toolStarted" as const,
    name: "read_file",
    risk: "read" as const,
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    callId: "call-1",
    kind: "toolFinished" as const,
    name: "read_file",
    risk: "read" as const,
    status: "success" as const,
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "reasoningDelta" as const,
    text: "later reasoning",
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta" as const,
    text: "final answer",
    turnId: 1,
  })).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    assistant: Object.freeze({
      content: "final answer",
      reasoning: "later reasoning",
    }),
    checkpointed: true,
    cleanup: Object.freeze([]),
    kind: "turnPrepared" as const,
    turnId: 1,
  }) as unknown as RuntimeEvent<string>).ok);
  assert.ok(application.turnCommitResolved(1, {
    historyNodeId: 1,
    kind: "committed",
  }).ok);

  const entries = application.transcriptEntries();
  const reasoningEntry = entries.find(
    (entry) => entry.role === "reasoning",
  );
  const assistantEntry = entries.find(
    (entry) => entry.role === "assistant",
  );
  assert.ok(reasoningEntry !== undefined);
  assert.ok(assistantEntry !== undefined);
  const rendered = render(application, 48, 18);
  const reasoning = cellFor(rendered, {
    document: reasoningEntry.document,
    offset: 0,
  });
  const assistant = cellFor(rendered, {
    document: assistantEntry.document,
    offset: assistantEntry.content.length - 1,
  });

  pointer(application, rendered, reasoning, "press", 100);
  pointer(application, rendered, assistant, "move", 120);
  pointer(application, rendered, assistant, "release", 130);

  assert.equal(
    application.takePendingCopy(),
    "later reasoning\n\ntool preamble\n\nfinal answer",
  );
  assert.deepEqual(
    entries.map((entry) => [entry.document, entry.role]),
    [[0, "user"], [1, "reasoning"], [2, "assistant"]],
  );
});

test("routes composer double click, replacement, and resize through LineEditor", () => {
  const application = new ApplicationController(false);
  application.feed("alpha beta");
  const rendered = render(application);
  const beta = composerCellAt(rendered, "alpha beta", 6);

  pointer(application, rendered, beta, "press", 100);
  pointer(application, rendered, beta, "release", 110);
  assert.equal(application.takePendingCopy(), undefined);
  pointer(application, rendered, beta, "press", 450);
  assert.equal(application.takePendingCopy(), undefined);
  pointer(application, rendered, beta, "release", 460);
  assert.equal(application.takePendingCopy(), "beta");
  assert.equal(application.projectArea(36, 6).selections.at(0)?.end, 10);

  application.feed("owned");
  assert.equal(application.project(36).text, "alpha owned");
  pointer(application, render(application), beta, "press", 900);
  pointer(application, render(application), beta, "release", 910);
  pointer(application, render(application), beta, "press", 1_100);
  pointer(application, render(application), beta, "release", 1_110);
  assert.equal(application.takePendingCopy(), "owned");
  application.resize();
  assert.equal(
    application.projectArea(36, 6).selections.every(
      (selection) => selection.start === selection.end,
    ),
    true,
  );
});

test("keeps transcript pointer input active without routing it to the retained draft during selection focus", () => {
  const application = new ApplicationController(true, [
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
  const transcript = Array.from(
    { length: 20 },
    (_, index) =>
      "line" + index.toString().padStart(2, "0") + " alpha beta",
  ).join("\n");
  assert.ok(application.turnAccepted(started(1, transcript)).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta",
    text: "settled",
    turnId: 1,
  }) as RuntimeEvent<string>).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: "settled" }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared",
    turnId: 1,
  }) as unknown as RuntimeEvent<string>).ok);
  assert.ok(
    application.turnCommitResolved(1, {
      historyNodeId: 1,
      kind: "committed",
    }).ok,
  );
  application.feed("alpha beta");
  render(application, 32, 12);
  const editorArea = application.projectArea(32, 6);
  application.applySessionAction(Object.freeze({ kind: "openProviders" }));
  const selectionRender = render(application, 32, 12);
  const hiddenComposerCell = composerBodyCell(selectionRender);
  const visible = selectionRender.frame.rows
    .flatMap((row) => row.spans)
    .find((span) => span.position?.document === 0);
  assert.ok(visible?.position !== undefined);
  const transcriptStart = cellFor(selectionRender, visible.position);
  const transcriptEnd = cellFor(selectionRender, {
    document: 0,
    offset: visible.position.offset + Math.min(4, visible.text.length - 1),
  });

  pointer(application, selectionRender, transcriptStart, "press", 50);
  pointer(application, selectionRender, transcriptEnd, "move", 60);
  pointer(application, selectionRender, transcriptEnd, "release", 70);
  assert.ok(application.takePendingCopy() !== undefined);
  const oldOffset = application.transcriptScroll.offset;
  assert.equal(wheel(application, selectionRender, "up"), true);
  assert.equal(application.transcriptScroll.offset < oldOffset, true);

  pointer(application, selectionRender, hiddenComposerCell, "press", 100);
  pointer(application, selectionRender, hiddenComposerCell, "release", 110);

  assert.equal(application.project(36).text, "alpha beta");
  assert.deepEqual(application.projectArea(32, 6), editorArea);
  assert.equal(application.takePendingCopy(), undefined);

  application.applySessionAction(Object.freeze({ kind: "closeProviders" }));
  const restored = render(application);
  assert.equal(restored.frame.caret === undefined, false);
  assert.deepEqual(application.projectArea(32, 6), editorArea);

  application.applySessionAction(Object.freeze({ kind: "openProviders" }));
  const coalescedRender = render(application, 32, 12);
  application.feed(
    "x" + pointerSequence(composerBodyCell(coalescedRender), "press") + "owned",
    200,
    projection(coalescedRender),
  );
  assert.equal(application.project(32).text, "alpha beta");

  application.feed("\u001B", 210, projection(coalescedRender), true);
  application.feed("owned", 220, projection(render(application, 32, 12)));
  assert.equal(application.project(32).text, "alpha betaowned");
});

test("keeps concealed credentials out of composer pointer routing", () => {
  const application = new ApplicationController(true, unconfiguredProviders());
  assert.ok(application.turnAccepted(started(1, "visible transcript")).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    kind: "assistantDelta",
    text: "settled",
    turnId: 1,
  }) as RuntimeEvent<string>).ok);
  assert.ok(application.applyRuntime(Object.freeze({
    assistant: Object.freeze({ content: "settled" }),
    checkpointed: false,
    cleanup: Object.freeze([]),
    kind: "turnPrepared",
    turnId: 1,
  }) as unknown as RuntimeEvent<string>).ok);
  assert.ok(
    application.turnCommitResolved(1, {
      historyNodeId: 1,
      kind: "committed",
    }).ok,
  );
  application.applySessionAction(Object.freeze({ kind: "openProviders" }));
  application.applySessionAction(
    Object.freeze({ kind: "activateContextSelection" }),
  );
  application.feed("ephemeral-key");
  const credentialRender = render(application, 32, 12);
  assert.equal(credentialRender.composerPointer, "none");
  assert.equal(credentialRender.interactionFocus, "editor");

  const transcriptStart = cellFor(credentialRender, {
    document: 0,
    offset: 0,
  });
  const transcriptEnd = cellFor(credentialRender, {
    document: 0,
    offset: 6,
  });
  pointer(application, credentialRender, transcriptStart, "press", 50);
  pointer(application, credentialRender, transcriptEnd, "move", 60);
  pointer(application, credentialRender, transcriptEnd, "release", 70);
  assert.equal(application.takePendingCopy(), "visible");

  const credentialStart = composerBodyCell(credentialRender);
  const credentialEnd = Object.freeze({
    column: credentialStart.column + 8,
    row: credentialStart.row,
  });
  pointer(application, credentialRender, credentialStart, "press", 100);
  pointer(application, credentialRender, credentialEnd, "move", 110);
  pointer(application, credentialRender, credentialEnd, "release", 120);
  assert.equal(application.takePendingCopy(), undefined);
  assert.deepEqual(application.project(32), { caretColumn: 0, text: "" });
});

test("reduces coalesced composer pointer and editor events in decoder order", () => {
  const clicked = new ApplicationController(false);
  clicked.feed("alpha beta");
  let rendered = render(clicked);
  const betaStart = composerCellAt(rendered, "alpha beta", 6);

  clicked.feed(
    pointerSequence(betaStart, "press") + "owned",
    100,
    projection(rendered),
  );
  assert.equal(clicked.project(36).text, "alpha ownedbeta");

  const replaced = new ApplicationController(false);
  replaced.feed("alpha beta gamma");
  rendered = render(replaced);
  const replacedBetaStart = composerCellAt(rendered, "alpha beta gamma", 6);
  const betaEnd = composerCellAt(rendered, "alpha beta gamma", 9);
  replaced.feed(
    pointerSequence(replacedBetaStart, "press") +
      pointerSequence(betaEnd, "move") +
      pointerSequence(betaEnd, "release") +
      "\u001B[200~owned\u001B[201~",
    200,
    projection(rendered),
  );
  assert.equal(replaced.project(36).text, "alpha owned gamma");
});

test("dismisses the current notice only for composer pointer interaction", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(1, "visible transcript")).ok);
  application.feed("alpha beta");
  application.clipboardSettled("copied");
  let rendered = render(application);
  const transcriptCell = cellFor(rendered, { document: 0, offset: 0 });

  pointer(application, rendered, transcriptCell, "press", 100);
  pointer(application, rendered, transcriptCell, "release", 110);
  assert.deepEqual(application.notice, ["Copied!"]);

  const composerCell = composerCellAt(rendered, "alpha beta", 2);
  rendered = render(application);
  const update = application.feed(
    pointerSequence(composerCell, "press"),
    200,
    projection(rendered),
  );

  assert.equal(update.redraw, true);
  assert.deepEqual(application.notice, []);
  assert.equal(application.noticeToken, undefined);
});

test("extends transcript and composer double clicks by complete words", () => {
  const transcript = new ApplicationController(true);
  assert.ok(transcript.turnAccepted(started(1, "alpha beta gamma")).ok);
  const transcriptRender = render(transcript);
  const transcriptBeta = cellFor(transcriptRender, {
    document: 0,
    offset: 6,
  });
  const transcriptGamma = cellFor(transcriptRender, {
    document: 0,
    offset: 11,
  });

  pointer(transcript, transcriptRender, transcriptBeta, "press", 100);
  pointer(transcript, transcriptRender, transcriptBeta, "release", 110);
  pointer(transcript, transcriptRender, transcriptBeta, "press", 400);
  pointer(transcript, transcriptRender, transcriptGamma, "move", 420);
  pointer(transcript, transcriptRender, transcriptGamma, "release", 430);
  assert.equal(transcript.takePendingCopy(), "beta gamma");

  const composer = new ApplicationController(false);
  composer.feed("alpha beta gamma");
  const composerRender = render(composer);
  const composerBeta = composerCellAt(composerRender, "alpha beta gamma", 6);
  const composerGamma = composerCellAt(composerRender, "alpha beta gamma", 11);

  pointer(composer, composerRender, composerBeta, "press", 100);
  pointer(composer, composerRender, composerBeta, "release", 110);
  pointer(composer, composerRender, composerBeta, "press", 400);
  pointer(composer, composerRender, composerGamma, "move", 420);
  pointer(composer, composerRender, composerGamma, "release", 430);
  assert.equal(composer.takePendingCopy(), "beta gamma");
});

test("projects only exact visible HTTPS text as terminal links", () => {
  const application = new ApplicationController(true);
  assert.ok(application.turnAccepted(started(
    1,
    "open https://example.com/docs and [hidden](https://invalid.example)",
  )).ok);
  const rendered = render(application, 80, 14);
  const links = rendered.frame.rows
    .flatMap((row) => row.spans)
    .filter((span) => span.hyperlink !== undefined);

  assert.deepEqual(links.map((span) => span.hyperlink), [
    "https://example.com/docs",
    "https://invalid.example",
  ]);
  assert.equal(links.at(0)?.text, "https://example.com/docs");
  assert.equal(links.at(1)?.text, "https://invalid.example");
});
