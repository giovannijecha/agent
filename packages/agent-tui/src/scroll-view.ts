import { measureComponent, renderComponent } from "./component-boundary.js";
import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { err, ok, type Result } from "./result.js";
import { RichRow } from "./rich-row.js";
import { ScrollState } from "./scroll-state.js";
import { Viewport } from "./viewport.js";

/** Generic bounded vertical window over exactly one contained component. */
export class ScrollView implements Component {
  readonly #component: Component;
  readonly #state: ScrollState;

  private constructor(component: Component, state: ScrollState) {
    this.#component = component;
    this.#state = state;
    Object.freeze(this);
  }

  /** Validates the child boundary and immutable scroll state. */
  static create(
    component: Component,
    state: ScrollState,
  ): Result<ScrollView, ComponentError> {
    try {
      if (
        (typeof component !== "object" && typeof component !== "function") ||
        component === null ||
        typeof component.measure !== "function" ||
        typeof component.render !== "function" ||
        !(state instanceof ScrollState)
      ) {
        return err(new ComponentError("invalidComponent", undefined));
      }
      return ok(new ScrollView(component, state));
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidComponent", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return measureComponent(this.#component, columns);
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = measureComponent(this.#component, viewport.columns);
    if (!measured.ok) {
      return measured;
    }
    const contentRows = measured.value.preferredRows;
    if (contentRows === 0) {
      const empty = Array.from(
        { length: viewport.rows },
        () => RichRow.empty(),
      );
      return Fragment.create(viewport, empty);
    }

    const contentViewport = Viewport.create(viewport.columns, contentRows);
    if (!contentViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const content = renderComponent(this.#component, contentViewport.value);
    if (!content.ok) {
      return content;
    }
    const reconciled = this.#state.reconcile(contentRows, viewport.rows);
    if (!reconciled.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const start = reconciled.value.offset;
    const end = Math.min(contentRows, start + viewport.rows);
    const rows = [...content.value.rows.slice(start, end)];
    while (rows.length < viewport.rows) {
      rows.push(RichRow.empty());
    }

    let caret: FragmentCaret | undefined;
    const childCaret = content.value.caret;
    if (
      childCaret !== undefined &&
      childCaret.row >= start &&
      childCaret.row < end
    ) {
      caret = Object.freeze({
        row: childCaret.row - start,
        column: childCaret.column,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }
}
