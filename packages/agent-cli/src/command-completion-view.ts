import {
  type Component,
  ComponentError,
  err,
  InlineText,
  type Result,
  SelectionList,
} from "@agent/tui";

import type { CommandCompletionProjection } from "./session.js";
import { createSpan, createStack } from "./view-components.js";

/** Maps the CLI command catalog onto generic one-row selection primitives. */
export function createCommandCompletionDocument(
  projection: CommandCompletionProjection | undefined,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const rows: Component[] = [];
  for (let position = 0; position < projection.items.length; position += 1) {
    const item = projection.items.at(position);
    if (item === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const command = createSpan(item.command, "plain");
    const gap = createSpan("  ", "muted");
    const description = createSpan(item.description, "muted");
    if (!command.ok) return command;
    if (!gap.ok) return gap;
    if (!description.ok) return description;
    const line = InlineText.create([
      command.value,
      gap.value,
      description.value,
    ]);
    if (!line.ok) return line;
    rows.push(line.value);
  }
  return SelectionList.create(rows, projection.selectedIndex);
}
