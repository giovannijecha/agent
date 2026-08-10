import {
  type Component,
  ComponentError,
  ComponentStack,
  err,
  type Frame,
  InlineText,
  InputLine,
  MarkdownBlock,
  type Result,
  TextBlock,
  TextSpan,
  TUI_LIMITS,
  VerticalLayout,
  type VerticalSlot,
  type Viewport,
} from "@agent/tui";

import type { ApplicationController } from "./application.js";
import type {
  ToolActivitySnapshot,
  ToolActivityState,
} from "./tool-activity-log.js";

const ACTIVITY_PREFERRED_ROWS = 6;

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

function attentionState(state: ToolActivityState): boolean {
  return (
    state === "approval" ||
    state === "cancelled" ||
    state === "cancelling" ||
    state === "denied" ||
    state === "failed"
  );
}

function createActivityStack(
  activities: readonly ToolActivitySnapshot[],
): Result<ComponentStack, ComponentError> {
  const components: Component[] = [];
  for (let position = activities.length - 1; position >= 0; position -= 1) {
    const activity = activities.at(position);
    if (activity === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const rail = TextSpan.create("\u2502 ", "muted");
    const state = TextSpan.create(
      activity.state,
      attentionState(activity.state) ? "attention" : "muted",
    );
    const name = TextSpan.create("  " + activity.name, "accent");
    const risk = TextSpan.create("  " + activity.risk, "muted");
    if (!rail.ok || !name.ok || !risk.ok || !state.ok) {
      return err(new ComponentError("invalidRow", position));
    }
    const header = InlineText.create([
      rail.value,
      state.value,
      name.value,
      risk.value,
    ]);
    if (!header.ok) {
      return header;
    }
    components.push(header.value);
    if (activity.preview.length > 0) {
      const preview = TextBlock.create(
        "  scope  " + activity.preview,
        "head",
        "muted",
      );
      if (!preview.ok) {
        return preview;
      }
      components.push(preview.value);
    }
  }
  return ComponentStack.create(components, "head");
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
  const transcript = MarkdownBlock.createDocuments(
    application.transcriptDocuments(),
    "tail",
  );
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
  const activities = application.activities;
  const activityStack = createActivityStack(activities);
  if (!activityStack.ok) {
    return activityStack;
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
      component: activityStack.value,
      flex: 0,
      minimumRows: activities.length > 0 ? 1 : 0,
      preferredRows:
        activities.length > 0 ? ACTIVITY_PREFERRED_ROWS : 0,
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
