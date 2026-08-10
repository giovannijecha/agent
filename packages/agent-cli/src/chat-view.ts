import {
  type Component,
  ComponentError,
  ComponentStack,
  err,
  type Frame,
  HorizontalInset,
  InlineText,
  InputLine,
  MarkdownBlock,
  ok,
  Panel,
  type Result,
  ScrollView,
  SideRail,
  SplitLine,
  TextBlock,
  TextSpan,
  TUI_LIMITS,
  type Tone,
  type VerticalAllocation,
  VerticalLayout,
  type VerticalSlot,
  type Viewport,
} from "@agent/tui";

import type { ApplicationController } from "./application.js";
import type { TranscriptEntry } from "./chat-state.js";
import type {
  ToolActivitySnapshot,
  ToolActivityState,
} from "./tool-activity-log.js";

const ACTIVITY_PREFERRED_ROWS = 6;
const SHELL_MAX_COLUMNS = 144;
const TRANSCRIPT_SLOT = 0;

export type ChatRender = Readonly<{
  frame: Frame;
  transcript: VerticalAllocation;
}>;

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

function createSpan(
  text: string,
  tone: Tone,
): Result<TextSpan, ComponentError> {
  const created = TextSpan.create(text, tone);
  return created.ok
    ? created
    : err(new ComponentError("invalidRow", created.error.position));
}

function constrain(component: Component): Result<HorizontalInset, ComponentError> {
  return HorizontalInset.create(component, {
    maximumColumns: SHELL_MAX_COLUMNS,
    minimumMargin: 1,
  });
}

function phaseTone(application: ApplicationController): Tone {
  return application.phase === "idle" ? "success" : "attention";
}

function activityTone(state: ToolActivityState): Tone {
  if (state === "succeeded") {
    return "success";
  }
  if (state === "failed" || state === "denied" || state === "cancelled") {
    return "failure";
  }
  return "attention";
}

