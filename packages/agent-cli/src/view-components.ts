import {
  type Component,
  ComponentError,
  ComponentStack,
  err,
  HorizontalInset,
  Spacer,
  TextSpan,
  TUI_LIMITS,
  type Result,
  type TextStyleOptions,
  type Tone,
} from "@agent/tui";

export const SHELL_MAX_COLUMNS = 132;

export function createSpan(
  text: string,
  tone: Tone,
  style?: TextStyleOptions,
): Result<TextSpan, ComponentError> {
  const created = TextSpan.create(text, tone, style);
  return created.ok
    ? created
    : err(new ComponentError("invalidRow", created.error.position));
}

export function createStack(
  components: readonly Component[],
  anchor: "head" | "tail" = "head",
): Result<ComponentStack, ComponentError> {
  return ComponentStack.create(components, anchor);
}

export function createSpacer(rows = 1): Result<Spacer, ComponentError> {
  return Spacer.create(rows);
}

export function constrain(
  component: Component,
): Result<HorizontalInset, ComponentError> {
  return HorizontalInset.create(component, {
    maximumColumns: SHELL_MAX_COLUMNS,
    minimumMargin: 1,
  });
}

/** Applies only the shell edge margin without constraining the working width. */
export function insetEdges(
  component: Component,
): Result<HorizontalInset, ComponentError> {
  return HorizontalInset.create(component, {
    maximumColumns: TUI_LIMITS.componentColumns,
    minimumMargin: 1,
  });
}
