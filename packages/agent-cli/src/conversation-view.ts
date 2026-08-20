import {
  type Component,
  ComponentError,
  err,
  MarkdownBlock,
  type Result,
  Surface,
  TextSelection,
} from "@agent/tui";

import type { TranscriptEntry } from "./chat-state.js";
import { CONVERSATION_DENSITY } from "./conversation-density.js";
import { createSpacer, createStack } from "./view-components.js";

function createEntryComponent(
  entry: TranscriptEntry,
  selection: TextSelection | undefined,
): Result<Component, ComponentError> {
  const markdown = MarkdownBlock.create(entry.content, "head", {
    baseTone: entry.role === "user"
      ? "accent"
      : entry.role === "reasoning"
        ? "muted"
        : "plain",
    document: entry.document,
    selection,
  });
  if (!markdown.ok) return markdown;

  const surface = Surface.create(markdown.value, {
    extent: "viewport",
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: entry.role === "user" ? "italic" : "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
  return surface;
}

function createTurnComponent(
  entries: readonly TranscriptEntry[],
  selection: TextSelection | undefined,
): Result<Component, ComponentError> {
  const components: Component[] = [];
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries.at(position);
    if (entry === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const component = createEntryComponent(entry, selection);
    if (!component.ok) return component;
    components.push(component.value);

    if (position < entries.length - 1) {
      const gap = createSpacer(CONVERSATION_DENSITY.rhythmRows);
      if (!gap.ok) return gap;
      components.push(gap.value);
    }
  }
  return createStack(components);
}

/** Builds the single role-free conversation document shared by every turn. */
export function createConversationDocument(
  entries: readonly TranscriptEntry[],
  selection: TextSelection | undefined = undefined,
): Result<Component, ComponentError> {
  const components: Component[] = [];
  for (let position = 0; position < entries.length;) {
    const entry = entries.at(position);
    if (entry === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    let turnEnd = position + 1;
    if (entry.role === "user") {
      const reasoning = entries.at(turnEnd);
      if (reasoning?.role === "reasoning") {
        turnEnd += 1;
      }
      const assistant = entries.at(turnEnd);
      if (assistant?.role === "assistant") {
        turnEnd += 1;
      }
    }
    const turnEntries = entries.slice(position, turnEnd);
    const turn = createTurnComponent(turnEntries, selection);
    if (!turn.ok) return turn;
    components.push(turn.value);
    position += turnEntries.length;

    if (position < entries.length) {
      const gap = createSpacer(CONVERSATION_DENSITY.rhythmRows);
      if (!gap.ok) return gap;
      components.push(gap.value);
    }
  }
  return createStack(components, "tail");
}
