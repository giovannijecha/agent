import {
  type Component,
  ComponentError,
  err,
  type Result,
  SelectionList,
  SplitLine,
  Surface,
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
  const title = createSpan("Timeline", "emphasis");
  const scope = createSpan("current process", "muted");
  if (!title.ok) return title;
  if (!scope.ok) return scope;
  const header = SplitLine.create([title.value], [scope.value], {
    gap: 2,
    priority: "left",
  });
  if (!header.ok) return header;

  const rows: Component[] = [];
  for (let position = 0; position < projection.items.length; position += 1) {
    const item = projection.items.at(position);
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
  const list = SelectionList.create(rows, projection.selectedIndex);
  if (!list.ok) return list;
  const content = createStack([header.value, list.value]);
  if (!content.ok) return content;
  return Surface.create(content.value, {
    extent: "viewport",
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
}
