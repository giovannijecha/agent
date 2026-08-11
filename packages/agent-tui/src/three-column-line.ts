import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { RichRow, TextSpan } from "./rich-row.js";
import type { Viewport } from "./viewport.js";

export type ThreeColumnLineOptions = Readonly<{
  gap: number;
}>;

function fitRow(
  row: RichRow,
  columns: number,
): Result<RichRow, ComponentError> {
  if (columns < 1 || row.cellWidth === 0) {
    return ok(RichRow.empty());
  }
  const fitted = row.fit(columns);
  return fitted.ok
    ? fitted
    : err(new ComponentError("invalidGeometry", undefined));
}

/** One row with left, physically centered, and right-aligned content zones. */
export class ThreeColumnLine implements Component {
  readonly #center: RichRow;
  readonly #gap: number;
  readonly #left: RichRow;
  readonly #right: RichRow;

  private constructor(
    left: RichRow,
    center: RichRow,
    right: RichRow,
    options: ThreeColumnLineOptions,
  ) {
    this.#left = left;
    this.#center = center;
    this.#right = right;
    this.#gap = options.gap;
    Object.freeze(this);
  }

  static create(
    left: readonly TextSpan[],
    center: readonly TextSpan[],
    right: readonly TextSpan[],
    options: ThreeColumnLineOptions,
  ): Result<ThreeColumnLine, ComponentError> {
    const leftRow = RichRow.create(left);
    if (!leftRow.ok) {
      return err(new ComponentError("invalidRow", leftRow.error.position));
    }
    const centerRow = RichRow.create(center);
    if (!centerRow.ok) {
      return err(new ComponentError("invalidRow", centerRow.error.position));
    }
    const rightRow = RichRow.create(right);
    if (!rightRow.ok) {
      return err(new ComponentError("invalidRow", rightRow.error.position));
    }
    try {
      if (typeof options !== "object" || options === null) {
        return err(new ComponentError("invalidGap", undefined));
      }
      const gap = options.gap;
      if (
        !Number.isSafeInteger(gap) ||
        gap < 0 ||
        gap > TUI_LIMITS.slotValue
      ) {
        return err(new ComponentError("invalidGap", undefined));
      }
      return ok(
        new ThreeColumnLine(
          leftRow.value,
          centerRow.value,
          rightRow.value,
          Object.freeze({ gap }),
        ),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidGap", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return ok(
      Object.freeze({
        preferredRows:
          this.#left.cellWidth === 0 &&
          this.#center.cellWidth === 0 &&
          this.#right.cellWidth === 0
            ? 0
            : 1,
      }),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const composed = this.#compose(viewport.columns);
    if (!composed.ok) {
      return composed;
    }
    const rows = Array.from(
      { length: viewport.rows },
      () => RichRow.empty(),
    );
    rows.splice(0, 1, composed.value);
    return Fragment.create(viewport, rows);
  }

  #compose(columns: number): Result<RichRow, ComponentError> {
    const right = fitRow(this.#right, columns);
    if (!right.ok) {
      return right;
    }
    const rightStart = columns - right.value.cellWidth;
    const centerLimit =
      right.value.cellWidth === 0
        ? columns
        : Math.max(0, rightStart - this.#gap);
    const center = fitRow(this.#center, centerLimit);
    if (!center.ok) {
      return center;
    }
    const idealCenterStart = Math.floor(
      (columns - center.value.cellWidth) / 2,
    );
    const centerStart = Math.min(
      idealCenterStart,
      centerLimit - center.value.cellWidth,
    );
    const leftLimit =
      center.value.cellWidth > 0
        ? Math.max(0, centerStart - this.#gap)
        : right.value.cellWidth > 0
          ? Math.max(0, rightStart - this.#gap)
          : columns;
    const left = fitRow(this.#left, leftLimit);
    if (!left.ok) {
      return left;
    }

    const spans: TextSpan[] = [...left.value.spans];
    let cursor = left.value.cellWidth;
    const appendedCenter = this.#appendAt(
      spans,
      cursor,
      centerStart,
      center.value,
    );
    if (!appendedCenter.ok) {
      return appendedCenter;
    }
    cursor = appendedCenter.value;
    const appendedRight = this.#appendAt(
      spans,
      cursor,
      rightStart,
      right.value,
    );
    if (!appendedRight.ok) {
      return appendedRight;
    }
    const row = RichRow.create(spans);
    return row.ok
      ? row
      : err(new ComponentError("invalidRow", row.error.position));
  }

  #appendAt(
    spans: TextSpan[],
    cursor: number,
    start: number,
    row: RichRow,
  ): Result<number, ComponentError> {
    if (row.cellWidth === 0) {
      return ok(cursor);
    }
    const spaces = start - cursor;
    if (spaces > 0) {
      const padding = TextSpan.create(" ".repeat(spaces), "plain");
      if (!padding.ok) {
        return err(new ComponentError("invalidRow", undefined));
      }
      spans.push(padding.value);
    }
    spans.push(...row.spans);
    return ok(Math.max(cursor, start) + row.cellWidth);
  }
}
