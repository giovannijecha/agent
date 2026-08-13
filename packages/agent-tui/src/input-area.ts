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
import { RichRow, TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import type { TextMark } from "./text-style.js";
import { isTone, type Tone } from "./tone.js";
import type { Viewport } from "./viewport.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;
const MAX_TRAILING_STATUS_CODE_POINTS = 32;

/** Pure projection source used by the generic multiline input component. */
export interface InputAreaProjectionSource {
  projectArea(columns: number, maximumRows: number): EditorAreaProjection;
}

export type InputAreaOptions = Readonly<{
  maximumRows: number;
  textTone: Tone;
  trailingStatus?:
    | Readonly<{
        text: string;
        tone: Tone;
      }>
    | undefined;
}>;

type StableProjection = Readonly<{
  rows: readonly string[];
  selections: readonly Readonly<{ end: number; start: number }>[];
  caretRow: number;
  caretColumn: number;
}>;

function appendProjectionSpan(
  spans: TextSpan[],
  characters: readonly string[],
  start: number,
  end: number,
  tone: Tone,
  mark: TextMark,
): boolean {
  if (start === end) {
    return true;
  }
  const span = TextSpan.create(
    characters.slice(start, end).join(""),
    tone,
    { mark },
  );
  if (!span.ok) {
    return false;
  }
  spans.push(span.value);
  return true;
}

/** Bounded focused editor area backed by one synchronous projection source. */
export class InputArea implements Component {
  readonly #maximumRows: number;
  readonly #project: (
    columns: number,
    maximumRows: number,
  ) => EditorAreaProjection;
  readonly #textTone: Tone;
  readonly #trailingStatus:
    | Readonly<{ text: string; tone: Tone }>
    | undefined;

  private constructor(
    project: (columns: number, maximumRows: number) => EditorAreaProjection,
    options: InputAreaOptions,
  ) {
    this.#project = project;
    this.#maximumRows = options.maximumRows;
    this.#textTone = options.textTone;
    this.#trailingStatus = options.trailingStatus;
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
    let trailingStatus: unknown;
    try {
      method = source.projectArea;
      if (typeof options !== "object" || options === null) {
        return err(new ComponentError("invalidGeometry", undefined));
      }
      maximumRows = options.maximumRows;
      textTone = options.textTone;
      trailingStatus = options.trailingStatus;
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
    let stableTrailingStatus:
      | Readonly<{ text: string; tone: Tone }>
      | undefined;
    if (trailingStatus !== undefined) {
      if (typeof trailingStatus !== "object" || trailingStatus === null) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      let statusText: unknown;
      let statusTone: unknown;
      try {
        const candidate = trailingStatus as Partial<{
          text: string;
          tone: Tone;
        }>;
        statusText = candidate.text;
        statusTone = candidate.tone;
      } catch (_cause: unknown) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      if (
        typeof statusText !== "string" ||
        statusText.length === 0 ||
        Array.from(statusText).length > MAX_TRAILING_STATUS_CODE_POINTS ||
        CONTROL_CHARACTER.test(statusText) ||
        hasLoneSurrogate(statusText) ||
        !isTone(statusTone)
      ) {
        return err(new ComponentError("invalidProjection", undefined));
      }
      stableTrailingStatus = Object.freeze({
        text: statusText,
        tone: statusTone,
      });
    }
    const stableProject = (
      columns: number,
      rows: number,
    ): EditorAreaProjection => method.call(source, columns, rows) as EditorAreaProjection;
    return ok(
      new InputArea(
        stableProject,
        Object.freeze({
          maximumRows,
          textTone,
          trailingStatus: stableTrailingStatus,
        }),
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
    for (let index = 0; index < projection.value.rows.length; index += 1) {
      const text = projection.value.rows.at(index);
      const selection = projection.value.selections.at(index);
      if (text === undefined || selection === undefined) {
        return err(new ComponentError("invalidProjection", index));
      }
      const characters = Array.from(text);
      const spans: TextSpan[] = [];
      if (
        !appendProjectionSpan(
          spans,
          characters,
          0,
          selection.start,
          this.#textTone,
          "none",
        ) ||
        !appendProjectionSpan(
          spans,
          characters,
          selection.start,
          selection.end,
          this.#textTone,
          "selected",
        ) ||
        !appendProjectionSpan(
          spans,
          characters,
          selection.end,
          characters.length,
          this.#textTone,
          "none",
        )
      ) {
        return err(new ComponentError("invalidRow", rows.length));
      }
      const trailingStatus = this.#trailingStatus;
      if (index === projection.value.caretRow && trailingStatus !== undefined) {
        const textWidth = textCellWidth(text);
        const statusWidth = textCellWidth(trailingStatus.text);
        const gap = viewport.columns - textWidth - statusWidth;
        if (gap >= 1) {
          const spacing = TextSpan.create(
            " ".repeat(gap),
            this.#textTone,
          );
          const status = TextSpan.create(
            trailingStatus.text,
            trailingStatus.tone,
          );
          if (!spacing.ok || !status.ok) {
            return err(new ComponentError("invalidRow", rows.length));
          }
          spans.push(spacing.value, status.value);
        }
      }
      const row = RichRow.create(spans);
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
      const sourceSelections = projection.selections;
      const caretRow = projection.caretRow;
      const caretColumn = projection.caretColumn;
      if (
        !Array.isArray(sourceRows) ||
        !Array.isArray(sourceSelections) ||
        sourceRows.length < 1 ||
        sourceRows.length > maximumRows ||
        sourceSelections.length !== sourceRows.length ||
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
      const selections: Readonly<{ end: number; start: number }>[] = [];
      for (let index = 0; index < sourceRows.length; index += 1) {
        const row: unknown = sourceRows.at(index);
        const selection: unknown = sourceSelections.at(index);
        if (
          typeof row !== "string" ||
          CONTROL_CHARACTER.test(row) ||
          hasLoneSurrogate(row) ||
          textCellWidth(row) > columns ||
          typeof selection !== "object" ||
          selection === null
        ) {
          return err(new ComponentError("invalidProjection", index));
        }
        const range = selection as Partial<{ end: number; start: number }>;
        const codePoints = Array.from(row).length;
        if (
          !Number.isSafeInteger(range.start) ||
          (range.start as number) < 0 ||
          !Number.isSafeInteger(range.end) ||
          (range.end as number) < (range.start as number) ||
          (range.end as number) > codePoints
        ) {
          return err(new ComponentError("invalidProjection", index));
        }
        rows.push(row);
        selections.push(
          Object.freeze({
            end: range.end as number,
            start: range.start as number,
          }),
        );
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
          selections: Object.freeze(selections),
          caretRow: caretRow as number,
          caretColumn: caretColumn as number,
        }),
      );
    } catch (_cause: unknown) {
      return err(new ComponentError("unexpectedProjection", undefined));
    }
  }
}
