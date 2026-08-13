/** ANSI control sequences owned by the renderer. */

import type { SurfaceTone, TextMark, TextSlant } from "./text-style.js";
import type { Tone } from "./tone.js";

export const CLEAR_SCREEN = "\u001B[2J";
export const CLEAR_ROW = "\u001B[2K";
export const CURSOR_HOME = "\u001B[H";
export const CURSOR_HIDE = "\u001B[?25l";
export const CURSOR_SHOW = "\u001B[?25h";
export const CURSOR_STEADY_BAR = "\u001B[6 q";
export const CURSOR_STYLE_DEFAULT = "\u001B[0 q";
export const ALTERNATE_SCREEN_ENTER = "\u001B[?1049h";
export const ALTERNATE_SCREEN_LEAVE = "\u001B[?1049l";
export const BRACKETED_PASTE_ENABLE = "\u001B[?2004h";
export const BRACKETED_PASTE_DISABLE = "\u001B[?2004l";
export const MOUSE_BUTTON_EVENT_ENABLE = "\u001B[?1002h";
export const MOUSE_BUTTON_EVENT_DISABLE = "\u001B[?1002l";
export const MOUSE_SGR_ENABLE = "\u001B[?1006h";
export const MOUSE_SGR_DISABLE = "\u001B[?1006l";
export const SYNCHRONIZED_OUTPUT_BEGIN = "\u001B[?2026h";
export const SYNCHRONIZED_OUTPUT_END = "\u001B[?2026l";
export const STYLE_RESET = "\u001B[0m";
const STRING_TERMINATOR = "\u001B\\";

function toneParameters(tone: Tone): readonly string[] {
  switch (tone) {
    case "accent":
      return Object.freeze(["38", "2", "102", "155", "210"]);
    case "attention":
      return Object.freeze(["1", "38", "2", "230", "191", "95"]);
    case "emphasis":
      return Object.freeze(["1"]);
    case "failure":
      return Object.freeze(["1", "38", "2", "232", "112", "112"]);
    case "muted":
      return Object.freeze(["38", "2", "112", "124", "137"]);
    case "plain":
      return Object.freeze([]);
    case "success":
      return Object.freeze(["1", "38", "2", "134", "203", "146"]);
    case "syntaxComment":
      return Object.freeze(["38", "2", "127", "157", "135"]);
    case "syntaxKeyword":
      return Object.freeze(["38", "2", "105", "184", "255"]);
    case "syntaxLiteral":
      return Object.freeze(["38", "2", "166", "213", "123"]);
    case "syntaxName":
      return Object.freeze(["38", "2", "131", "213", "245"]);
    case "syntaxString":
      return Object.freeze(["38", "2", "221", "184", "134"]);
  }
}

/** Maps one validated composable span style to a renderer-owned SGR sequence. */
export function beginStyle(
  tone: Tone,
  mark: TextMark,
  slant: TextSlant,
  surface: SurfaceTone,
): string {
  const parameters = [...toneParameters(tone)];
  if (mark === "selected") {
    parameters.push("7");
  }
  if (slant === "italic") {
    parameters.push("3");
  }
  if (surface === "subtle") {
    parameters.push("48", "2", "31", "38", "47");
  } else if (surface === "inset") {
    parameters.push("48", "2", "18", "24", "31");
  } else if (surface === "success") {
    parameters.push("48", "2", "22", "55", "34");
  } else if (surface === "attention") {
    parameters.push("48", "2", "62", "50", "19");
  } else if (surface === "failure") {
    parameters.push("48", "2", "62", "24", "27");
  }
  return parameters.length === 0
    ? ""
    : "\u001B[" + parameters.join(";") + "m";
}

/** Opens one prevalidated visible HTTPS hyperlink. */
export function openHyperlink(target: string): string {
  return "\u001B]8;;" + target + STRING_TERMINATOR;
}

export const HYPERLINK_CLOSE = "\u001B]8;;" + STRING_TERMINATOR;

/** Converts a zero-based cell position into an ANSI cursor command. */
export function moveTo(zeroBasedRow: number, zeroBasedColumn: number): string {
  if (!Number.isSafeInteger(zeroBasedRow) || zeroBasedRow < 0) {
    throw new RangeError("terminal row must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(zeroBasedColumn) || zeroBasedColumn < 0) {
    throw new RangeError("terminal column must be a non-negative safe integer");
  }

  return (
    "\u001B[" +
    String(zeroBasedRow + 1) +
    ";" +
    String(zeroBasedColumn + 1) +
    "H"
  );
}
