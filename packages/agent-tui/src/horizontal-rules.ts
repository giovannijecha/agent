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
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { paintSurfaceRows } from "./surface.js";
import { isTone, type Tone } from "./tone.js";
import { Viewport } from "./viewport.js";

export type HorizontalRulesOptions = Readonly<{
  horizontalPadding: 0 | 1;
  ruleRows: 0 | 1;
  tone: Tone;
}>;

function validHorizontalRulesOptions(
  value: unknown,
): value is HorizontalRulesOptions {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  try {
    const options = value as Partial<HorizontalRulesOptions>;
    return (
      (options.horizontalPadding === 0 ||
        options.horizontalPadding === 1) &&
      (options.ruleRows === 0 || options.ruleRows === 1) &&
      isTone(options.tone)
    );
  } catch (_cause: unknown) {
    return false;
  }
}

function horizontalPadding(columns: number, requested: 0 | 1): 0 | 1 {
  return requested === 1 && columns >= 3 ? 1 : 0;
}

function horizontalRuleRows(rows: number, requested: 0 | 1): 0 | 1 {
  return requested === 1 && rows >= 3 ? 1 : 0;
}

/** Frames one child with transparent full-width horizontal semantic rules. */
export class HorizontalRules implements Component {
  readonly #component: Component;
  readonly #horizontalPadding: 0 | 1;
  readonly #ruleRows: 0 | 1;
  readonly #tone: Tone;

  private constructor(component: Component, options: HorizontalRulesOptions) {
    this.#component = component;
    this.#horizontalPadding = options.horizontalPadding;
    this.#ruleRows = options.ruleRows;
    this.#tone = options.tone;
    Object.freeze(this);
  }

  static create(
    component: Component,
    options: HorizontalRulesOptions,
  ): Result<HorizontalRules, ComponentError> {
    try {
      if (
        (typeof component !== "object" && typeof component !== "function") ||
        component === null ||
        typeof component.measure !== "function" ||
        typeof component.render !== "function"
      ) {
        return err(new ComponentError("invalidComponent", undefined));
      }
      if (!validHorizontalRulesOptions(options)) {
        return err(new ComponentError("invalidStyle", undefined));
      }
      return ok(
        new HorizontalRules(
          component,
          Object.freeze({
            horizontalPadding: options.horizontalPadding,
            ruleRows: options.ruleRows,
            tone: options.tone,
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
    const padding = horizontalPadding(columns, this.#horizontalPadding);
    const measured = measureComponent(
      this.#component,
      columns - padding * 2,
    );
    if (!measured.ok || measured.value.preferredRows === 0) {
      return measured;
    }
    const preferredRows = measured.value.preferredRows + this.#ruleRows * 2;
    if (preferredRows > TUI_LIMITS.frameRows) {
      return err(new ComponentError("invalidMeasurement", undefined));
    }
    return ok(Object.freeze({ preferredRows }));
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const padding = horizontalPadding(
      viewport.columns,
      this.#horizontalPadding,
    );
    const ruleRows = horizontalRuleRows(viewport.rows, this.#ruleRows);
    const childViewport = Viewport.create(
      viewport.columns - padding * 2,
      viewport.rows - ruleRows * 2,
    );
    if (!childViewport.ok) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const child = renderComponent(this.#component, childViewport.value);
    if (!child.ok) {
      return child;
    }
    const contentRows = paintSurfaceRows(child.value.rows, viewport.columns, {
      extent: "viewport",
      horizontalPadding: this.#horizontalPadding,
      slant: "inherit",
      surface: "none",
      verticalPadding: 0,
    });
    if (!contentRows.ok) {
      return contentRows;
    }

    const rows = [...contentRows.value];
    if (ruleRows === 1) {
      const rule = RichRow.fromText(
        "\u2500".repeat(viewport.columns),
        this.#tone,
        { surface: "none" },
      );
      if (!rule.ok) {
        return err(new ComponentError("invalidRow", undefined));
      }
      rows.unshift(rule.value);
      rows.push(rule.value);
    }

    let caret: FragmentCaret | undefined;
    if (child.value.caret !== undefined) {
      caret = Object.freeze({
        column: child.value.caret.column + padding,
        row: child.value.caret.row + ruleRows,
      });
    }
    return Fragment.create(viewport, rows, caret);
  }
}
