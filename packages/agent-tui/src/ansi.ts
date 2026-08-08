/** ANSI control sequences owned by the renderer. */

export const CLEAR_SCREEN = "\u001B[2J";
export const CLEAR_ROW = "\u001B[2K";
export const CURSOR_HOME = "\u001B[H";
export const CURSOR_HIDE = "\u001B[?25l";
export const CURSOR_SHOW = "\u001B[?25h";
export const ALTERNATE_SCREEN_ENTER = "\u001B[?1049h";
export const ALTERNATE_SCREEN_LEAVE = "\u001B[?1049l";

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
