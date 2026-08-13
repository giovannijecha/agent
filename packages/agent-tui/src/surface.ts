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
  verticalPadding: 0 | 1;
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
      isSurfaceTone(options.surface) &&
      (options.verticalPadding === 0 || options.verticalPadding === 1)
    );
  } catch (_cause: unknown) {
    return false;
  }
}

function surfacePadding(columns: number, requested: 0 | 1): 0 | 1 {
  return requested === 1 && columns >= 3 ? 1 : 0;
}

function surfaceVerticalPadding(rows: number, requested: 0 | 1): 0 | 1 {
  return requested === 1 && rows >= 3 ? 1 : 0;
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
  const transparent = options.surface === "none";
  const rightPadding = width - padding - row.cellWidth;
  const spans: TextSpan[] = [];
  if (row.spans.length === 0) {
    return RichRow.fromText(" ".repeat(width), "plain", {
      surface: options.surface,
    });
  }
  if (padding > 0) {
    const leading = TextSpan.create(
      " ".repeat(padding),
      transparent ? "plain" : row.spans.at(0)?.tone ?? "plain",
      {
        slant:
          !transparent && options.slant === "italic" ? "italic" : "normal",
        surface: options.surface,
      },
    );
    if (!leading.ok) {
      return leading;
    }
    spans.push(leading.value);
  }
  for (let position = 0; position < row.spans.length; position += 1) {
    const span = row.spans.at(position);
    if (span === undefined) {
      return err(new RichRowError("invalidSpan", position));
    }
    const created = TextSpan.create(span.text, span.tone, {
      mark: span.mark,
      slant: options.slant === "italic" ? "italic" : span.slant,
      surface: transparent ? span.surface : options.surface,
    }, {
      hyperlink: span.hyperlink,
      position: span.position,
    });
    if (!created.ok) {
      return created;
    }
    spans.push(created.value);
  }
  if (row.spans.length > 0 && rightPadding > 0) {
    const trailing = TextSpan.create(
      " ".repeat(rightPadding),
      transparent ? "plain" : row.spans.at(-1)?.tone ?? "plain",
      {
        slant:
          !transparent && options.slant === "italic" ? "italic" : "normal",
        surface: options.surface,
      },
    );
    if (!trailing.ok) {
      return trailing;
    }
    spans.push(trailing.value);
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
    const contentWidth = Math.min(columns, widest + padding * 2);
    const width =
      options.extent === "viewport"
        ? columns
        : rows.length === 0
          ? 0
          : Math.max(1, contentWidth);
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
  readonly #verticalPadding: 0 | 1;

  private constructor(component: Component, options: SurfaceOptions) {
    this.#component = component;
    this.#extent = options.extent;
    this.#horizontalPadding = options.horizontalPadding;
    this.#slant = options.slant;
    this.#surface = options.surface;
    this.#verticalPadding = options.verticalPadding;
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
            verticalPadding: options.verticalPadding,
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
    const measured = measureComponent(
      this.#component,
      this.#innerColumns(columns, this.#padding(columns)),
    );
    if (!measured.ok || measured.value.preferredRows === 0) {
      return measured;
    }
    const preferredRows =
      measured.value.preferredRows + this.#verticalPadding * 2;
    if (preferredRows > TUI_LIMITS.frameRows) {
      return err(new ComponentError("invalidMeasurement", undefined));
    }
    return ok(Object.freeze({ preferredRows }));
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const padding = this.#padding(viewport.columns);
    const verticalPadding = surfaceVerticalPadding(
      viewport.rows,
      this.#verticalPadding,
    );
    const childViewport = Viewport.create(
      this.#innerColumns(viewport.columns, padding),
      viewport.rows - verticalPadding * 2,
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
      verticalPadding: this.#verticalPadding,
    });
    if (!rows.ok) {
      return rows;
    }

    const renderedRows = [...rows.value];
    if (verticalPadding === 1) {
      const width =
        this.#extent === "viewport"
          ? viewport.columns
          : Math.max(
              1,
              ...renderedRows.map((row) => row.cellWidth),
            );
      const blank = RichRow.fromText(" ".repeat(width), "plain", {
        surface: this.#surface,
      });
      if (!blank.ok) {
        return err(new ComponentError("invalidRow", undefined));
      }
      renderedRows.unshift(blank.value);
      renderedRows.push(blank.value);
    }

    let caret: FragmentCaret | undefined;
    if (child.value.caret !== undefined) {
      caret = Object.freeze({
        column: child.value.caret.column + padding,
        row: child.value.caret.row + verticalPadding,
      });
    }
    return Fragment.create(viewport, renderedRows, caret);
  }

  #innerColumns(columns: number, padding: 0 | 1): number {
    return columns - padding * 2;
  }

  #padding(columns: number): 0 | 1 {
    return surfacePadding(columns, this.#horizontalPadding);
  }
}
