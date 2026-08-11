import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { measureComponent, renderComponent } from "./component-boundary.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { RichRow, RichRowError, TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { isSurfaceTone, type SurfaceTone } from "./text-style.js";
import { Viewport } from "./viewport.js";

export type SurfaceExtent = "content" | "viewport";
export type SurfaceSlant = "inherit" | "italic";

export type SurfaceOptions = Readonly<{
  extent: SurfaceExtent;
  horizontalPadding: 0 | 1;
  slant: SurfaceSlant;
  surface: SurfaceTone;
}>;

function isSurfaceExtent(value: unknown): value is SurfaceExtent {
  return value === "content" || value === "viewport";
}

function isSurfaceSlant(value: unknown): value is SurfaceSlant {
  return value === "inherit" || value === "italic";
}

function validSurfaceOptions(value: unknown): value is SurfaceOptions {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    const options = value as Partial<SurfaceOptions>;
    return (
      isSurfaceExtent(options.extent) &&
      (options.horizontalPadding === 0 || options.horizontalPadding === 1) &&
      isSurfaceSlant(options.slant) &&
      isSurfaceTone(options.surface)
    );
  } catch (_cause: unknown) {
    return false;
  }
}

function surfacePadding(columns: number, requested: 0 | 1): 0 | 1 {
  return requested === 1 && columns >= 3 ? 1 : 0;
}

function paintSurfaceRow(
  row: RichRow,
  width: number,
  padding: 0 | 1,
  options: SurfaceOptions,
): Result<RichRow, RichRowError> {
  if (width === 0) {
    return ok(RichRow.empty());
  }
  const rightPadding = width - padding - row.cellWidth;
  const last = row.spans.length - 1;
  const spans: TextSpan[] = [];
  for (let position = 0; position < row.spans.length; position += 1) {
    const span = row.spans.at(position);
    if (span === undefined) {
      return err(new RichRowError("invalidSpan", position));
    }
    const text =
      (position === 0 ? " ".repeat(padding) : "") +
      span.text +
      (position === last ? " ".repeat(rightPadding) : "");
    const created = TextSpan.create(text, span.tone, {
      slant: options.slant === "italic" ? "italic" : span.slant,
      surface: options.surface,
    });
    if (!created.ok) {
      return created;
    }
    spans.push(created.value);
  }
  if (spans.length === 0) {
    return RichRow.fromText(" ".repeat(width), "plain", {
      surface: options.surface,
    });
  }
  return RichRow.create(spans);
}

/** Shared bounded row painter used by Surface and structured documents. */
export function paintSurfaceRows(
  rows: readonly RichRow[],
  columns: number,
  options: SurfaceOptions,
): Result<readonly RichRow[], ComponentError> {
  if (!validComponentColumns(columns) || !validSurfaceOptions(options)) {
    return err(new ComponentError("invalidStyle", undefined));
  }
  try {
    const padding = surfacePadding(columns, options.horizontalPadding);
    let widest = 0;
    for (const row of rows) {
      if (!(row instanceof RichRow)) {
        return err(new ComponentError("invalidRow", undefined));
      }
      widest = Math.max(widest, row.cellWidth);
    }
    const width =
      options.extent === "viewport"
        ? columns
        : Math.min(columns, widest + padding * 2);
    const painted: RichRow[] = [];
    for (let position = 0; position < rows.length; position += 1) {
      const row = rows.at(position);
      if (row === undefined) {
        return err(new ComponentError("invalidRow", position));
      }
      const result = paintSurfaceRow(row, width, padding, options);
      if (!result.ok) {
        return err(new ComponentError("invalidRow", position));
      }
      painted.push(result.value);
    }
    return ok(Object.freeze(painted));
  } catch (_cause: unknown) {
    return err(new ComponentError("invalidRow", undefined));
  }
}

/** Paints one child on a bounded semantic background without adding a border. */
export class Surface implements Component {
  readonly #component: Component;
  readonly #extent: SurfaceExtent;
  readonly #horizontalPadding: 0 | 1;
  readonly #slant: SurfaceSlant;
  readonly #surface: SurfaceTone;

  private constructor(component: Component, options: SurfaceOptions) {
    this.#component = component;
    this.#extent = options.extent;
    this.#horizontalPadding = options.horizontalPadding;
    this.#slant = options.slant;
    this.#surface = options.surface;
    Object.freeze(this);
  }

  static create(
    component: Component,
    options: SurfaceOptions,
  ): Result<Surface, ComponentError> {
    try {
      if (
        (typeof component !== "object" && typeof component !== "function") ||
        component === null ||
        typeof component.measure !== "function" ||
        typeof component.render !== "function"
      ) {
        return err(new ComponentError("invalidComponent", undefined));
      }
      if (!validSurfaceOptions(options)) {
        return err(new ComponentError("invalidStyle", undefined));
      }
      return ok(
        new Surface(
          component,
          Object.freeze({
            extent: options.extent,
            horizontalPadding: options.horizontalPadding,
            slant: options.slant,
            surface: options.surface,
          }),
        ),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidStyle", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return measureComponent(
      this.#component,
      this.#innerColumns(columns, this.#padding(columns)),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const padding = this.#padding(viewport.columns);
    const childViewport = Viewport.create(
      this.#innerColumns(viewport.columns, padding),
      viewport.rows,
    );
    if (!childViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const child = renderComponent(this.#component, childViewport.value);
    if (!child.ok) {
      return child;
    }

    const rows = paintSurfaceRows(child.value.rows, viewport.columns, {
      extent: this.#extent,
      horizontalPadding: this.#horizontalPadding,
      slant: this.#slant,
      surface: this.#surface,
    });
    if (!rows.ok) {
      return rows;
    }

    let caret: FragmentCaret | undefined;
    if (child.value.caret !== undefined) {
      caret = Object.freeze({
        column: child.value.caret.column + padding,
        row: child.value.caret.row,
      });
    }
    return Fragment.create(viewport, rows.value, caret);
  }

  #innerColumns(columns: number, padding: 0 | 1): number {
    return columns - padding * 2;
  }

  #padding(columns: number): 0 | 1 {
    return surfacePadding(columns, this.#horizontalPadding);
  }
}
