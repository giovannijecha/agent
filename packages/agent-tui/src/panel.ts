import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { measureComponent, renderComponent } from "./component-boundary.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { RichRow, TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";
import { Viewport } from "./viewport.js";

export type PanelOptions = Readonly<{
  borderTone: Tone;
  horizontalPadding: 0 | 1;
}>;

/** Generic visual container for one ordinary TUI component. */
export class Panel implements Component {
  readonly #borderTone: Tone;
  readonly #component: Component;
  readonly #horizontalPadding: 0 | 1;

  private constructor(component: Component, options: PanelOptions) {
    this.#component = component;
    this.#borderTone = options.borderTone;
    this.#horizontalPadding = options.horizontalPadding;
    Object.freeze(this);
  }

  static create(
    component: Component,
    options: PanelOptions,
  ): Result<Panel, ComponentError> {
    try {
      if (
        (typeof component !== "object" && typeof component !== "function") ||
        component === null ||
        typeof component.measure !== "function" ||
        typeof component.render !== "function"
      ) {
        return err(new ComponentError("invalidComponent", undefined));
      }
      if (typeof options !== "object" || options === null) {
        return err(new ComponentError("invalidPadding", undefined));
      }
      const borderTone = options.borderTone;
      const horizontalPadding = options.horizontalPadding;
      if (!isTone(borderTone)) {
        return err(new ComponentError("invalidTone", undefined));
      }
      if (horizontalPadding !== 0 && horizontalPadding !== 1) {
        return err(new ComponentError("invalidPadding", undefined));
      }
      return ok(
        new Panel(
          component,
          Object.freeze({ borderTone, horizontalPadding }),
        ),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidComponent", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const decorated = this.#canDecorate(columns, 3);
    const childColumns = decorated ? this.#innerColumns(columns) : columns;
    const measured = measureComponent(this.#component, childColumns);
    if (!measured.ok) {
      return measured;
    }
    return ok(
      Object.freeze({
        preferredRows: decorated
          ? Math.min(measured.value.preferredRows + 2, TUI_LIMITS.frameRows)
          : measured.value.preferredRows,
      }),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    if (!this.#canDecorate(viewport.columns, viewport.rows)) {
      return renderComponent(this.#component, viewport);
    }

    const innerColumns = this.#innerColumns(viewport.columns);
    const childViewport = Viewport.create(innerColumns, viewport.rows - 2);
    if (!childViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const child = renderComponent(this.#component, childViewport.value);
    if (!child.ok) {
      return child;
    }

    const horizontal = "\u2500".repeat(viewport.columns - 2);
    const top = RichRow.fromText(
      "\u250c" + horizontal + "\u2510",
      this.#borderTone,
    );
    const bottom = RichRow.fromText(
      "\u2514" + horizontal + "\u2518",
      this.#borderTone,
    );
    if (!top.ok || !bottom.ok) {
      return err(new ComponentError("invalidRow", undefined));
    }
    const rows: RichRow[] = [top.value];
    for (let position = 0; position < child.value.rows.length; position += 1) {
      const childRow = child.value.rows.at(position);
      if (childRow === undefined) {
        return err(new ComponentError("invalidRow", position));
      }
      const row = this.#decorateRow(childRow, innerColumns);
      if (!row.ok) {
        return row;
      }
      rows.push(row.value);
    }
    rows.push(bottom.value);

    let caret: FragmentCaret | undefined;
    if (child.value.caret !== undefined) {
      caret = Object.freeze({
        row: child.value.caret.row + 1,
        column:
          child.value.caret.column + 1 + this.#horizontalPadding,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }

  #canDecorate(columns: number, rows: number): boolean {
    return (
      rows >= 3 &&
      columns >= 3 + this.#horizontalPadding * 2
    );
  }

  #decorateRow(
    row: RichRow,
    innerColumns: number,
  ): Result<RichRow, ComponentError> {
    const owned: TextSpan[] = [];
    const left = TextSpan.create(
      "\u2502" + " ".repeat(this.#horizontalPadding),
      this.#borderTone,
    );
    if (!left.ok) {
      return err(new ComponentError("invalidRow", undefined));
    }
    owned.push(left.value, ...row.spans);
    const trailing =
      innerColumns - row.cellWidth + this.#horizontalPadding;
    const right = TextSpan.create(
      " ".repeat(trailing) + "\u2502",
      this.#borderTone,
    );
    if (!right.ok) {
      return err(new ComponentError("invalidRow", undefined));
    }
    owned.push(right.value);
    const created = RichRow.create(owned);
    return created.ok
      ? created
      : err(new ComponentError("invalidRow", created.error.position));
  }

  #innerColumns(columns: number): number {
    return columns - 2 - this.#horizontalPadding * 2;
  }

}
