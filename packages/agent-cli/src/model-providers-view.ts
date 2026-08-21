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
import {
  createInteractionHeader,
  createSpan,
  createStack,
  type InteractionStatusProjection,
} from "./view-components.js";

export type ModelProviderMenuProjection = Readonly<{
  items: readonly ProviderSelectionSnapshot[];
  selectedIndex: number;
}>;

/** Projects the authenticated-provider stage of atomic model selection. */
export function createModelProvidersDocument(
  projection: ModelProviderMenuProjection | undefined,
  status?: InteractionStatusProjection,
): Result<Component, ComponentError> {
  if (projection === undefined) return createStack([]);
  const header = createInteractionHeader("Models", "choose provider", status);
  if (!header.ok) return header;

  const rows: Component[] = [];
  for (let position = 0; position < projection.items.length; position += 1) {
    const item = projection.items.at(position);
    if (item === undefined || !item.configured) {
      return err(new ComponentError("invalidComponent", position));
    }
    const name = createSpan(item.presentation.displayName, "plain");
    const state = createSpan(
      item.selected && item.ready ? "active" : "authenticated",
      "muted",
    );
    if (!name.ok) return name;
    if (!state.ok) return state;
    const row = SplitLine.create([name.value], [state.value], {
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
