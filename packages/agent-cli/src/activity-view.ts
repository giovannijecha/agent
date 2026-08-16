import {
  type Component,
  ComponentError,
  err,
  type Result,
  SplitLine,
  Surface,
  TextBlock,
} from "@agent/tui";

import type {
  ToolActivitySnapshot,
} from "./tool-activity-log.js";
import {
  projectToolActivityPresentation,
  type ToolActivityPresentation,
  type ToolActivityTruth,
} from "./tool-activity-presentation.js";
import { CONVERSATION_DENSITY } from "./conversation-density.js";
import { createSpan, createStack } from "./view-components.js";

function truthTone(
  truth: ToolActivityTruth,
): "attention" | "failure" | "success" {
  return truth === "positive"
    ? "success"
    : truth === "negative"
      ? "failure"
      : "attention";
}

type PatchPreviewGroup = {
  rows: string[];
  tone: "diffAdded" | "diffRemoved";
};

function createPatchPreview(
  preview: string,
): Result<Component, ComponentError> {
  const groups: PatchPreviewGroup[] = [];
  for (const row of preview.split("\n")) {
    const tone = row.startsWith("- ")
      ? "diffRemoved" as const
      : row.startsWith("+ ")
        ? "diffAdded" as const
        : undefined;
    if (tone === undefined) {
      return err(new ComponentError("invalidComponent", undefined));
    }
    const previous = groups.at(-1);
    if (previous?.tone === tone) {
      previous.rows.push(row);
    } else {
      groups.push({ rows: [row], tone });
    }
  }
  const components: Component[] = [];
  for (let position = 0; position < groups.length; position += 1) {
    const group = groups.at(position);
    if (group === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const block = TextBlock.create(group.rows.join("\n"), "head", group.tone);
    if (!block.ok) return block;
    components.push(block.value);
  }
  return createStack(components);
}

function createPreview(
  presentation: ToolActivityPresentation,
): Result<Component, ComponentError> {
  return presentation.previewKind === "patchDiff"
    ? createPatchPreview(presentation.preview)
    : TextBlock.create(presentation.preview, "head", "plain");
}

/** Selects the latest tool only while its model turn remains active. */
export function projectCurrentActivity(
  activities: readonly ToolActivitySnapshot[],
  turnActive: boolean,
): ToolActivitySnapshot | undefined {
  return turnActive ? activities.at(-1) : undefined;
}

function createActivityRows(
  activity: ToolActivitySnapshot,
): Result<Component, ComponentError> {
  const projected = projectToolActivityPresentation(activity);
  if (!projected.ok) {
    return err(new ComponentError("invalidComponent", undefined));
  }
  const presentation = projected.value;
  const semanticTone = truthTone(presentation.truth);
  const marker = createSpan(presentation.marker + " ", semanticTone);
  const action = createSpan(presentation.action, "emphasis");
  const detail = presentation.detail.length === 0
    ? undefined
    : createSpan("  " + presentation.detail, "plain");
  const state = createSpan(presentation.stateLabel, semanticTone);
  if (!marker.ok) return marker;
  if (!action.ok) return action;
  if (detail !== undefined && !detail.ok) return detail;
  if (!state.ok) return state;
  const left = [marker.value, action.value];
  if (detail !== undefined) left.push(detail.value);
  const header = SplitLine.create(
    left,
    [state.value],
    {
      gap: 2,
      priority: "right",
    },
  );
  if (!header.ok) return header;

  const components: Component[] = [header.value];
  if (
    presentation.state === "permission" &&
    presentation.preview.length > 0
  ) {
    const preview = createPreview(presentation);
    if (!preview.ok) return preview;
    components.push(preview.value);
  }
  const stack = createStack(components);
  if (!stack.ok) return stack;
  return Surface.create(stack.value, {
    extent: "viewport",
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
}

/** Builds one canonical activity surface for every owned tool. */
export function createActivityDocument(
  activity: ToolActivitySnapshot | undefined,
): Result<Component, ComponentError> {
  const components: Component[] = [];
  if (activity !== undefined) {
    const rendered = createActivityRows(activity);
    if (!rendered.ok) return rendered;
    components.push(rendered.value);
  }
  const stack = createStack(components, "head");
  return stack;
}
