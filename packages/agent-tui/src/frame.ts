import { hasLoneSurrogate, textCellWidth } from "./cell-width.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

/** A zero-based visible caret position measured in terminal cells. */
export type Caret = Readonly<{ row: number; column: number }>;

export type FrameErrorKind =
  | "controlCharacter"
  | "invalidCaret"
  | "invalidScalar"
  | "lineTooLong"
  | "tooManyRows";

/** Structural frame failure that never retains rejected display content. */
export class FrameError {
  readonly #kind: FrameErrorKind;
  readonly #row: number | undefined;

  constructor(kind: FrameErrorKind, row: number | undefined) {
    this.#kind = kind;
    this.#row = row;
    Object.freeze(this);
  }

  get kind(): FrameErrorKind {
    return this.#kind;
  }

  get row(): number | undefined {
    return this.#row;
  }
}

function countCodePoints(text: string): number {
  let count = 0;
  for (const _character of text) {
    count += 1;
    if (count > TUI_LIMITS.frameLineCodePoints) {
      break;
    }
  }
  return count;
}

/** Atomic validated terminal frame containing untrusted printable rows. */
export class Frame {
  readonly #lines: readonly string[];
  readonly #caret: Caret | undefined;

  private constructor(lines: readonly string[], caret: Caret | undefined) {
    this.#lines = Object.freeze([...lines]);
    this.#caret = caret;
    Object.freeze(this);
  }

  /** Validates and copies a complete frame without retaining rejected content. */
  static create(
    lines: readonly string[],
    caret?: Caret,
  ): Result<Frame, FrameError> {
    if (lines.length > TUI_LIMITS.frameRows) {
      return err(new FrameError("tooManyRows", undefined));
    }

    for (let row = 0; row < lines.length; row += 1) {
      const line = lines.at(row);
      if (line === undefined) {
        return err(new FrameError("lineTooLong", row));
      }
      if (CONTROL_CHARACTER.test(line)) {
        return err(new FrameError("controlCharacter", row));
      }
      if (hasLoneSurrogate(line)) {
        return err(new FrameError("invalidScalar", row));
      }
      if (countCodePoints(line) > TUI_LIMITS.frameLineCodePoints) {
        return err(new FrameError("lineTooLong", row));
      }
    }

    let storedCaret: Caret | undefined;
    if (caret !== undefined) {
      const line = lines.at(caret.row);
      if (
        !Number.isSafeInteger(caret.row) ||
        caret.row < 0 ||
        !Number.isSafeInteger(caret.column) ||
        caret.column < 0 ||
        line === undefined ||
        caret.column > textCellWidth(line)
      ) {
        return err(new FrameError("invalidCaret", caret.row));
      }
      storedCaret = Object.freeze({ row: caret.row, column: caret.column });
    }

    return ok(new Frame(lines, storedCaret));
  }

  get lines(): readonly string[] {
    return this.#lines;
  }

  get caret(): Caret | undefined {
    return this.#caret;
  }
}
