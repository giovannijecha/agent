import {
  type Component,
  ComponentError,
  ComponentStack,
  err,
  Spacer,
  TextSpan,
  type Result,
  type TextStyleOptions,
  type Tone,
} from "@agent/tui";

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
