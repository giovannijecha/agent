import {
  fitText,
  hasLoneSurrogate,
  textCellWidth,
} from "./cell-width.js";
import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import type { EditorProjection } from "./line-editor.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";
import type { Viewport } from "./viewport.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

function projectionTooLong(text: string): boolean {
  let count = 0;
  for (const _character of text) {
    count += 1;
    if (count > TUI_LIMITS.frameLineCodePoints) {
      return true;
    }
  }
  return false;
}

/** Pure projection source used by the generic input component. */
export interface InputProjectionSource {
  project(columns: number): EditorProjection;
}

/** One focused prompt row backed by a synchronous projection source. */
export class InputLine implements Component {
  readonly #prefix: string;
  readonly #project: (columns: number) => EditorProjection;
  readonly #tone: Tone;

  private constructor(
    prefix: string,
    project: (columns: number) => EditorProjection,
    tone: Tone,
  ) {
    this.#prefix = prefix;
    this.#project = project;
    this.#tone = tone;
    Object.freeze(this);
  }

  static create(
    prefix: string,
    source: InputProjectionSource,
    tone: Tone = "plain",
  ): Result<InputLine, ComponentError> {
    if (typeof prefix !== "string") {
      return err(new ComponentError("invalidPrefix", undefined));
    }
    if (CONTROL_CHARACTER.test(prefix) || hasLoneSurrogate(prefix)) {
      return err(new ComponentError("invalidPrefix", undefined));
    }
    if (projectionTooLong(prefix)) {
      return err(new ComponentError("invalidPrefix", undefined));
    }
    if (typeof source !== "object" || source === null) {
      return err(new ComponentError("invalidSource", undefined));
    }
    let method: unknown;
    try {
      method = source.project;
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidSource", undefined));
    }
    if (typeof method !== "function") {
      return err(new ComponentError("invalidSource", undefined));
    }
    if (!isTone(tone)) {
      return err(new ComponentError("invalidTone", undefined));
    }
    const stableProject = (columns: number): EditorProjection =>
      method.call(source, columns) as EditorProjection;
    return ok(new InputLine(prefix, stableProject, tone));
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    return ok(Object.freeze({ preferredRows: 1 }));
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const prefix =
      viewport.columns === 1
        ? ""
        : fitText(this.#prefix, viewport.columns - 1);
    const prefixWidth = textCellWidth(prefix);
    const editorColumns = viewport.columns - prefixWidth;
    let projectedText: string;
    let projectedCaret: number;
    try {
      const candidate: unknown = this.#project(editorColumns);
      if (typeof candidate !== "object" || candidate === null) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      const projection = candidate as Partial<EditorProjection>;
      const text = projection.text;
      const caretColumn = projection.caretColumn;
      if (
        typeof text !== "string" ||
        projectionTooLong(text) ||
        CONTROL_CHARACTER.test(text) ||
        hasLoneSurrogate(text) ||
        textCellWidth(text) > editorColumns ||
        typeof caretColumn !== "number" ||
        !Number.isSafeInteger(caretColumn) ||
        caretColumn < 0 ||
        caretColumn >= editorColumns ||
        caretColumn > textCellWidth(text)
      ) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      projectedText = text;
      projectedCaret = caretColumn;
    } catch (_cause: unknown) {
      return err(new ComponentError("unexpectedProjection", undefined));
    }

    const lines = Array.from({ length: viewport.rows }, () => "");
    lines.splice(viewport.rows - 1, 1, prefix + projectedText);
    return Fragment.create(
      viewport,
      lines,
      {
        row: viewport.rows - 1,
        column: prefixWidth + projectedCaret,
      },
      lines.map(() => this.#tone),
    );
  }
}
