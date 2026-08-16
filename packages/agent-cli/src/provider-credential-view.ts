import {
  type Component,
  ComponentError,
  type Result,
  SplitLine,
  Surface,
} from "@agent/tui";

import { CONVERSATION_DENSITY } from "./conversation-density.js";
import { createSpan, createStack } from "./view-components.js";

export type ProviderCredentialProjection = Readonly<{
  providerName: string;
}>;

/** Identifies concealed current-process credential entry without echoing it. */
export function createProviderCredentialDocument(
  projection: ProviderCredentialProjection | undefined,
): Result<Component, ComponentError> {
  if (projection === undefined) {
    return createStack([]);
  }
  const title = createSpan("Connect " + projection.providerName, "emphasis");
  const scope = createSpan("process only", "muted");
  if (!title.ok) return title;
  if (!scope.ok) return scope;
  const header = SplitLine.create([title.value], [scope.value], {
    gap: 2,
    priority: "left",
  });
  if (!header.ok) return header;
  return Surface.create(header.value, {
    extent: "viewport",
    horizontalPadding: CONVERSATION_DENSITY.contentInsetCells,
    slant: "inherit",
    surface: "none",
    verticalPadding: CONVERSATION_DENSITY.flushRows,
  });
}
