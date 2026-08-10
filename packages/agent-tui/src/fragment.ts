import { ComponentError, validComponentViewport } from "./component.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

/** Zero-based caret local to one rendered component fragment. */
export type FragmentCaret = Readonly<{ row: number; column: number }>;

/** Immutable structured component output constrained to an exact viewport. */
export class Fragment {
  readonly #caret: FragmentCaret | undefined;
  readonly #rows: readonly RichRow[];

  private constructor(
    rows: readonly RichRow[],
    caret: FragmentCaret | undefined,
  ) {
    this.#rows = Object.freeze([...rows]);
    this.#caret = caret;
    Object.freeze(this);
  }

  /** Validates exact rows, printable width, and an optional local caret. */
  static create(
    viewport: Viewport,
    rows: readonly RichRow[],
    caret?: FragmentCaret,
  ): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }

    let count: number;
    try {
      if (!Array.isArray(rows)) {
        return err(new ComponentError("rowMismatch", undefined));
      }
      count = rows.length;
    } catch (_cause: unknown) {
      return err(new ComponentError("rowMismatch", undefined));
    }
    if (count !== viewport.rows) {
      return err(new ComponentError("rowMismatch", count));
    }

    const storedRows: RichRow[] = [];
    for (let row = 0; row < count; row += 1) {
      let candidate: unknown;
      try {
        candidate = rows.at(row);
      } catch (_cause: unknown) {
        return err(new ComponentError("invalidRow", row));
      }
      const copied = RichRow.snapshot(candidate);
      if (!copied.ok) {
        return err(new ComponentError("invalidRow", row));
      }
      if (copied.value.cellWidth > viewport.columns) {
        return err(new ComponentError("lineTooWide", row));
      }
      storedRows.push(copied.value);
    }

    let storedCaret: FragmentCaret | undefined;
    if (caret !== undefined) {
      try {
        if (typeof caret !== "object" || caret === null) {
          return err(new ComponentError("invalidCaret", undefined));
        }
        const row = caret.row;
        const column = caret.column;
        const line = storedRows.at(row);
        if (
          !Number.isSafeInteger(row) ||
          row < 0 ||
          row >= viewport.rows ||
          !Number.isSafeInteger(column) ||
          column < 0 ||
          column >= viewport.columns ||
          line === undefined ||
          column > line.cellWidth
        ) {
          return err(new ComponentError("invalidCaret", row));
        }
        storedCaret = Object.freeze({ row, column });
      } catch (_cause: unknown) {
        return err(new ComponentError("invalidCaret", undefined));
      }
    }
    return ok(new Fragment(storedRows, storedCaret));
  }

  get rows(): readonly RichRow[] {
    return this.#rows;
  }

  get caret(): FragmentCaret | undefined {
    return this.#caret;
  }
}
