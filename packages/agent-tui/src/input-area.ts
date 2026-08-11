import { hasLoneSurrogate, textCellWidth } from "./cell-width.js";
import {
  ComponentError,
  validComponentColumns,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import { Fragment } from "./fragment.js";
import type { EditorAreaProjection } from "./line-editor.js";
import { TUI_LIMITS } from "./limits.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";
import type { Viewport } from "./viewport.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

/** Pure projection source used by the generic multiline input component. */
export interface InputAreaProjectionSource {
  projectArea(columns: number, maximumRows: number): EditorAreaProjection;
}

export type InputAreaOptions = Readonly<{
  maximumRows: number;
  textTone: Tone;
}>;

type StableProjection = Readonly<{
  rows: readonly string[];
  caretRow: number;
  caretColumn: number;
}>;

/** Bounded focused editor area backed by one synchronous projection source. */
export class InputArea implements Component {
  readonly #maximumRows: number;
  readonly #project: (
    columns: number,
    maximumRows: number,
  ) => EditorAreaProjection;
  readonly #textTone: Tone;

  private constructor(
    project: (columns: number, maximumRows: number) => EditorAreaProjection,
    options: InputAreaOptions,
  ) {
    this.#project = project;
    this.#maximumRows = options.maximumRows;
    this.#textTone = options.textTone;
    Object.freeze(this);
  }

  static create(
    source: InputAreaProjectionSource,
    options: InputAreaOptions,
  ): Result<InputArea, ComponentError> {
    if (typeof source !== "object" || source === null) {
      return err(new ComponentError("invalidSource", undefined));
    }
    let method: unknown;
    let maximumRows: unknown;
    let textTone: unknown;
    try {
      method = source.projectArea;
      if (typeof options !== "object" || options === null) {
        return err(new ComponentError("invalidGeometry", undefined));
      }
      maximumRows = options.maximumRows;
      textTone = options.textTone;
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidSource", undefined));
    }
    if (typeof method !== "function") {
      return err(new ComponentError("invalidSource", undefined));
    }
    if (
      typeof maximumRows !== "number" ||
      !Number.isSafeInteger(maximumRows) ||
      maximumRows < 1 ||
      maximumRows > TUI_LIMITS.frameRows
    ) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    if (!isTone(textTone)) {
      return err(new ComponentError("invalidTone", undefined));
    }
    const stableProject = (
      columns: number,
      rows: number,
    ): EditorAreaProjection => method.call(source, columns, rows) as EditorAreaProjection;
    return ok(
      new InputArea(
        stableProject,
        Object.freeze({ maximumRows, textTone }),
      ),
    );
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    if (!validComponentColumns(columns)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const projection = this.#snapshot(columns, this.#maximumRows);
    return projection.ok
      ? ok(Object.freeze({ preferredRows: projection.value.rows.length }))
      : projection;
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const projection = this.#snapshot(
      viewport.columns,
      Math.min(viewport.rows, this.#maximumRows),
    );
    if (!projection.ok) {
      return projection;
    }
    const rows: RichRow[] = [];
    for (const text of projection.value.rows) {
      const row = RichRow.fromText(text, this.#textTone);
      if (!row.ok) {
        return err(new ComponentError("invalidRow", rows.length));
      }
      rows.push(row.value);
    }
    while (rows.length < viewport.rows) {
      rows.push(RichRow.empty());
    }
    return Fragment.create(viewport, rows, {
      row: projection.value.caretRow,
      column: projection.value.caretColumn,
    });
  }

  #snapshot(
    columns: number,
    maximumRows: number,
  ): Result<StableProjection, ComponentError> {
    try {
      const candidate: unknown = this.#project(columns, maximumRows);
      if (typeof candidate !== "object" || candidate === null) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      const projection = candidate as Partial<EditorAreaProjection>;
      const sourceRows = projection.rows;
      const caretRow = projection.caretRow;
      const caretColumn = projection.caretColumn;
      if (
        !Array.isArray(sourceRows) ||
        sourceRows.length < 1 ||
        sourceRows.length > maximumRows ||
        !Number.isSafeInteger(caretRow) ||
        (caretRow as number) < 0 ||
        (caretRow as number) >= sourceRows.length ||
        !Number.isSafeInteger(caretColumn) ||
        (caretColumn as number) < 0 ||
        (caretColumn as number) >= columns
      ) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      const rows: string[] = [];
      for (let index = 0; index < sourceRows.length; index += 1) {
        const row: unknown = sourceRows.at(index);
        if (
          typeof row !== "string" ||
          CONTROL_CHARACTER.test(row) ||
          hasLoneSurrogate(row) ||
          textCellWidth(row) > columns
        ) {
          return err(new ComponentError("invalidProjection", index));
        }
        rows.push(row);
      }
      const caretText = rows.at(caretRow as number);
      if (
        caretText === undefined ||
        (caretColumn as number) > textCellWidth(caretText)
      ) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      return ok(
        Object.freeze({
          rows: Object.freeze(rows),
          caretRow: caretRow as number,
          caretColumn: caretColumn as number,
        }),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("unexpectedProjection", undefined));
    }
  }
}
