import {
  type Component,
  ComponentError,
  err,
  type Result,
  SelectionList,
  SplitLine,
  Surface,
} from "@agent/tui";

import { CONVERSATION_DENSITY } from "./conversation-density.js";
import type { ProviderModelSnapshot } from "./provider-session.js";
import { createSpan, createStack } from "./view-components.js";

export type ModelMenuProjection = Readonly<{
  items: readonly ProviderModelSnapshot[];
  providerName: string;
  selectedIndex: number;
}>;

function costLabel(cost: ProviderModelSnapshot["cost"]): string {
  return cost === "cloud" ? "cloud" : "";
}

/** Projects one bounded provider-owned remote model selection. */
export function createModelsDocument(
  projection: ModelMenuProjection | undefined,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const title = createSpan("Models", "emphasis");
  const provider = createSpan(projection.providerName, "muted");
  if (!title.ok) return title;
  if (!provider.ok) return provider;
  const header = SplitLine.create([title.value], [provider.value], {
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
    const name = createSpan(item.id, "plain");
    const state = createSpan(
      item.selected ? "active · " + costLabel(item.cost) : costLabel(item.cost),
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
