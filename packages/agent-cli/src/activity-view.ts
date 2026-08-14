import {
  type Component,
  ComponentError,
  type Result,
  SplitLine,
  Surface,
  type SurfaceTone,
  TextBlock,
  type Tone,
} from "@agent/tui";

import type {
  ToolActivitySnapshot,
  ToolActivityState,
} from "./tool-activity-log.js";
import { CONVERSATION_DENSITY } from "./conversation-density.js";
import { createSpan, createStack } from "./view-components.js";

type ActivityTone = Extract<Tone, SurfaceTone>;

function stateTone(state: ToolActivityState): ActivityTone {
  if (state === "succeeded") return "success";
  if (state === "failed" || state === "denied" || state === "cancelled") {
    return "failure";
  }
  return "attention";
}

function stateLabel(state: ToolActivityState): string {
  return state === "approval" ? "approval required" : state;
}

/** Selects the latest tool only while its model turn remains active. */
export function projectCurrentActivity(
  activities: readonly ToolActivitySnapshot[],
  turnActive: boolean,
): ToolActivitySnapshot | undefined {
  return turnActive ? activities.at(-1) : undefined;
}

function createActivityRows(
  activity: ToolActivitySnapshot,
): Result<Component, ComponentError> {
  const semanticTone = stateTone(activity.state);
  const name = createSpan(activity.name, "emphasis", { slant: "italic" });
  const state = createSpan(stateLabel(activity.state), "emphasis");
  if (!name.ok) return name;
  if (!state.ok) return state;
  const header = SplitLine.create([name.value], [state.value], {
    gap: 2,
    priority: "left",
  });
  if (!header.ok) return header;

  const components: Component[] = [header.value];
  const detail = [
    activity.risk,
    ...(activity.state === "approval" ? [activity.preview] : []),
  ]
    .filter((part) => part.length > 0)
    .join("  ");
  if (detail.length > 0) {
    if (activity.state === "approval") {
      const summary = createSpan(detail, "plain");
      const actions = createSpan("/approve  /deny", "emphasis");
      if (!summary.ok) return summary;
      if (!actions.ok) return actions;
      const decision = SplitLine.create([summary.value], [actions.value], {
        gap: 2,
        priority: "right",
      });
      if (!decision.ok) return decision;
      components.push(decision.value);
    } else {
      const text = TextBlock.create(detail, "head", "plain");
      if (!text.ok) return text;
      components.push(text.value);
    }
  } else if (activity.state === "approval") {
    const actions = TextBlock.create("/approve  /deny", "head", "emphasis");
    if (!actions.ok) return actions;
    components.push(actions.value);
  }
  const stack = createStack(components);
  if (!stack.ok) return stack;
  return Surface.create(stack.value, {
    extent: "viewport",
    horizontalPadding: 1,
    slant: "inherit",
    surface: semanticTone,
    verticalPadding: CONVERSATION_DENSITY.activityVerticalPadding,
  });
}

/** Builds one canonical activity surface for every owned tool. */
export function createActivityDocument(
  activity: ToolActivitySnapshot | undefined,
): Result<Component, ComponentError> {
  const components: Component[] = [];
  if (activity !== undefined) {
    const rendered = createActivityRows(activity);
    if (!rendered.ok) return rendered;
    components.push(rendered.value);
  }
  const stack = createStack(components, "head");
  return stack;
}
