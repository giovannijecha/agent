/** Closed text slants understood by the owned renderer. */
export type TextSlant = "italic" | "normal";

/** Closed selection highlight independent from semantic foreground/surface. */
export type TextMark = "none" | "selected";

/** Closed background surfaces understood by the owned renderer. */
export type SurfaceTone =
  | "attention"
  | "failure"
  | "inset"
  | "none"
  | "subtle"
  | "success";

/** Optional composable style dimensions for one semantic text span. */
export type TextStyleOptions = Readonly<{
  mark?: TextMark;
  slant?: TextSlant;
  surface?: SurfaceTone;
}>;

/** Immutable normalized style stored by every text span. */
export type TextStyle = Readonly<{
  mark: TextMark;
  slant: TextSlant;
  surface: SurfaceTone;
}>;

const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  mark: "none",
  slant: "normal",
  surface: "none",
});

export function isTextMark(value: unknown): value is TextMark {
  return value === "none" || value === "selected";
}

export function isTextSlant(value: unknown): value is TextSlant {
  return value === "normal" || value === "italic";
}

export function isSurfaceTone(value: unknown): value is SurfaceTone {
  return (
    value === "attention" ||
    value === "failure" ||
    value === "inset" ||
    value === "none" ||
    value === "subtle" ||
    value === "success"
  );
}

/** Contains and normalizes untrusted style metadata without retaining it. */
export function normalizeTextStyle(value: unknown): TextStyle | undefined {
  if (value === undefined) {
    return DEFAULT_TEXT_STYLE;
  }
  try {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const candidate = value as Partial<TextStyleOptions>;
    const mark = candidate.mark ?? "none";
    const slant = candidate.slant ?? "normal";
    const surface = candidate.surface ?? "none";
    if (!isTextMark(mark) || !isTextSlant(slant) || !isSurfaceTone(surface)) {
      return undefined;
    }
    return Object.freeze({ mark, slant, surface });
  } catch (_cause: unknown) {
    return undefined;
  }
}
