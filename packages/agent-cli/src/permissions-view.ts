import {
  type Component,
  ComponentError,
  err,
  InlineText,
  type Result,
  SelectionList,
  SplitLine,
  Surface,
} from "@agent/tui";

import { CONVERSATION_DENSITY } from "./conversation-density.js";
import type {
  PermissionMenuProjection,
  ToolDecisionAction,
  ToolDecisionProjection,
  ToolPermissionMode,
} from "./tool-permissions.js";
import { createSpan, createStack } from "./view-components.js";

function modeLabel(mode: ToolPermissionMode): string {
  return mode === "allow" ? "Allow" : mode === "ask" ? "Ask" : "Deny";
}

function actionLabel(action: ToolDecisionAction): string {
  return action === "allowOnce"
    ? "Allow once"
    : action === "allowSession"
      ? "Allow for session"
      : "Deny";
}

function createPermissionMenu(
  projection: PermissionMenuProjection,
): Result<Component, ComponentError> {
  const title = createSpan("Permissions", "emphasis");
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
    const selected = position === projection.selectedIndex;
    const name = createSpan(item.name, selected ? "emphasis" : "plain", {
      slant: "italic",
    });
    const risk = createSpan("  " + item.risk, "muted");
    const mode = createSpan(
      modeLabel(item.mode),
      selected ? "emphasis" : "plain",
    );
    if (!name.ok) return name;
    if (!risk.ok) return risk;
    if (!mode.ok) return mode;
    const row = SplitLine.create(
      [name.value, risk.value],
      [mode.value],
      { gap: 2, priority: "left" },
    );
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

function createToolDecision(
  projection: ToolDecisionProjection,
): Result<Component, ComponentError> {
  const rows: Component[] = [];
  for (let position = 0; position < projection.actions.length; position += 1) {
    const action = projection.actions.at(position);
    if (action === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const label = createSpan(
      actionLabel(action),
      position === projection.selectedIndex ? "emphasis" : "plain",
    );
    if (!label.ok) return label;
    const row = InlineText.create([label.value]);
    if (!row.ok) return row;
    rows.push(row.value);
  }
  const list = SelectionList.create(rows, projection.selectedIndex);
  if (!list.ok) return list;
  return Surface.create(list.value, {
    extent: "viewport",
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
}

/** Projects the one active permission editor or pending-call decision. */
export function createPermissionsDocument(
  menu: PermissionMenuProjection | undefined,
  decision: ToolDecisionProjection | undefined,
): Result<Component, ComponentError> {
  if (menu !== undefined && decision !== undefined) {
    return err(new ComponentError("invalidComponent", undefined));
  }
  if (decision !== undefined) {
    return createToolDecision(decision);
  }
  return menu === undefined ? createStack([]) : createPermissionMenu(menu);
}
