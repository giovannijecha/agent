import {
  type Component,
  ComponentError,
  ComponentStack,
  err,
  Spacer,
  SplitLine,
  TextSpan,
  type Result,
  type TextStyleOptions,
  type Tone,
} from "@agent/tui";

export type InteractionStatusProjection = Readonly<{
  text: string;
  tone: Tone;
}>;

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

/** Creates one selector header whose transient status owns the trailing edge. */
export function createInteractionHeader(
  title: string | undefined,
  context: string | undefined,
  status: InteractionStatusProjection | undefined,
): Result<SplitLine, ComponentError> {
  const left: TextSpan[] = [];
  const right: TextSpan[] = [];
  if (title !== undefined) {
    const heading = createSpan(title, "emphasis");
    if (!heading.ok) return heading;
    left.push(heading.value);
  }
  const trailing = status === undefined
    ? context === undefined
      ? undefined
      : createSpan(context, "muted")
    : createSpan(status.text, status.tone);
  if (trailing !== undefined) {
    if (!trailing.ok) return trailing;
    right.push(trailing.value);
  }
  return SplitLine.create(left, right, { gap: 2, priority: "left" });
}
