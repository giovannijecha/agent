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

export type SplitPriority = "left" | "right";

export type SplitLineOptions = Readonly<{
  gap: number;
  priority: SplitPriority;
}>;

/** Generic single-row composition with independently retained sides. */
export class SplitLine implements Component {
  readonly #gap: number;
  readonly #left: RichRow;
  readonly #priority: SplitPriority;
  readonly #right: RichRow;

  private constructor(
    left: RichRow,
    right: RichRow,
    options: SplitLineOptions,
  ) {
    this.#left = left;
    this.#right = right;
    this.#gap = options.gap;
    this.#priority = options.priority;
    Object.freeze(this);
  }

  static create(
    left: readonly TextSpan[],
    right: readonly TextSpan[],
    options: SplitLineOptions,
  ): Result<SplitLine, ComponentError> {
    const leftRow = RichRow.create(left);
    if (!leftRow.ok) {
      return err(new ComponentError("invalidRow", leftRow.error.position));
    }
    const rightRow = RichRow.create(right);
    if (!rightRow.ok) {
      return err(new ComponentError("invalidRow", rightRow.error.position));
    }
    try {
      if (typeof options !== "object" || options === null) {
        return err(new ComponentError("invalidPriority", undefined));
      }
      const gap = options.gap;
      const priority = options.priority;
      if (
        !Number.isSafeInteger(gap) ||
        gap < 0 ||
        gap > TUI_LIMITS.slotValue
      ) {
        return err(new ComponentError("invalidGap", undefined));
      }
      if (priority !== "left" && priority !== "right") {
        return err(new ComponentError("invalidPriority", undefined));
      }
      return ok(
        new SplitLine(
          leftRow.value,
          rightRow.value,
          Object.freeze({ gap, priority }),
        ),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidPriority", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return ok(
      Object.freeze({
        preferredRows:
          this.#left.cellWidth === 0 && this.#right.cellWidth === 0 ? 0 : 1,
      }),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const first = this.#compose(viewport.columns);
    if (!first.ok) {
      return first;
    }
    const rows = Array.from(
      { length: viewport.rows },
      () => RichRow.empty(),
    );
    rows.splice(0, 1, first.value);
    return Fragment.create(viewport, rows);
  }

  #compose(columns: number): Result<RichRow, ComponentError> {
    const leftWidth = this.#left.cellWidth;
    const rightWidth = this.#right.cellWidth;
    if (leftWidth === 0 && rightWidth === 0) {
      return ok(RichRow.empty());
    }
    if (rightWidth === 0) {
      return this.#fit(this.#left, columns);
    }
    if (leftWidth === 0) {
      const right = this.#fit(this.#right, columns);
      return right.ok
        ? this.#join(RichRow.empty(), columns - right.value.cellWidth, right.value)
        : right;
    }
    if (leftWidth + this.#gap + rightWidth <= columns) {
      return this.#join(
        this.#left,
        columns - leftWidth - rightWidth,
        this.#right,
      );
    }
    return this.#priority === "left"
      ? this.#retainLeft(columns)
      : this.#retainRight(columns);
  }

  #fit(row: RichRow, columns: number): Result<RichRow, ComponentError> {
    const fitted = row.fit(columns);
    return fitted.ok
      ? fitted
      : err(new ComponentError("invalidGeometry", undefined));
  }

  #fitSecondary(
    row: RichRow,
    remaining: number,
  ): Result<RichRow, ComponentError> {
    if (remaining < 1) {
      return ok(RichRow.empty());
    }
    if (remaining > this.#gap) {
      const withGap = this.#fit(row, remaining - this.#gap);
      if (!withGap.ok || withGap.value.cellWidth > 0) {
        return withGap;
      }
    }
    return this.#fit(row, remaining);
  }

  #join(
    left: RichRow,
    spaces: number,
    right: RichRow,
  ): Result<RichRow, ComponentError> {
    const spans: TextSpan[] = [...left.spans];
    if (spaces > 0) {
      const gap = TextSpan.create(" ".repeat(spaces), "plain");
      if (!gap.ok) {
        return err(new ComponentError("invalidRow", undefined));
      }
      spans.push(gap.value);
    }
    spans.push(...right.spans);
    const row = RichRow.create(spans);
    return row.ok
      ? row
      : err(new ComponentError("invalidRow", row.error.position));
  }

  #retainLeft(columns: number): Result<RichRow, ComponentError> {
    const left = this.#fit(this.#left, columns);
    if (!left.ok || this.#left.cellWidth > columns) {
      return left;
    }
    const remaining = columns - left.value.cellWidth;
    const right = this.#fitSecondary(this.#right, remaining);
    if (!right.ok || right.value.cellWidth === 0) {
      return right.ok ? left : right;
    }
    return this.#join(
      left.value,
      remaining - right.value.cellWidth,
      right.value,
    );
  }

  #retainRight(columns: number): Result<RichRow, ComponentError> {
    const right = this.#fit(this.#right, columns);
    if (!right.ok) {
      return right;
    }
    if (this.#right.cellWidth > columns) {
      return this.#join(
        RichRow.empty(),
        columns - right.value.cellWidth,
        right.value,
      );
    }
    const remaining = columns - right.value.cellWidth;
    const left = this.#fitSecondary(this.#left, remaining);
    if (!left.ok) {
      return left;
    }
    return this.#join(
      left.value,
      columns - left.value.cellWidth - right.value.cellWidth,
      right.value,
    );
  }
}
