import { hasLoneSurrogate, textCellWidth } from "./cell-width.js";
import {
  ComponentError,
  validComponentViewport,
} from "./component.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";
import type { Viewport } from "./viewport.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

function lineTooLong(text: string): boolean {
  let count = 0;
  for (const _character of text) {
    count += 1;
    if (count > TUI_LIMITS.frameLineCodePoints) {
      return true;
    }
  }
  return false;
}

/** Zero-based caret local to one rendered component fragment. */
export type FragmentCaret = Readonly<{ row: number; column: number }>;

/** Immutable printable component output constrained to an exact viewport. */
export class Fragment {
  readonly #caret: FragmentCaret | undefined;
  readonly #lines: readonly string[];
  readonly #tones: readonly Tone[];

  private constructor(
    lines: readonly string[],
    caret: FragmentCaret | undefined,
    tones: readonly Tone[],
  ) {
    this.#lines = Object.freeze([...lines]);
    this.#caret = caret;
    this.#tones = Object.freeze([...tones]);
    Object.freeze(this);
  }

  /** Validates exact rows, printable width, tones, and an optional caret. */
  static create(
    viewport: Viewport,
    lines: readonly string[],
    caret?: FragmentCaret,
    tones?: readonly Tone[],
  ): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    if (!Array.isArray(lines)) {
      return err(new ComponentError("rowMismatch", undefined));
    }
    if (lines.length !== viewport.rows) {
      return err(new ComponentError("rowMismatch", lines.length));
    }
    if (tones !== undefined && !Array.isArray(tones)) {
      return err(new ComponentError("invalidTone", undefined));
    }
    if (tones !== undefined && tones.length !== lines.length) {
      return err(new ComponentError("invalidTone", tones.length));
    }
    const storedTones: Tone[] = [];
    for (let row = 0; row < lines.length; row += 1) {
      const line = lines.at(row);
      if (typeof line !== "string") {
        return err(new ComponentError("rowMismatch", row));
      }
      if (CONTROL_CHARACTER.test(line)) {
        return err(new ComponentError("controlCharacter", row));
      }
      if (hasLoneSurrogate(line)) {
        return err(new ComponentError("invalidScalar", row));
      }
      if (lineTooLong(line)) {
        return err(new ComponentError("lineTooLong", row));
      }
      if (textCellWidth(line) > viewport.columns) {
        return err(new ComponentError("lineTooWide", row));
      }
      let tone: unknown = "plain";
      try {
        tone = tones?.at(row) ?? "plain";
      } catch (_cause: unknown) {
        return err(new ComponentError("invalidTone", row));
      }
      if (!isTone(tone)) {
        return err(new ComponentError("invalidTone", row));
      }
      storedTones.push(tone);
    }

    let storedCaret: FragmentCaret | undefined;
    if (caret !== undefined) {
      if (typeof caret !== "object" || caret === null) {
        return err(new ComponentError("invalidCaret", undefined));
      }
      const line = lines.at(caret.row);
      if (
        !Number.isSafeInteger(caret.row) ||
        caret.row < 0 ||
        caret.row >= viewport.rows ||
        !Number.isSafeInteger(caret.column) ||
        caret.column < 0 ||
        caret.column >= viewport.columns ||
        line === undefined ||
        caret.column > textCellWidth(line)
      ) {
        return err(new ComponentError("invalidCaret", caret.row));
      }
      storedCaret = Object.freeze({ row: caret.row, column: caret.column });
    }
    return ok(new Fragment(lines, storedCaret, storedTones));
  }

  get lines(): readonly string[] {
    return this.#lines;
  }

  get caret(): FragmentCaret | undefined {
    return this.#caret;
  }

  get tones(): readonly Tone[] {
    return this.#tones;
  }
}
