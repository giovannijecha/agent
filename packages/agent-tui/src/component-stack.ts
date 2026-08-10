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

export type StackAnchor = "head" | "tail";

type MeasuredChild = Readonly<{
  component: Component;
  position: number;
  rows: number;
}>;

type StackMeasurement = Readonly<{
  children: readonly MeasuredChild[];
  totalRows: number;
}>;

function measureChildren(
  components: readonly Component[],
  columns: number,
): Result<StackMeasurement, ComponentError> {
  const children: MeasuredChild[] = [];
  let totalRows = 0;
  for (let position = 0; position < components.length; position += 1) {
    const component = components.at(position);
    if (component === undefined) {
      return err(new ComponentError("invalidComponent", position));
    }
    const measured = measureComponent(component, columns, position);
    if (!measured.ok) {
      return measured;
    }
    totalRows += measured.value.preferredRows;
    children.push(
      Object.freeze({
        component,
        position,
        rows: measured.value.preferredRows,
      }),
    );
  }
  return ok(
    Object.freeze({ children: Object.freeze(children), totalRows }),
  );
}

/** Generic bounded vertical document composed from ordinary components. */
export class ComponentStack implements Component {
  readonly #anchor: StackAnchor;
  readonly #components: readonly Component[];

  private constructor(
    components: readonly Component[],
    anchor: StackAnchor,
  ) {
    this.#components = Object.freeze([...components]);
    this.#anchor = anchor;
    Object.freeze(this);
  }

  /** Validates and snapshots a bounded component collection. */
  static create(
    components: readonly Component[],
    anchor: StackAnchor,
  ): Result<ComponentStack, ComponentError> {
    try {
      if (!Array.isArray(components)) {
        return err(new ComponentError("invalidComponentCount", undefined));
      }
      const count = components.length;
      if (count > TUI_LIMITS.stackComponents) {
        return err(new ComponentError("invalidComponentCount", count));
      }
      if (anchor !== "head" && anchor !== "tail") {
        return err(new ComponentError("invalidAnchor", undefined));
      }
      const owned: Component[] = [];
      for (let position = 0; position < count; position += 1) {
        const component: unknown = components.at(position);
        if (
          (typeof component !== "object" && typeof component !== "function") ||
          component === null ||
          typeof (component as Partial<Component>).measure !== "function" ||
          typeof (component as Partial<Component>).render !== "function"
        ) {
          return err(new ComponentError("invalidComponent", position));
        }
        owned.push(component as Component);
      }
      return ok(new ComponentStack(owned, anchor));
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidComponent", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = measureChildren(this.#components, columns);
    return measured.ok
      ? ok(
          Object.freeze({
            preferredRows: Math.min(
              measured.value.totalRows,
              TUI_LIMITS.frameRows,
            ),
          }),
        )
      : measured;
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = measureChildren(this.#components, viewport.columns);
    if (!measured.ok) {
      return measured;
    }

    const totalRows = measured.value.totalRows;
    const start =
      this.#anchor === "tail"
        ? Math.max(0, totalRows - viewport.rows)
        : 0;
    const end = Math.min(totalRows, start + viewport.rows);
    const rows: RichRow[] = [];
    const leadingPadding =
      this.#anchor === "tail" && totalRows < viewport.rows
        ? viewport.rows - totalRows
        : 0;
    for (let count = 0; count < leadingPadding; count += 1) {
      rows.push(RichRow.empty());
    }

    let caret: FragmentCaret | undefined;
    let childStart = 0;
    for (const child of measured.value.children) {
      const childEnd = childStart + child.rows;
      if (child.rows > 0 && childStart < end && childEnd > start) {
        const childViewport = Viewport.create(viewport.columns, child.rows);
        if (!childViewport.ok) {
          return err(new ComponentError("invalidGeometry", child.position));
        }
        const rendered = renderComponent(
          child.component,
          childViewport.value,
          child.position,
        );
        if (!rendered.ok) {
          return rendered;
        }
        const sliceStart = Math.max(0, start - childStart);
        const sliceEnd = Math.min(child.rows, end - childStart);
        const visibleCaret = rendered.value.caret;
        if (
          visibleCaret !== undefined &&
          visibleCaret.row >= sliceStart &&
          visibleCaret.row < sliceEnd
        ) {
          if (caret !== undefined) {
            return err(new ComponentError("multipleCarets", child.position));
          }
          caret = Object.freeze({
            column: visibleCaret.column,
            row: rows.length + visibleCaret.row - sliceStart,
          });
        }
        rows.push(...rendered.value.rows.slice(sliceStart, sliceEnd));
      }
      childStart = childEnd;
    }
    while (rows.length < viewport.rows) {
      rows.push(RichRow.empty());
    }
    return Fragment.create(viewport, rows, caret);
  }
}
