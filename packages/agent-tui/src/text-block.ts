import {
  ComponentError,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { layoutDisplayText } from "./display-text.js";
import { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

export type TextAnchor = "head" | "tail";

/** Immutable untrusted text component with deterministic head or tail anchoring. */
export class TextBlock implements Component {
  readonly #anchor: TextAnchor;
  readonly #text: string;

  private constructor(text: string, anchor: TextAnchor) {
    this.#text = text;
    this.#anchor = anchor;
    Object.freeze(this);
  }

  /** Creates a bounded immutable text block without retaining rejected text. */
  static create(
    text: string,
    anchor: TextAnchor,
  ): Result<TextBlock, ComponentError> {
    if (typeof text !== "string") {
      return err(new ComponentError("invalidText", undefined));
    }
    if (text.length > TUI_LIMITS.displayTextCodeUnits) {
      return err(new ComponentError("textTooLong", undefined));
    }
    if (anchor !== "head" && anchor !== "tail") {
      return err(new ComponentError("invalidAnchor", undefined));
    }
    return ok(new TextBlock(text, anchor));
  }

  measure(
    columns: number,
  ): Result<ComponentMeasurement, ComponentError> {
    const laidOut = layoutDisplayText(
      this.#text,
      columns,
      this.#anchor,
      TUI_LIMITS.frameRows,
    );
    return laidOut.ok
      ? ok(Object.freeze({ preferredRows: laidOut.value.length }))
      : laidOut;
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const laidOut = layoutDisplayText(
      this.#text,
      viewport.columns,
      this.#anchor,
      viewport.rows,
    );
    if (!laidOut.ok) {
      return laidOut;
    }
    const visible = laidOut.value;
    const padding = Array.from(
      { length: viewport.rows - visible.length },
      () => "",
    );
    const lines =
      this.#anchor === "head"
        ? [...visible, ...padding]
        : [...padding, ...visible];
    return Fragment.create(viewport, lines);
  }
}
