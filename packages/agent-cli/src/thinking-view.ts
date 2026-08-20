import type { ThinkingEffort } from "@agent/runtime";
import {
  type Component,
  ComponentError,
  err,
  InteractionDock,
  type Result,
  SelectionList,
  SplitLine,
} from "@agent/tui";

import { CONVERSATION_DENSITY } from "./conversation-density.js";
import {
  createInteractionHeader,
  createSpan,
  createStack,
  type InteractionStatusProjection,
} from "./view-components.js";

export type ThinkingDisplay = "off" | "on";
export type ThinkingSetting = "stream" | "effort";

export const THINKING_DISPLAYS: readonly ThinkingDisplay[] = Object.freeze([
  "off",
  "on",
]);

export const THINKING_EFFORTS: readonly ThinkingEffort[] = Object.freeze([
  "off",
  "low",
  "medium",
  "high",
]);

export const THINKING_SETTINGS: readonly ThinkingSetting[] = Object.freeze([
  "stream",
  "effort",
]);

export type ThinkingMenuProjection = Readonly<{
  display: ThinkingDisplay;
  effort: ThinkingEffort;
  selectedIndex: number;
}>;

function title(value: string): string {
  const first = value.at(0);
  return first === undefined ? value : first.toUpperCase() + value.slice(1);
}

/** Projects the staged two-axis thinking settings through the generic dock. */
export function createThinkingDocument(
  projection: ThinkingMenuProjection | undefined,
  status?: InteractionStatusProjection,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const header = createInteractionHeader("Thinking", "current session", status);
  if (!header.ok) return header;

  const rows: Component[] = [];
  for (let position = 0; position < THINKING_SETTINGS.length; position += 1) {
    const setting = THINKING_SETTINGS.at(position);
    if (setting === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const label = createSpan(setting === "stream" ? "Stream" : "Effort", "plain");
    const value = createSpan(
      title(setting === "stream" ? projection.display : projection.effort),
      "muted",
    );
    if (!label.ok) return label;
    if (!value.ok) return value;
    const row = SplitLine.create([label.value], [value.value], {
      gap: 2,
      priority: "left",
    });
    if (!row.ok) return row;
    rows.push(row.value);
  }
  const list = SelectionList.create(rows, projection.selectedIndex);
  if (!list.ok) return list;
  return InteractionDock.create(list.value, {
    focus: "selection",
    header: header.value,
    maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
  });
}
