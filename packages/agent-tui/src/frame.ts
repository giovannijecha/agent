import { hasLoneSurrogate, textCellWidth } from "./cell-width.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

/** A zero-based visible caret position measured in terminal cells. */
export type Caret = Readonly<{ row: number; column: number }>;

export type FrameErrorKind =
  | "controlCharacter"
  | "invalidCaret"
  | "invalidScalar"
  | "invalidTone"
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
  readonly #tones: readonly Tone[];

  private constructor(
    lines: readonly string[],
    caret: Caret | undefined,
    tones: readonly Tone[],
  ) {
    this.#lines = Object.freeze([...lines]);
    this.#caret = caret;
    this.#tones = Object.freeze([...tones]);
    Object.freeze(this);
  }

  /** Validates and copies printable rows and tones without rejected content. */
  static create(
    lines: readonly string[],
    caret?: Caret,
    tones?: readonly Tone[],
  ): Result<Frame, FrameError> {
    if (lines.length > TUI_LIMITS.frameRows) {
      return err(new FrameError("tooManyRows", undefined));
    }

    if (tones !== undefined && !Array.isArray(tones)) {
      return err(new FrameError("invalidTone", undefined));
    }
    if (tones !== undefined && tones.length !== lines.length) {
      return err(new FrameError("invalidTone", undefined));
    }

    const storedTones: Tone[] = [];
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
      let tone: unknown = "plain";
      try {
        tone = tones?.at(row) ?? "plain";
      } catch (_cause: unknown) {
        return err(new FrameError("invalidTone", row));
      }
      if (!isTone(tone)) {
        return err(new FrameError("invalidTone", row));
      }
      storedTones.push(tone);
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

    return ok(new Frame(lines, storedCaret, storedTones));
  }

  get lines(): readonly string[] {
    return this.#lines;
  }

  get caret(): Caret | undefined {
    return this.#caret;
  }

  get tones(): readonly Tone[] {
    return this.#tones;
  }
}
