import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

/** A bounded vertical rhythm primitive containing no printable content. */
export class Spacer implements Component {
  readonly #rows: number;

  private constructor(rows: number) {
    this.#rows = rows;
    Object.freeze(this);
  }

  static create(rows: number): Result<Spacer, ComponentError> {
    return Number.isSafeInteger(rows) && rows >= 1 && rows <= TUI_LIMITS.frameRows
      ? ok(new Spacer(rows))
      : err(new ComponentError("invalidGap", undefined));
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    return validComponentColumns(columns)
      ? ok(Object.freeze({ preferredRows: this.#rows }))
      : err(new ComponentError("invalidGeometry", undefined));
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return Fragment.create(
      viewport,
      Array.from({ length: viewport.rows }, () => RichRow.empty()),
    );
  }
}
