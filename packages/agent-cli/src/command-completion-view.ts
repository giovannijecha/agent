import {
  type Component,
  ComponentError,
  err,
  type Result,
  SelectionList,
  SplitLine,
  Surface,
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
    const selected = position === projection.selectedIndex;
    const command = createSpan(
      item.command,
      selected ? "emphasis" : "plain",
    );
    const description = createSpan(item.description, "plain");
    if (!command.ok) return command;
    if (!description.ok) return description;
    const line = SplitLine.create([command.value], [description.value], {
      gap: 2,
      priority: "left",
    });
    if (!line.ok) return line;
    const surface = Surface.create(line.value, {
      extent: "viewport",
      horizontalPadding: 1,
      slant: "inherit",
      surface: selected ? "subtle" : "inset",
    });
    if (!surface.ok) return surface;
    rows.push(surface.value);
  }
  return SelectionList.create(rows, projection.selectedIndex);
}
