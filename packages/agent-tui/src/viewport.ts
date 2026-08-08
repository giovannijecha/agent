import { err, ok, type Result } from "./result.js";

/** Invalid terminal geometry without any platform-specific details. */
export class ViewportError {
  readonly #dimension: "columns" | "rows";
  readonly #value: number;

  constructor(dimension: "columns" | "rows", value: number) {
    this.#dimension = dimension;
    this.#value = value;
    Object.freeze(this);
  }

  get dimension(): "columns" | "rows" {
    return this.#dimension;
  }

  get value(): number {
    return this.#value;
  }
}

/** Validated immutable terminal dimensions. */
export class Viewport {
  readonly #columns: number;
  readonly #rows: number;

  private constructor(columns: number, rows: number) {
    this.#columns = columns;
    this.#rows = rows;
    Object.freeze(this);
  }

  /** Creates positive safe-integer terminal geometry. */
  static create(
    columns: number,
    rows: number,
  ): Result<Viewport, ViewportError> {
    if (!Number.isSafeInteger(columns) || columns < 1) {
      return err(new ViewportError("columns", columns));
    }
    if (!Number.isSafeInteger(rows) || rows < 1) {
      return err(new ViewportError("rows", rows));
    }
    return ok(new Viewport(columns, rows));
  }

  get columns(): number {
    return this.#columns;
  }

  get rows(): number {
    return this.#rows;
  }
}
