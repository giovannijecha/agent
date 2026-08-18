import { measureComponent, renderComponent } from "./component-boundary.js";
import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment, type FragmentCaret } from "./fragment.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { Viewport } from "./viewport.js";

const INTERACTION_DOCK_MAXIMUM_ROWS = 6;

export type InteractionDockFocus = "editor" | "selection";

export type InteractionDockOptions = Readonly<{
  focus: InteractionDockFocus;
  header?: Component;
  maximumRows: number;
}>;

function isComponent(value: unknown): value is Component {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as Partial<Component>).measure === "function" &&
    typeof (value as Partial<Component>).render === "function"
  );
}

function snapshotOptions(value: unknown): InteractionDockOptions | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const options = value as Partial<InteractionDockOptions>;
    const focus = options.focus;
    const header = options.header;
    const maximumRows = options.maximumRows;
    if (
      (focus !== "editor" && focus !== "selection") ||
      typeof maximumRows !== "number" ||
      !Number.isSafeInteger(maximumRows) ||
      maximumRows < 1 ||
      maximumRows > INTERACTION_DOCK_MAXIMUM_ROWS ||
      (header !== undefined && !isComponent(header))
    ) {
      return undefined;
    }
    return header === undefined
      ? Object.freeze({ focus, maximumRows })
      : Object.freeze({ focus, header, maximumRows });
  } catch (_cause: unknown) {
    return undefined;
  }
}

/** One bounded interaction region with exactly one active focus owner. */
export class InteractionDock implements Component {
  readonly #body: Component;
  readonly #focus: InteractionDockFocus;
  readonly #header: Component | undefined;
  readonly #maximumRows: number;

  private constructor(body: Component, options: InteractionDockOptions) {
    this.#body = body;
    this.#focus = options.focus;
    this.#header = options.header;
    this.#maximumRows = options.maximumRows;
    Object.freeze(this);
  }

  static create(
    body: Component,
    options: InteractionDockOptions,
  ): Result<InteractionDock, ComponentError> {
    try {
      if (!isComponent(body)) {
        return err(new ComponentError("invalidComponent", undefined));
      }
      const ownedOptions = snapshotOptions(options);
      if (ownedOptions === undefined) {
        return err(new ComponentError("invalidStyle", undefined));
      }
      return ok(new InteractionDock(body, ownedOptions));
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidComponent", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const body = measureComponent(this.#body, columns, 1);
    if (!body.ok) {
      return body;
    }
    if (body.value.preferredRows < 1) {
      return err(new ComponentError("invalidMeasurement", 1));
    }
    let headerRows = 0;
    if (this.#header !== undefined) {
      const header = measureComponent(this.#header, columns, 0);
      if (!header.ok) {
        return header;
      }
      if (header.value.preferredRows !== 1) {
        return err(new ComponentError("invalidMeasurement", 0));
      }
      headerRows = 1;
    }
    return ok(
      Object.freeze({
        preferredRows: Math.min(
          this.#maximumRows,
          body.value.preferredRows + headerRows,
        ),
      }),
    );
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const measured = this.measure(viewport.columns);
    if (!measured.ok) {
      return measured;
    }

    const assignedRows = Math.min(viewport.rows, this.#maximumRows);
    const headerRows =
      this.#header !== undefined && assignedRows >= 2 ? 1 : 0;
    const bodyViewport = Viewport.create(
      viewport.columns,
      assignedRows - headerRows,
    );
    if (!bodyViewport.ok) {
      return err(new ComponentError("invalidGeometry", 1));
    }

    const rows: RichRow[] = [];
    if (headerRows === 1 && this.#header !== undefined) {
      const headerViewport = Viewport.create(viewport.columns, 1);
      if (!headerViewport.ok) {
        return err(new ComponentError("invalidGeometry", 0));
      }
      const header = renderComponent(this.#header, headerViewport.value, 0);
      if (!header.ok) {
        return header;
      }
      if (header.value.caret !== undefined) {
        return err(new ComponentError("invalidCaret", 0));
      }
      rows.push(...header.value.rows);
    }

    const body = renderComponent(this.#body, bodyViewport.value, 1);
    if (!body.ok) {
      return body;
    }
    const bodyCaret = body.value.caret;
    if (
      (this.#focus === "editor" && bodyCaret === undefined) ||
      (this.#focus === "selection" && bodyCaret !== undefined)
    ) {
      return err(new ComponentError("invalidCaret", 1));
    }
    rows.push(...body.value.rows);
    while (rows.length < viewport.rows) {
      rows.push(RichRow.empty());
    }

    let caret: FragmentCaret | undefined;
    if (bodyCaret !== undefined) {
      caret = Object.freeze({
        column: bodyCaret.column,
        row: bodyCaret.row + headerRows,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }
}
