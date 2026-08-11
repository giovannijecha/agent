import {
  type Component,
  ComponentError,
  err,
  MarkdownBlock,
  type Result,
  Surface,
} from "@agent/tui";

import type { TranscriptEntry } from "./chat-state.js";
import { createSpacer, createStack } from "./view-components.js";

/** Builds the single role-free conversation document shared by every turn. */
export function createConversationDocument(
  entries: readonly TranscriptEntry[],
): Result<Component, ComponentError> {
  const components: Component[] = [];
  for (let position = 0; position < entries.length; position += 1) {
    const entry = entries.at(position);
    if (entry === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const markdown = MarkdownBlock.create(entry.content, "head");
    if (!markdown.ok) return markdown;

    if (entry.role === "user") {
      const surfaced = Surface.create(markdown.value, {
        extent: "content",
        horizontalPadding: 1,
        slant: "italic",
        surface: "subtle",
      });
      if (!surfaced.ok) return surfaced;
      components.push(surfaced.value);
    } else {
      components.push(markdown.value);
    }

    if (position < entries.length - 1) {
      const gap = createSpacer();
      if (!gap.ok) return gap;
      components.push(gap.value);
    }
  }
  return createStack(components, "tail");
}
