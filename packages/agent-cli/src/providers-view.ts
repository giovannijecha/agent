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
import type { ProviderSelectionSnapshot } from "./provider-session.js";
import { createSpan, createStack } from "./view-components.js";

export type ProviderMenuProjection = Readonly<{
  items: readonly ProviderSelectionSnapshot[];
  selectedIndex: number;
}>;

/** Projects the closed current-session provider selector. */
export function createProvidersDocument(
  projection: ProviderMenuProjection | undefined,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const title = createSpan("Providers", "emphasis");
  const scope = createSpan("current session", "muted");
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
    const name = createSpan(item.presentation.displayName, "plain");
    const model = createSpan(
      item.presentation.model === undefined
        ? ""
        : "  " + item.presentation.model,
      "muted",
    );
    const state = createSpan(
      item.selected && item.ready
        ? "active"
        : item.selected
          ? "selected"
          : item.configured
            ? "configured"
            : "not configured",
      "muted",
    );
    if (!name.ok) return name;
    if (!model.ok) return model;
    if (!state.ok) return state;
    const row = SplitLine.create(
      [name.value, model.value],
      [state.value],
      { gap: 2, priority: "left" },
    );
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
