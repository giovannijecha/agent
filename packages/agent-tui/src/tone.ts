/** Closed semantic emphasis roles understood by the owned renderer. */
export type Tone =
  | "accent"
  | "attention"
  | "diffAdded"
  | "diffRemoved"
  | "emphasis"
  | "failure"
  | "highContrast"
  | "muted"
  | "plain"
  | "success"
  | "syntaxComment"
  | "syntaxKeyword"
  | "syntaxLiteral"
  | "syntaxName"
  | "syntaxString";

/** Runtime guard used at every public component and frame boundary. */
export function isTone(value: unknown): value is Tone {
  return (
    value === "plain" ||
    value === "muted" ||
    value === "emphasis" ||
    value === "highContrast" ||
    value === "accent" ||
    value === "attention" ||
    value === "diffAdded" ||
    value === "diffRemoved" ||
    value === "success" ||
    value === "failure" ||
    value === "syntaxComment" ||
    value === "syntaxKeyword" ||
    value === "syntaxLiteral" ||
    value === "syntaxName" ||
    value === "syntaxString"
  );
}