function createFooter(
  application: ApplicationController,
): Result<SplitLine, ComponentError> {
  const left: TextSpan[] = [];
  const provider = application.provider;
  if (provider !== undefined) {
    const name = createSpan(provider.displayName, "plain");
    const model = createSpan(" / " + provider.model, "muted");
    if (!name.ok) return name;
    if (!model.ok) return model;
    left.push(name.value, model.value);
  }
  const phase = createSpan(phaseLabel(application), phaseTone(application));
  if (!phase.ok) return phase;
  const right: TextSpan[] = [phase.value];
  if (application.viewingHistory) {
    const history = createSpan("  history", "muted");
    if (!history.ok) return history;
    right.push(history.value);
  }
  return SplitLine.create(left, right, { gap: 2, priority: "right" });
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
    const tone = activityTone(activity.state);
    const name = TextSpan.create(activity.name, tone);
    const right = TextSpan.create(
      activity.state === "approval" ? "/approve  /deny" : activity.risk,
      activity.state === "approval" ? "attention" : "muted",
    );
    if (!name.ok || !right.ok) {
      return err(new ComponentError("invalidRow", position));
    }
    const header = SplitLine.create(
      activity.state === "approval" ? [] : [name.value],
      [right.value],
      {
        gap: 2,
        priority: activity.state === "approval" ? "right" : "left",
      },
    );
    if (!header.ok) {
      return header;
    }
    components.push(header.value);
    const stateSpans: TextSpan[] = [];
    if (activity.state === "approval") {
      const state = TextSpan.create("  approval required", "attention");
      const risk = TextSpan.create("  " + activity.risk, "muted");
      if (!state.ok || !risk.ok) {
        return err(new ComponentError("invalidRow", position));
      }
      stateSpans.push(name.value, state.value, risk.value);
    } else {
      const state = TextSpan.create(activity.state, tone);
      if (!state.ok) {
        return err(new ComponentError("invalidRow", position));
      }
      stateSpans.push(state.value);
    }
    const stateLine = InlineText.create(stateSpans);
    if (!stateLine.ok) {
      return stateLine;
    }
    components.push(stateLine.value);
    if (activity.preview.length > 0) {
      const preview = TextBlock.create(
        "scope  " + activity.preview,
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

function createTranscriptStack(
  entries: readonly TranscriptEntry[],
): Result<ComponentStack, ComponentError> {
  const components: Component[] = [];
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries.at(position);
    if (entry === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const markdown = MarkdownBlock.create(entry.content, "head");
    if (!markdown.ok) {
      return markdown;
    }
    if (entry.role === "user") {
      const panel = Panel.create(markdown.value, {
        borderTone: "muted",
        horizontalPadding: 1,
      });
      if (!panel.ok) {
        return panel;
      }
      components.push(panel.value);
    } else {
      const rail = SideRail.create(markdown.value, {
        horizontalPadding: 1,
        railTone: "muted",
      });
      if (!rail.ok) {
        return rail;
      }
      components.push(rail.value);
    }
    if (position < entries.length - 1) {
      const gap = TextBlock.create("", "head", "plain");
      if (!gap.ok) {
        return gap;
      }
      components.push(gap.value);
    }
  }
  return ComponentStack.create(components, "tail");
}

/** Maps CLI state onto one planned generic layout and one safe frame. */
export function createChatRender(
  application: ApplicationController,
  viewport: Viewport,
): Result<ChatRender, ComponentError> {
  const transcript = createTranscriptStack(application.transcriptEntries());
  if (!transcript.ok) {
    return transcript;
  }
  const transcriptView = ScrollView.create(
    transcript.value,
    application.transcriptScroll,
  );
  if (!transcriptView.ok) {
    return transcriptView;
  }
  const transcriptColumn = constrain(transcriptView.value);
  if (!transcriptColumn.ok) {
    return transcriptColumn;
  }
  const status = TextBlock.create(
    application.notice.join("\n"),
    "tail",
    application.phase === "awaitingApproval" ? "attention" : "muted",
  );
  if (!status.ok) {
    return status;
  }
  const statusColumn = constrain(status.value);
  if (!statusColumn.ok) {
    return statusColumn;
  }
  const activities = application.activities;
  const activityStack = createActivityStack(activities);
  if (!activityStack.ok) {
    return activityStack;
  }
  const activityPanel = Panel.create(activityStack.value, {
    borderTone: "muted",
    horizontalPadding: 1,
  });
  if (!activityPanel.ok) {
    return activityPanel;
  }
  const activityColumn = constrain(activityPanel.value);
  if (!activityColumn.ok) {
    return activityColumn;
  }
  const input = InputLine.create("\u2192 ", application, "plain");
  if (!input.ok) {
    return input;
  }
  const composer = Panel.create(input.value, {
    borderTone: "muted",
    horizontalPadding: 1,
  });
  if (!composer.ok) {
    return composer;
  }
  const composerColumn = constrain(composer.value);
  if (!composerColumn.ok) {
    return composerColumn;
  }
  const footer = createFooter(application);
  if (!footer.ok) {
    return footer;
  }
  const footerColumn = constrain(footer.value);
  if (!footerColumn.ok) {
    return footerColumn;
  }

  const slots: readonly VerticalSlot[] = Object.freeze([
    Object.freeze({
      component: transcriptColumn.value,
      flex: 1,
      minimumRows: application.hasTranscript ? 2 : 0,
      preferredRows: TUI_LIMITS.frameRows,
      priority: 3,
    }),
    Object.freeze({
      component: statusColumn.value,
      flex: 0,
      minimumRows: application.notice.length > 0 ? 1 : 0,
      preferredRows: application.notice.length > 0 ? 2 : 0,
      priority: 4,
    }),
    Object.freeze({
      component: activityColumn.value,
      flex: 0,
      minimumRows: activities.length > 0 ? 1 : 0,
      preferredRows:
        activities.length > 0 ? ACTIVITY_PREFERRED_ROWS : 0,
      priority: 5,
    }),
    Object.freeze({
      component: composerColumn.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: 3,
      priority: 6,
    }),
    Object.freeze({
      component: footerColumn.value,
      flex: 0,
      minimumRows: 1,
      preferredRows: 1,
      priority: 1,
    }),
  ]);
  const layout = VerticalLayout.create(slots);
  if (!layout.ok) {
    return layout;
  }
  const planned = layout.value.plan(viewport);
  if (!planned.ok) {
    return planned;
  }
  const transcriptGeometry = planned.value.allocation(TRANSCRIPT_SLOT);
  if (!transcriptGeometry.ok) {
    return transcriptGeometry;
  }
  const frame = planned.value.render();
  return frame.ok
    ? ok(
        Object.freeze({
          frame: frame.value,
          transcript: transcriptGeometry.value,
        }),
      )
    : frame;
}
