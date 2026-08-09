import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";

export type ScrollErrorKind =
  | "invalidDelta"
  | "invalidFollow"
  | "invalidMetrics"
  | "invalidOffset";

/** Content-free failure from immutable scroll geometry. */
export class ScrollError {
  readonly #kind: ScrollErrorKind;

  constructor(kind: ScrollErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ScrollErrorKind {
    return this.#kind;
  }
}

function validOffset(offset: number): boolean {
  return (
    Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= TUI_LIMITS.frameRows
  );
}

function validMetrics(contentRows: number, viewportRows: number): boolean {
  return (
    Number.isSafeInteger(contentRows) &&
    contentRows >= 0 &&
    contentRows <= TUI_LIMITS.frameRows &&
    Number.isSafeInteger(viewportRows) &&
    viewportRows >= 1 &&
    viewportRows <= TUI_LIMITS.frameRows
  );
}

function maximumOffset(contentRows: number, viewportRows: number): number {
  return Math.max(0, contentRows - viewportRows);
}

/** Immutable row offset and follow-end policy, independent from content. */
export class ScrollState {
  readonly #followingEnd: boolean;
  readonly #offset: number;

  private constructor(offset: number, followingEnd: boolean) {
    this.#offset = offset;
    this.#followingEnd = followingEnd;
    Object.freeze(this);
  }

  /** Creates validated scroll geometry without retaining display content. */
  static create(
    offset: number,
    followingEnd: boolean,
  ): Result<ScrollState, ScrollError> {
    if (!validOffset(offset)) {
      return err(new ScrollError("invalidOffset"));
    }
    if (typeof followingEnd !== "boolean") {
      return err(new ScrollError("invalidFollow"));
    }
    return ok(new ScrollState(offset, followingEnd));
  }

  /** Creates the canonical state that tracks the newest content. */
  static followEnd(): ScrollState {
    return new ScrollState(0, true);
  }

  get offset(): number {
    return this.#offset;
  }

  get followingEnd(): boolean {
    return this.#followingEnd;
  }

  /** Resolves growth or shrink while preserving explicit follow policy. */
  reconcile(
    contentRows: number,
    viewportRows: number,
  ): Result<ScrollState, ScrollError> {
    if (!validMetrics(contentRows, viewportRows)) {
      return err(new ScrollError("invalidMetrics"));
    }
    const maximum = maximumOffset(contentRows, viewportRows);
    return ok(
      new ScrollState(
        this.#followingEnd ? maximum : Math.min(this.#offset, maximum),
        this.#followingEnd,
      ),
    );
  }

  /** Moves by a bounded signed row count and derives follow-end truth. */
  move(
    delta: number,
    contentRows: number,
    viewportRows: number,
  ): Result<ScrollState, ScrollError> {
    if (
      !Number.isSafeInteger(delta) ||
      Math.abs(delta) > TUI_LIMITS.frameRows
    ) {
      return err(new ScrollError("invalidDelta"));
    }
    const current = this.reconcile(contentRows, viewportRows);
    if (!current.ok) {
      return current;
    }
    const maximum = maximumOffset(contentRows, viewportRows);
    const offset = Math.max(
      0,
      Math.min(maximum, current.value.offset + delta),
    );
    return ok(new ScrollState(offset, offset === maximum));
  }

  /** Selects the oldest visible row. */
  toStart(
    contentRows: number,
    viewportRows: number,
  ): Result<ScrollState, ScrollError> {
    if (!validMetrics(contentRows, viewportRows)) {
      return err(new ScrollError("invalidMetrics"));
    }
    const maximum = maximumOffset(contentRows, viewportRows);
    return ok(new ScrollState(0, maximum === 0));
  }

  /** Selects and follows the newest visible row. */
  toEnd(
    contentRows: number,
    viewportRows: number,
  ): Result<ScrollState, ScrollError> {
    if (!validMetrics(contentRows, viewportRows)) {
      return err(new ScrollError("invalidMetrics"));
    }
    return ok(
      new ScrollState(maximumOffset(contentRows, viewportRows), true),
    );
  }
}
