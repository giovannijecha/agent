import {
  type Component,
  ComponentError,
  HorizontalInset,
  type Result,
  TUI_LIMITS,
  type Viewport,
} from "@agent/tui";

export const CONVERSATION_STAGE_MINIMUM_MARGIN = 1;

export type ConversationStageProjection = Readonly<{
  columns: number;
  left: number;
}>;

/**
 * Projects the one responsive conversation stage without consulting terminal
 * state. Components and tests share this geometry contract.
 */
export function projectConversationStage(
  viewport: Viewport,
): ConversationStageProjection {
  const reservedMargins = CONVERSATION_STAGE_MINIMUM_MARGIN * 2;
  const columns =
    viewport.columns <= reservedMargins
      ? viewport.columns
      : viewport.columns - reservedMargins;
  const left = Math.floor((viewport.columns - columns) / 2);
  return Object.freeze({
    columns,
    left,
  });
}

/** Aligns a generic component to the canonical responsive conversation stage. */
export function createConversationStage(
  component: Component,
): Result<HorizontalInset, ComponentError> {
  return HorizontalInset.create(component, {
    maximumColumns: TUI_LIMITS.componentColumns,
    minimumMargin: CONVERSATION_STAGE_MINIMUM_MARGIN,
  });
}
