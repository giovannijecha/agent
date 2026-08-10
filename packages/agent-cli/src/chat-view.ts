import {
  ComponentError,
  err,
  type Frame,
  InlineText,
  InputLine,
  type Result,
  TextBlock,
  TextSpan,
  TUI_LIMITS,
  VerticalLayout,
  type VerticalSlot,
  type Viewport,
} from "@agent/tui";

import type { ApplicationController } from "./application.js";

function phaseLabel(application: ApplicationController): string {
  return application.phase === "generating"
    ? "generating"
    : application.phase === "awaitingApproval"
      ? "approval"
      : application.phase === "runningTool"
        ? "tool"
        : application.phase === "cancelling"
          ? "cancelling"
          : "ready";
}

/** Maps CLI state onto generic owned vertical components and one safe frame. */
export function createChatFrame(
  application: ApplicationController,
  viewport: Viewport,
): Result<Frame, ComponentError> {
  const productName = TextSpan.create("agent", "accent");
  if (!productName.ok) {
    return err(new ComponentError("invalidRow", undefined));
  }
  const phase = TextSpan.create("  " + phaseLabel(application), "muted");
  if (!phase.ok) {
    return err(new ComponentError("invalidRow", undefined));
  }
  const header = InlineText.create([productName.value, phase.value]);
  if (!header.ok) {
    return header;
  }
  const transcript = TextBlock.create(application.transcriptText(), "tail");
  if (!transcript.ok) {
    return transcript;
  }
  const status = TextBlock.create(
    application.notice.join("\n"),
    "tail",
    application.phase === "awaitingApproval" ? "attention" : "muted",
  );
  if (!status.ok) {
    return status;
  }
  const toolStatus = application.toolStatusFor(viewport.columns);
  const tool = TextBlock.create(toolStatus, "head", "attention");
  if (!tool.ok) {
    return tool;
  }
  const toolPreview = TextBlock.create(
    application.toolPreview,
    "head",
    "muted",
  );
  if (!toolPreview.ok) {
    return toolPreview;
  }
  const input = InputLine.create("> ", application, "accent");
  if (!input.ok) {
    return input;
  }

  const slots: readonly VerticalSlot[] = Object.freeze([
    Object.freeze({
      component: header.value,
      flex: 0,
      minimumRows: 0,
      preferredRows: 1,
      priority: 0,
    }),
    Object.freeze({
      component: transcript.value,
      flex: 1,
      minimumRows: application.hasTranscript ? 1 : 0,
      preferredRows: TUI_LIMITS.frameRows,
      priority: 2,
    }),
    Object.freeze({
      component: status.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: 2,
      priority: 3,
    }),
    Object.freeze({
      component: toolPreview.value,
      flex: 0,
      minimumRows: application.toolPreview.length > 0 ? 1 : 0,
      preferredRows: application.toolPreview.length > 0 ? 3 : 0,
      priority: 3,
    }),
    Object.freeze({
      component: tool.value,
      flex: 0,
      minimumRows: toolStatus.length > 0 ? 1 : 0,
      preferredRows: toolStatus.length > 0 ? 1 : 0,
      priority: 4,
    }),
    Object.freeze({
      component: input.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: 1,
      priority: 5,
    }),
  ]);
  const layout = VerticalLayout.create(slots);
  return layout.ok ? layout.value.render(viewport) : layout;
}
