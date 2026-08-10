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
import { isTone, type Tone } from "./tone.js";
import { Viewport } from "./viewport.js";

export type SideRailOptions = Readonly<{
  horizontalPadding: 0 | 1;
  railTone: Tone;
}>;

/** Adds one open vertical guide without changing the child's row count. */
export class SideRail implements Component {
  readonly #component: Component;
  readonly #horizontalPadding: 0 | 1;
  readonly #railTone: Tone;

  private constructor(component: Component, options: SideRailOptions) {
    this.#component = component;
    this.#horizontalPadding = options.horizontalPadding;
    this.#railTone = options.railTone;
    Object.freeze(this);
  }

  static create(
    component: Component,
    options: SideRailOptions,
  ): Result<SideRail, ComponentError> {
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
      const horizontalPadding = options.horizontalPadding;
      const railTone = options.railTone;
      if (horizontalPadding !== 0 && horizontalPadding !== 1) {
        return err(new ComponentError("invalidPadding", undefined));
      }
      if (!isTone(railTone)) {
        return err(new ComponentError("invalidTone", undefined));
      }
      return ok(
        new SideRail(
          component,
          Object.freeze({ horizontalPadding, railTone }),
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
    const decorated = this.#canDecorate(columns);
    return measureComponent(
      this.#component,
      decorated ? this.#innerColumns(columns) : columns,
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    if (!this.#canDecorate(viewport.columns)) {
      return renderComponent(this.#component, viewport);
    }
    const childViewport = Viewport.create(
      this.#innerColumns(viewport.columns),
      viewport.rows,
    );
    if (!childViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const child = renderComponent(this.#component, childViewport.value);
    if (!child.ok) {
      return child;
    }
    const prefix = TextSpan.create(
      "\u2502" + " ".repeat(this.#horizontalPadding),
      this.#railTone,
    );
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
        column:
          child.value.caret.column + 1 + this.#horizontalPadding,
        row: child.value.caret.row,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }

  #canDecorate(columns: number): boolean {
    return columns >= 2 + this.#horizontalPadding;
  }

  #innerColumns(columns: number): number {
    return columns - 1 - this.#horizontalPadding;
  }
}
