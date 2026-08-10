/** Closed semantic emphasis roles understood by the owned renderer. */
export type Tone =
  | "accent"
  | "attention"
  | "emphasis"
  | "failure"
  | "muted"
  | "plain"
  | "success";

/** Runtime guard used at every public component and frame boundary. */
export function isTone(value: unknown): value is Tone {
  return (
    value === "plain" ||
    value === "muted" ||
    value === "emphasis" ||
    value === "accent" ||
    value === "attention" ||
    value === "success" ||
    value === "failure"
  );
}
