import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import { RichRow, type TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

/** One generic head-anchored structured line with deterministic clipping. */
export class InlineText implements Component {
  readonly #row: RichRow;

  private constructor(row: RichRow) {
    this.#row = row;
    Object.freeze(this);
  }

  static create(spans: readonly TextSpan[]): Result<InlineText, ComponentError> {
    const row = RichRow.create(spans);
    return row.ok
      ? ok(new InlineText(row.value))
      : err(new ComponentError("invalidRow", row.error.position));
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return ok(
      Object.freeze({ preferredRows: this.#row.text.length === 0 ? 0 : 1 }),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const fitted = this.#row.fit(viewport.columns);
    if (!fitted.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const rows = Array.from(
      { length: viewport.rows },
      () => RichRow.empty(),
    );
    rows.splice(0, 1, fitted.value);
    return Fragment.create(viewport, rows);
  }
}
