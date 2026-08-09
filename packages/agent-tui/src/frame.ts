import { TUI_LIMITS } from "./limits.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";

/** A zero-based visible caret position measured in terminal cells. */
export type Caret = Readonly<{ row: number; column: number }>;

export type FrameErrorKind = "invalidCaret" | "invalidRow" | "tooManyRows";

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

/** Atomic validated terminal frame containing immutable structured rows. */
export class Frame {
  readonly #caret: Caret | undefined;
  readonly #rows: readonly RichRow[];

  private constructor(rows: readonly RichRow[], caret: Caret | undefined) {
    this.#rows = Object.freeze([...rows]);
    this.#caret = caret;
    Object.freeze(this);
  }

  /** Revalidates and copies structured rows at the final terminal boundary. */
  static create(
    rows: readonly RichRow[],
    caret?: Caret,
  ): Result<Frame, FrameError> {
    let count: number;
    try {
      if (!Array.isArray(rows)) {
        return err(new FrameError("invalidRow", undefined));
      }
      count = rows.length;
    } catch (_cause: unknown) {
      return err(new FrameError("invalidRow", undefined));
    }
    if (count > TUI_LIMITS.frameRows) {
      return err(new FrameError("tooManyRows", undefined));
    }

    const storedRows: RichRow[] = [];
    for (let row = 0; row < count; row += 1) {
      let candidate: unknown;
      try {
        candidate = rows.at(row);
      } catch (_cause: unknown) {
        return err(new FrameError("invalidRow", row));
      }
      const copied = RichRow.snapshot(candidate);
      if (!copied.ok) {
        return err(new FrameError("invalidRow", row));
      }
      storedRows.push(copied.value);
    }

    let storedCaret: Caret | undefined;
    if (caret !== undefined) {
      try {
        if (typeof caret !== "object" || caret === null) {
          return err(new FrameError("invalidCaret", undefined));
        }
        const row = caret.row;
        const column = caret.column;
        const line = storedRows.at(row);
        if (
          !Number.isSafeInteger(row) ||
          row < 0 ||
          !Number.isSafeInteger(column) ||
          column < 0 ||
          line === undefined ||
          column > line.cellWidth
        ) {
          return err(new FrameError("invalidCaret", row));
        }
        storedCaret = Object.freeze({ row, column });
      } catch (_cause: unknown) {
        return err(new FrameError("invalidCaret", undefined));
      }
    }

    return ok(new Frame(storedRows, storedCaret));
  }

  get rows(): readonly RichRow[] {
    return this.#rows;
  }

  get caret(): Caret | undefined {
    return this.#caret;
  }
}
