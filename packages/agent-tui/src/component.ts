import type { Result } from "./result.js";
import type { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { Viewport } from "./viewport.js";

export type ComponentErrorKind =
  | "controlCharacter"
  | "invalidAnchor"
  | "invalidCaret"
  | "invalidComponent"
  | "invalidComponentCount"
  | "invalidFrame"
  | "invalidGeometry"
  | "invalidMeasurement"
  | "invalidPrefix"
  | "invalidProjection"
  | "invalidScalar"
  | "invalidSource"
  | "invalidSlot"
  | "invalidText"
  | "invalidTone"
  | "lineTooLong"
  | "lineTooWide"
  | "multipleCarets"
  | "rowMismatch"
  | "textTooLong"
  | "unexpectedComponent"
  | "unexpectedProjection";

/** Content-free structural failure from the generic component framework. */
export class ComponentError {
  readonly #kind: ComponentErrorKind;
  readonly #position: number | undefined;

  constructor(kind: ComponentErrorKind, position: number | undefined) {
    this.#kind = kind;
    this.#position = position;
    Object.freeze(this);
  }

  get kind(): ComponentErrorKind {
    return this.#kind;
  }

  get position(): number | undefined {
    return this.#position;
  }
}

/** Natural content height for a validated terminal width. */
export type ComponentMeasurement = Readonly<{ preferredRows: number }>;

/** Synchronous, terminal-agnostic vertical UI component. */
export interface Component {
  /** Measures natural rows at one positive terminal width. */
  measure(columns: number): Result<ComponentMeasurement, ComponentError>;
  /** Renders exactly the rows assigned by the supplied viewport. */
  render(viewport: Viewport): Result<Fragment, ComponentError>;
}

/** Internal shared guard applied before any component-sized allocation. */
export function validComponentColumns(columns: number): boolean {
  return (
    Number.isSafeInteger(columns) &&
    columns >= 1 &&
    columns <= TUI_LIMITS.componentColumns
  );
}

/** Internal shared guard for the bounded component viewport contract. */
export function validComponentViewport(viewport: Viewport): boolean {
  return (
    viewport instanceof Viewport &&
    validComponentColumns(viewport.columns) &&
    viewport.rows >= 1 &&
    viewport.rows <= TUI_LIMITS.frameRows
  );
}
