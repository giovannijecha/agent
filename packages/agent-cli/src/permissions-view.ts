import {
  type Component,
  ComponentError,
  err,
  InlineText,
  InteractionDock,
  type Result,
  SelectionList,
  SplitLine,
} from "@agent/tui";

import { CONVERSATION_DENSITY } from "./conversation-density.js";
import type {
  PermissionMenuProjection,
  ToolDecisionAction,
  ToolDecisionProjection,
  ToolPermissionMode,
} from "./tool-permissions.js";
import {
  createInteractionHeader,
  createSpan,
  createStack,
  type InteractionStatusProjection,
} from "./view-components.js";

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
  status: InteractionStatusProjection | undefined,
): Result<Component, ComponentError> {
  const header = createInteractionHeader(
    "Permissions",
    "current session",
    status,
  );
  if (!header.ok) return header;

  const rows: Component[] = [];
  for (let position = 0; position < projection.items.length; position += 1) {
    const item = projection.items.at(position);
    if (item === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const name = createSpan(item.name, "plain", {
      slant: "italic",
    });
    const risk = createSpan("  " + item.risk, "muted");
    const mode = createSpan(modeLabel(item.mode), "plain");
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
  return InteractionDock.create(list.value, {
    focus: "selection",
    header: header.value,
    maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
  });
}

function createToolDecision(
  projection: ToolDecisionProjection,
  status: InteractionStatusProjection | undefined,
): Result<Component, ComponentError> {
  const rows: Component[] = [];
  for (let position = 0; position < projection.actions.length; position += 1) {
    const action = projection.actions.at(position);
    if (action === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const label = createSpan(actionLabel(action), "plain");
    if (!label.ok) return label;
    const row = InlineText.create([label.value]);
    if (!row.ok) return row;
    rows.push(row.value);
  }
  const list = SelectionList.create(rows, projection.selectedIndex);
  if (!list.ok) return list;
  const header = status === undefined
    ? undefined
    : createInteractionHeader(undefined, undefined, status);
  if (header !== undefined && !header.ok) return header;
  return InteractionDock.create(list.value, {
    focus: "selection",
    ...(header === undefined ? {} : { header: header.value }),
    maximumRows: CONVERSATION_DENSITY.interactionDockMaximumRows,
  });
}

/** Projects the one active permission editor or pending-call decision. */
export function createPermissionsDocument(
  menu: PermissionMenuProjection | undefined,
  decision: ToolDecisionProjection | undefined,
  status?: InteractionStatusProjection,
): Result<Component, ComponentError> {
  if (menu !== undefined && decision !== undefined) {
    return err(new ComponentError("invalidComponent", undefined));
  }
  if (decision !== undefined) {
    return createToolDecision(decision, status);
  }
  return menu === undefined
    ? createStack([])
    : createPermissionMenu(menu, status);
}
