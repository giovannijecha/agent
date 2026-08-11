/** Closed text slants understood by the owned renderer. */
export type TextSlant = "italic" | "normal";

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
  slant?: TextSlant;
  surface?: SurfaceTone;
}>;

/** Immutable normalized style stored by every text span. */
export type TextStyle = Readonly<{
  slant: TextSlant;
  surface: SurfaceTone;
}>;

const DEFAULT_TEXT_STYLE: TextStyle = Object.freeze({
  slant: "normal",
  surface: "none",
});

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
    const slant = candidate.slant ?? "normal";
    const surface = candidate.surface ?? "none";
    if (!isTextSlant(slant) || !isSurfaceTone(surface)) {
      return undefined;
    }
    return Object.freeze({ slant, surface });
  } catch (_cause: unknown) {
    return undefined;
  }
}
