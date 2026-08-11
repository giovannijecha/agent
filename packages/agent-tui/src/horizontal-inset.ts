import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { measureComponent, renderComponent } from "./component-boundary.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { RichRow, TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { Viewport } from "./viewport.js";

export type HorizontalInsetOptions = Readonly<{
  maximumColumns: number;
  minimumMargin: 0 | 1;
}>;

type HorizontalGeometry = Readonly<{
  columns: number;
  left: number;
}>;

/** Centers one component inside a bounded working column. */
export class HorizontalInset implements Component {
  readonly #component: Component;
  readonly #maximumColumns: number;
  readonly #minimumMargin: 0 | 1;

  private constructor(component: Component, options: HorizontalInsetOptions) {
    this.#component = component;
    this.#maximumColumns = options.maximumColumns;
    this.#minimumMargin = options.minimumMargin;
    Object.freeze(this);
  }

  static create(
    component: Component,
    options: HorizontalInsetOptions,
  ): Result<HorizontalInset, ComponentError> {
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
        return err(new ComponentError("invalidGeometry", undefined));
      }
      const maximumColumns = options.maximumColumns;
      const minimumMargin = options.minimumMargin;
      if (!validComponentColumns(maximumColumns)) {
        return err(new ComponentError("invalidGeometry", undefined));
      }
      if (minimumMargin !== 0 && minimumMargin !== 1) {
        return err(new ComponentError("invalidPadding", undefined));
      }
      return ok(
        new HorizontalInset(
          component,
          Object.freeze({ maximumColumns, minimumMargin }),
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
    return measureComponent(this.#component, this.#geometry(columns).columns);
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const geometry = this.#geometry(viewport.columns);
    if (geometry.left === 0 && geometry.columns === viewport.columns) {
      return renderComponent(this.#component, viewport);
    }
    const childViewport = Viewport.create(geometry.columns, viewport.rows);
    if (!childViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const child = renderComponent(this.#component, childViewport.value);
    if (!child.ok) {
      return child;
    }
    const prefix = TextSpan.create(" ".repeat(geometry.left), "plain");
    if (!prefix.ok) {
      return err(new ComponentError("invalidRow", undefined));
    }
    const rows: RichRow[] = [];
    for (let position = 0; position < child.value.rows.length; position += 1) {
      const row = child.value.rows.at(position);
      if (row === undefined) {
        return err(new ComponentError("invalidRow", position));
      }
      const created = RichRow.create([prefix.value, ...row.spans]);
      if (!created.ok) {
        return err(new ComponentError("invalidRow", position));
      }
      rows.push(created.value);
    }
    let caret: FragmentCaret | undefined;
    if (child.value.caret !== undefined) {
      caret = Object.freeze({
        column: child.value.caret.column + geometry.left,
        row: child.value.caret.row,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }

  #geometry(columns: number): HorizontalGeometry {
    const marginColumns = this.#minimumMargin * 2;
    if (columns <= marginColumns) {
      return Object.freeze({ columns, left: 0 });
    }
    const inner = Math.min(this.#maximumColumns, columns - marginColumns);
    return Object.freeze({
      columns: inner,
      left: Math.floor((columns - inner) / 2),
    });
  }
}
