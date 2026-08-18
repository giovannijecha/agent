import {
  type Component,
  ComponentError,
  err,
  InteractionDock,
  type Result,
  SelectionList,
  SplitLine,
  TUI_LIMITS,
} from "@agent/tui";

import type { TimelineEntry } from "./chat-state.js";
import { CONVERSATION_DENSITY } from "./conversation-density.js";
import { createSpan, createStack } from "./view-components.js";

const PREVIEW_CODE_POINTS = 48;
const MAXIMUM_VISIBLE_DEPTH = 8;

export type TimelineMenuProjection = Readonly<{
  items: readonly TimelineEntry[];
  selectedIndex: number;
}>;

function preview(text: string): string {
  const normalized = text.replace(/[\p{Cc}\p{Cf}\s]+/gu, " ").trim();
  let output = "";
  let count = 0;
  for (const character of normalized) {
    if (count >= PREVIEW_CODE_POINTS) {
      return output + "...";
    }
    output += character;
    count += 1;
  }
  return output;
}

function stateLabel(item: TimelineEntry): string {
  const parts: string[] = [];
  if (item.selected) {
    parts.push("active");
  }
  if (item.settlement === "checkpointed") {
    parts.push("checkpoint");
  }
  if (item.childCount > 1) {
    parts.push(item.childCount.toString(10) + " branches");
  }
  return parts.join(" / ");
}

/** Projects the process-memory conversation tree onto one generic selector. */
export function createTimelineDocument(
  projection: TimelineMenuProjection | undefined,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const windowStart = projection.items.length <= TUI_LIMITS.componentCount
    ? 0
    : Math.max(0, projection.selectedIndex);
  const visibleItems = projection.items.slice(
    windowStart,
    windowStart + TUI_LIMITS.componentCount,
  );
  const title = createSpan("Timeline", "emphasis");
  const scopeLabel = visibleItems.length === projection.items.length
    ? "current process"
    : "current process " +
      (windowStart + 1).toString(10) +
      "-" +
      (windowStart + visibleItems.length).toString(10) +
      "/" +
      projection.items.length.toString(10);
  const scope = createSpan(scopeLabel, "muted");
  if (!title.ok) return title;
  if (!scope.ok) return scope;
  const header = SplitLine.create([title.value], [scope.value], {
    gap: 2,
    priority: "left",
  });
  if (!header.ok) return header;

  const rows: Component[] = [];
  for (let position = 0; position < visibleItems.length; position += 1) {
    const item = visibleItems.at(position);
    if (item === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const indentation = "  ".repeat(
      Math.min(item.depth, MAXIMUM_VISIBLE_DEPTH),
    );
    const summary = item.id === 0
      ? "root"
      : "#" + item.id.toString(10) + " " + preview(item.user);
    const label = createSpan(indentation + summary, "plain");
    const state = createSpan(stateLabel(item), "muted");
    if (!label.ok) return label;
    if (!state.ok) return state;
    const row = SplitLine.create([label.value], [state.value], {
      gap: 2,
      priority: "left",
    });
    if (!row.ok) return row;
    rows.push(row.value);
  }
  const list = SelectionList.create(
    rows,
    projection.selectedIndex - windowStart,
  );
  if (!list.ok) return list;
  return InteractionDock.create(list.value, {
    focus: "selection",
    header: header.value,
    maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
  });
}
