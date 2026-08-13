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
    document: entry.document,
    selection,
  });
  if (!markdown.ok) return markdown;

  return Surface.create(markdown.value, {
    extent: "viewport",
    horizontalPadding: 1,
    slant: entry.role === "user" ? "italic" : "inherit",
    surface: entry.role === "user" ? "subtle" : "none",
    verticalPadding:
      entry.role === "user"
        ? CONVERSATION_DENSITY.userVerticalPadding
        : 0,
  });
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
      const gap = createSpacer();
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
    const next = entries.at(position + 1);
    const turnEntries =
      entry.role === "user" && next?.role === "assistant"
        ? entries.slice(position, position + 2)
        : entries.slice(position, position + 1);
    const turn = createTurnComponent(turnEntries, selection);
    if (!turn.ok) return turn;
    components.push(turn.value);
    position += turnEntries.length;

    if (position < entries.length) {
      const gap = createSpacer();
      if (!gap.ok) return gap;
      components.push(gap.value);
    }
  }
  return createStack(components, "tail");
}
