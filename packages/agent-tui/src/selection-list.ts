import { measureComponent, renderComponent } from "./component-boundary.js";
import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { RichRow } from "./rich-row.js";
import { Viewport } from "./viewport.js";

function validComponent(value: unknown): value is Component {
  try {
    return (
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      typeof (value as Partial<Component>).measure === "function" &&
      typeof (value as Partial<Component>).render === "function"
    );
  } catch (_cause: unknown) {
    return false;
  }
}

/** Bounded one-row component list whose selected entry remains visible. */
export class SelectionList implements Component {
  readonly #components: readonly Component[];
  readonly #selectedIndex: number;

  private constructor(
    components: readonly Component[],
    selectedIndex: number,
  ) {
    this.#components = Object.freeze([...components]);
    this.#selectedIndex = selectedIndex;
    Object.freeze(this);
  }

  /** Validates and snapshots a non-empty bounded list and exact selection. */
  static create(
    components: readonly Component[],
    selectedIndex: number,
  ): Result<SelectionList, ComponentError> {
    try {
      if (!Array.isArray(components)) {
        return err(new ComponentError("invalidComponentCount", undefined));
      }
      const count = components.length;
      if (count < 1 || count > TUI_LIMITS.componentCount) {
        return err(new ComponentError("invalidComponentCount", count));
      }
      if (
        !Number.isSafeInteger(selectedIndex) ||
        selectedIndex < 0 ||
        selectedIndex >= count
      ) {
        return err(new ComponentError("invalidGeometry", undefined));
      }
      const owned: Component[] = [];
      for (let position = 0; position < count; position += 1) {
        const component: unknown = components.at(position);
        if (!validComponent(component)) {
          return err(new ComponentError("invalidComponent", position));
        }
        owned.push(component);
      }
      return ok(new SelectionList(owned, selectedIndex));
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidComponent", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = this.#measureRows(columns);
    return measured.ok
      ? ok(Object.freeze({ preferredRows: this.#components.length }))
      : measured;
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = this.#measureRows(viewport.columns);
    if (!measured.ok) {
      return measured;
    }

    const visible = Math.min(viewport.rows, this.#components.length);
    const start = Math.min(
      Math.max(0, this.#selectedIndex - visible + 1),
      this.#components.length - visible,
    );
    const rows: RichRow[] = [];
    let caret: FragmentCaret | undefined;
    for (let offset = 0; offset < visible; offset += 1) {
      const position = start + offset;
      const component = this.#components.at(position);
      if (component === undefined) {
        return err(new ComponentError("invalidComponent", position));
      }
      const childViewport = Viewport.create(viewport.columns, 1);
      if (!childViewport.ok) {
        return err(new ComponentError("invalidGeometry", position));
      }
      const rendered = renderComponent(
        component,
        childViewport.value,
        position,
      );
      if (!rendered.ok) {
        return rendered;
      }
      const childCaret = rendered.value.caret;
      if (childCaret !== undefined) {
        if (caret !== undefined) {
          return err(new ComponentError("multipleCarets", position));
        }
        caret = Object.freeze({ column: childCaret.column, row: offset });
      }
      const row = rendered.value.rows.at(0);
      if (row === undefined) {
        return err(new ComponentError("rowMismatch", position));
      }
      rows.push(row);
    }
    while (rows.length < viewport.rows) {
      rows.push(RichRow.empty());
    }
    return Fragment.create(viewport, rows, caret);
  }

  #measureRows(columns: number): Result<void, ComponentError> {
    for (let position = 0; position < this.#components.length; position += 1) {
      const component = this.#components.at(position);
      if (component === undefined) {
        return err(new ComponentError("invalidComponent", position));
      }
      const measured = measureComponent(component, columns, position);
      if (!measured.ok) {
        return measured;
      }
      if (measured.value.preferredRows !== 1) {
        return err(new ComponentError("invalidMeasurement", position));
      }
    }
    return ok(undefined);
  }
}
