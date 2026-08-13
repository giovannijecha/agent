import { characterCellWidth } from "./cell-width.js";
import type { KeyEvent } from "./input-decoder.js";

const MAX_CODE_POINTS = 4_096;

export type EditorOutcome =
  | Readonly<{ kind: "changed" }>
  | Readonly<{ kind: "eof" }>
  | Readonly<{ kind: "interrupt" }>
  | Readonly<{ kind: "limit" }>
  | Readonly<{ kind: "submitted"; text: string }>
  | Readonly<{ kind: "unchanged" }>
  | Readonly<{ kind: "unsupported" }>;

export type EditorProjection = Readonly<{
  text: string;
  caretColumn: number;
}>;

export type EditorAreaProjection = Readonly<{
  rows: readonly string[];
  selections: readonly Readonly<{ end: number; start: number }>[];
  caretRow: number;
  caretColumn: number;
}>;

type EditorAreaDetails = Readonly<{
  caretColumn: number;
  caretRow: number;
  indices: readonly (readonly number[])[];
  rowEnds: readonly number[];
  rows: readonly string[];
}>;

const OUTCOMES = Object.freeze({
  changed: Object.freeze({ kind: "changed" as const }),
  eof: Object.freeze({ kind: "eof" as const }),
  interrupt: Object.freeze({ kind: "interrupt" as const }),
  limit: Object.freeze({ kind: "limit" as const }),
  unchanged: Object.freeze({ kind: "unchanged" as const }),
  unsupported: Object.freeze({ kind: "unsupported" as const }),
});

function editableCharacters(text: string): readonly string[] | undefined {
  const characters = Array.from(text);
  for (const character of characters) {
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      point < 0x20 ||
      point === 0x7f ||
      (point >= 0x80 && point <= 0x9f) ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      return undefined;
    }
  }
  return characters;
}

function pasteCharacters(text: string): readonly string[] | undefined {
  const characters = Array.from(text);
  for (const character of characters) {
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      (point < 0x20 && character !== "\n" && character !== "\t") ||
      point === 0x7f ||
      (point >= 0x80 && point <= 0x9f) ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      return undefined;
    }
  }
  return characters;
}

function appendProjectedCharacter(
  rows: string[],
  widths: number[],
  indices: number[][],
  rowEnds: number[],
  character: string,
  columns: number,
  sourceIndex: number,
): void {
  let rendered = character;
  let width = characterCellWidth(rendered);
  if (width > columns) {
    rendered = "?";
    width = 1;
  }
  const row = rows.length - 1;
  const currentWidth = widths.at(row) ?? 0;
  if (currentWidth + width > columns) {
    rowEnds.splice(row, 1, sourceIndex);
    rows.push(rendered);
    widths.push(width);
    indices.push([sourceIndex]);
    rowEnds.push(sourceIndex + 1);
    return;
  }
  rows.splice(row, 1, (rows.at(row) ?? "") + rendered);
  widths.splice(row, 1, currentWidth + width);
  indices.at(row)?.push(sourceIndex);
  rowEnds.splice(row, 1, sourceIndex + 1);
}

function projectedWordWidth(
  characters: readonly string[],
  start: number,
): number {
  let width = 0;
  for (let index = start; index < characters.length; index += 1) {
    const character = characters.at(index);
    if (
      character === undefined ||
      character === " " ||
      character === "\t" ||
      character === "\n"
    ) {
      break;
    }
    width += characterCellWidth(character);
  }
  return width;
}

function isWordSeparator(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\n";
}

/** Bounded generic editor over Unicode code-point boundaries. */
export class LineEditor {
  #characters: string[] = [];
  #cursor = 0;
  #selectionAnchor: number | undefined;
  #selectionFocus: number | undefined;
  #selectionOrigin: number | undefined;
  #wordSelectionEnd: number | undefined;
  #wordSelectionStart: number | undefined;

  /** Returns the complete current draft. */
  get text(): string {
    return this.#characters.join("");
  }

  /** Returns the draft length in Unicode code points. */
  get length(): number {
    return this.#characters.length;
  }

  get selection(): Readonly<{ end: number; start: number }> | undefined {
    const bounds = this.#selectionBounds();
    return bounds === undefined ? undefined : Object.freeze(bounds);
  }

  get selectedText(): string | undefined {
    const bounds = this.#selectionBounds();
    return bounds === undefined
      ? undefined
      : this.#characters.slice(bounds.start, bounds.end).join("");
  }

  /** Collapses the current selection without changing editor content. */
  clearSelection(): EditorOutcome {
    if (this.#selectionBounds() === undefined) {
      this.#clearSelection();
      return OUTCOMES.unchanged;
    }
    this.#clearSelection();
    return OUTCOMES.changed;
  }

  /** Releases all retained draft characters and restores the initial caret. */
  clear(): boolean {
    const changed = this.#characters.length > 0 || this.#cursor !== 0;
    this.#characters.splice(0);
    this.#cursor = 0;
    this.#clearSelection();
    return changed;
  }

  /** Replaces the bounded draft and places the caret after its final code point. */
  replace(text: string): EditorOutcome {
    if (typeof text !== "string") {
      return OUTCOMES.unsupported;
    }
    const replacement = editableCharacters(text);
    if (replacement === undefined) {
      return OUTCOMES.unsupported;
    }
    if (replacement.length > MAX_CODE_POINTS) {
      return OUTCOMES.limit;
    }
    if (
      this.#cursor === replacement.length &&
      replacement.length === this.#characters.length &&
      replacement.every(
        (character, position) => this.#characters.at(position) === character,
      )
    ) {
      return OUTCOMES.unchanged;
    }
    this.#characters = [...replacement];
    this.#cursor = replacement.length;
    this.#clearSelection();
    return OUTCOMES.changed;
  }

  /** Applies one decoded key and returns an immutable state outcome. */
  apply(event: KeyEvent): EditorOutcome {
    if (event.kind === "text" || event.kind === "paste") {
      const inserted =
        event.kind === "paste"
          ? pasteCharacters(event.text)
          : editableCharacters(event.text);
      if (inserted === undefined || inserted.length === 0) {
        return OUTCOMES.unsupported;
      }
      const selection = this.#selectionBounds();
      const removed = selection === undefined ? 0 : selection.end - selection.start;
      if (this.#characters.length - removed + inserted.length > MAX_CODE_POINTS) {
        return OUTCOMES.limit;
      }
      if (selection !== undefined) {
        this.#characters.splice(
          selection.start,
          selection.end - selection.start,
        );
        this.#cursor = selection.start;
      }
      this.#characters.splice(this.#cursor, 0, ...inserted);
      this.#cursor += inserted.length;
      this.#clearSelection();
      return OUTCOMES.changed;
    }
    if (event.kind === "left") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        this.#cursor = selection.start;
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#cursor -= 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "right") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        this.#cursor = selection.end;
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      if (this.#cursor === this.#characters.length) {
        return OUTCOMES.unchanged;
      }
      this.#cursor += 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "wordLeft" || event.kind === "wordBackspace") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        if (event.kind === "wordBackspace") {
          this.#characters.splice(
            selection.start,
            selection.end - selection.start,
          );
        }
        this.#cursor = selection.start;
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      let target = this.#cursor;
      while (
        target > 0 &&
        isWordSeparator(this.#characters.at(target - 1))
      ) {
        target -= 1;
      }
      while (
        target > 0 &&
        !isWordSeparator(this.#characters.at(target - 1))
      ) {
        target -= 1;
      }
      if (target === this.#cursor) {
        return OUTCOMES.unchanged;
      }
      if (event.kind === "wordBackspace") {
        this.#characters.splice(target, this.#cursor - target);
      }
      this.#cursor = target;
      this.#clearSelection();
      return OUTCOMES.changed;
    }
    if (event.kind === "wordRight" || event.kind === "wordDelete") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        if (event.kind === "wordDelete") {
          this.#characters.splice(
            selection.start,
            selection.end - selection.start,
          );
          this.#cursor = selection.start;
        } else {
          this.#cursor = selection.end;
        }
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      let target = this.#cursor;
      while (
        target < this.#characters.length &&
        isWordSeparator(this.#characters.at(target))
      ) {
        target += 1;
      }
      while (
        target < this.#characters.length &&
        !isWordSeparator(this.#characters.at(target))
      ) {
        target += 1;
      }
      if (target === this.#cursor) {
        return OUTCOMES.unchanged;
      }
      if (event.kind === "wordDelete") {
        this.#characters.splice(this.#cursor, target - this.#cursor);
      } else {
        this.#cursor = target;
      }
      this.#clearSelection();
      return OUTCOMES.changed;
    }
    if (event.kind === "home") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        this.#cursor = 0;
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#cursor = 0;
      this.#clearSelection();
      return OUTCOMES.changed;
    }
    if (event.kind === "end") {
      const selection = this.#selectionBounds();
      if (selection !== undefined) {
        this.#cursor = this.#characters.length;
        this.#clearSelection();
        return OUTCOMES.changed;
      }
      if (this.#cursor === this.#characters.length) {
        return OUTCOMES.unchanged;
      }
      this.#cursor = this.#characters.length;
      this.#clearSelection();
      return OUTCOMES.changed;
    }
    if (event.kind === "backspace") {
      const selection = this.#deleteSelection();
      if (selection) {
        return OUTCOMES.changed;
      }
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#characters.splice(this.#cursor - 1, 1);
      this.#cursor -= 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "delete") {
      const selection = this.#deleteSelection();
      if (selection) {
        return OUTCOMES.changed;
      }
      if (this.#cursor === this.#characters.length) {
        return OUTCOMES.unchanged;
      }
      this.#characters.splice(this.#cursor, 1);
      return OUTCOMES.changed;
    }
    if (event.kind === "enter") {
      const submitted = this.text;
      this.#characters = [];
      this.#cursor = 0;
      this.#clearSelection();
      return Object.freeze({ kind: "submitted" as const, text: submitted });
    }
    if (event.kind === "interrupt") {
      return OUTCOMES.interrupt;
    }
    if (event.kind === "eof") {
      return OUTCOMES.eof;
    }
    return OUTCOMES.unsupported;
  }

  /** Projects a horizontally scrolled line while keeping the caret visible. */
  project(columns: number): EditorProjection {
    if (!Number.isSafeInteger(columns) || columns < 1) {
      throw new RangeError("editor columns must be a positive safe integer");
    }

    const maximumCaret = columns - 1;
    let start = this.#cursor;
    let caretColumn = 0;
    while (start > 0) {
      const character = this.#characters.at(start - 1);
      if (character === undefined) {
        break;
      }
      const width = characterCellWidth(character);
      if (caretColumn + width > maximumCaret) {
        break;
      }
      start -= 1;
      caretColumn += width;
    }

    let text = "";
    let width = 0;
    for (let index = start; index < this.#characters.length; index += 1) {
      const character = this.#characters.at(index);
      if (character === undefined) {
        break;
      }
      const characterWidth = characterCellWidth(character);
      if (width + characterWidth > columns) {
        break;
      }
      text += character;
      width += characterWidth;
    }

    return Object.freeze({ text, caretColumn });
  }

  /** Projects a wrapped multiline viewport while keeping the caret visible. */
  projectArea(columns: number, maximumRows: number): EditorAreaProjection {
    const details = this.#projectAreaDetails(columns, maximumRows);
    const selection = this.#selectionBounds();
    const selections = details.indices.map((row) => {
      if (selection === undefined) {
        return Object.freeze({ end: 0, start: 0 });
      }
      let start = -1;
      let end = -1;
      for (let index = 0; index < row.length; index += 1) {
        const source = row.at(index);
        if (
          source !== undefined &&
          source >= selection.start &&
          source < selection.end
        ) {
          if (start < 0) start = index;
          end = index + 1;
        }
      }
      return start < 0
        ? Object.freeze({ end: 0, start: 0 })
        : Object.freeze({ end, start });
    });
    return Object.freeze({
      rows: details.rows,
      selections: Object.freeze(selections),
      caretRow: details.caretRow,
      caretColumn: details.caretColumn,
    });
  }

  /** Resolves one exact visible editor cell to its source boundary. */
  positionAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): number | undefined {
    return this.#indexAt(columns, maximumRows, row, column);
  }

  /** Moves or extends the selection from one exact visible editor cell. */
  selectAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
    extend: boolean,
  ): EditorOutcome {
    const target = this.#indexAt(columns, maximumRows, row, column);
    if (target === undefined) {
      return OUTCOMES.unchanged;
    }
    this.#wordSelectionStart = undefined;
    this.#wordSelectionEnd = undefined;
    const previousCursor = this.#cursor;
    const previous = this.#selectionBounds();
    if (!extend || this.#selectionOrigin === undefined) {
      this.#selectionAnchor = target;
      this.#selectionOrigin = target;
    }
    const origin = this.#selectionOrigin;
    const afterOrigin = extend && origin !== undefined && target >= origin;
    if (extend && origin !== undefined) {
      this.#selectionAnchor = afterOrigin ? origin : origin + 1;
    }
    const focus = afterOrigin && target < this.#characters.length
      ? target + 1
      : target;
    this.#selectionFocus = focus;
    this.#cursor = focus;
    const next = this.#selectionBounds();
    return previousCursor === this.#cursor &&
      previous?.start === next?.start &&
      previous?.end === next?.end
      ? OUTCOMES.unchanged
      : OUTCOMES.changed;
  }

  /** Selects one whitespace or non-whitespace run at a visible editor cell. */
  selectWordAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): EditorOutcome {
    const target = this.#indexAt(columns, maximumRows, row, column);
    if (target === undefined || target >= this.#characters.length) {
      return OUTCOMES.unchanged;
    }
    const bounds = this.#wordBounds(target);
    const start = bounds.start;
    const end = bounds.end;
    this.#selectionAnchor = start;
    this.#selectionFocus = end;
    this.#selectionOrigin = undefined;
    this.#wordSelectionStart = start;
    this.#wordSelectionEnd = end;
    this.#cursor = end;
    return OUTCOMES.changed;
  }

  /** Extends a word selection through one whitespace or non-whitespace run. */
  selectWordThroughAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): EditorOutcome {
    const target = this.#indexAt(columns, maximumRows, row, column);
    const baseStart = this.#wordSelectionStart;
    const baseEnd = this.#wordSelectionEnd;
    if (
      target === undefined ||
      target >= this.#characters.length ||
      baseStart === undefined ||
      baseEnd === undefined
    ) {
      return OUTCOMES.unchanged;
    }
    const previousCursor = this.#cursor;
    const previous = this.#selectionBounds();
    const targetBounds = this.#wordBounds(target);
    if (targetBounds.end <= baseStart) {
      this.#selectionAnchor = baseEnd;
      this.#selectionFocus = targetBounds.start;
      this.#cursor = targetBounds.start;
    } else if (targetBounds.start >= baseEnd) {
      this.#selectionAnchor = baseStart;
      this.#selectionFocus = targetBounds.end;
      this.#cursor = targetBounds.end;
    } else {
      this.#selectionAnchor = baseStart;
      this.#selectionFocus = baseEnd;
      this.#cursor = baseEnd;
    }
    this.#selectionOrigin = undefined;
    const next = this.#selectionBounds();
    return previousCursor === this.#cursor &&
      previous?.start === next?.start &&
      previous?.end === next?.end
      ? OUTCOMES.unchanged
      : OUTCOMES.changed;
  }

  #projectAreaDetails(
    columns: number,
    maximumRows: number,
  ): EditorAreaDetails {
    if (!Number.isSafeInteger(columns) || columns < 1) {
      throw new RangeError("editor columns must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maximumRows) || maximumRows < 1) {
      throw new RangeError("editor rows must be a positive safe integer");
    }

    const rows = [""];
    const widths = [0];
    const indices: number[][] = [[]];
    const rowEnds = [0];
    let caretRow = 0;
    let caretColumn = 0;
    for (let index = 0; index <= this.#characters.length; index += 1) {
      if (index === this.#cursor) {
        caretRow = rows.length - 1;
        caretColumn = widths.at(caretRow) ?? 0;
        if (caretColumn === columns) {
          rowEnds.splice(caretRow, 1, index);
          rows.push("");
          widths.push(0);
          indices.push([]);
          rowEnds.push(index);
          caretRow += 1;
          caretColumn = 0;
        }
      }
      const character = this.#characters.at(index);
      if (character === undefined) {
        break;
      }
      if (character === "\n") {
        rowEnds.splice(rows.length - 1, 1, index);
        rows.push("");
        widths.push(0);
        indices.push([]);
        rowEnds.push(index + 1);
        continue;
      }
      if (character === " ") {
        const width = widths.at(widths.length - 1) ?? 0;
        const nextWordWidth = projectedWordWidth(this.#characters, index + 1);
        if (
          width > 0 &&
          nextWordWidth > 0 &&
          width + 1 + nextWordWidth > columns
        ) {
          rowEnds.splice(rows.length - 1, 1, index);
          rows.push("");
          widths.push(0);
          indices.push([]);
          rowEnds.push(index + 1);
          continue;
        }
      }
      if (character === "\t") {
        let width = widths.at(widths.length - 1) ?? 0;
        let spaces = 4 - (width % 4);
        const nextWordWidth = projectedWordWidth(this.#characters, index + 1);
        if (
          width > 0 &&
          nextWordWidth > 0 &&
          width + spaces + nextWordWidth > columns
        ) {
          rowEnds.splice(rows.length - 1, 1, index);
          rows.push("");
          widths.push(0);
          indices.push([]);
          rowEnds.push(index + 1);
          width = 0;
          spaces = 4;
        }
        for (let space = 0; space < spaces; space += 1) {
          appendProjectedCharacter(
            rows,
            widths,
            indices,
            rowEnds,
            " ",
            columns,
            index,
          );
        }
        continue;
      }
      appendProjectedCharacter(
        rows,
        widths,
        indices,
        rowEnds,
        character,
        columns,
        index,
      );
    }

    rowEnds.splice(rows.length - 1, 1, this.#characters.length);

    const start = Math.max(
      0,
      Math.min(caretRow, rows.length - maximumRows),
    );
    const visibleRows = Object.freeze(rows.slice(start, start + maximumRows));
    return Object.freeze({
      rows: visibleRows,
      indices: Object.freeze(
        indices
          .slice(start, start + maximumRows)
          .map((row) => Object.freeze([...row])),
      ),
      rowEnds: Object.freeze(rowEnds.slice(start, start + maximumRows)),
      caretRow: caretRow - start,
      caretColumn,
    });
  }

  #indexAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): number | undefined {
    if (
      !Number.isSafeInteger(row) ||
      row < 0 ||
      !Number.isSafeInteger(column) ||
      column < 0
    ) {
      return undefined;
    }
    const details = this.#projectAreaDetails(columns, maximumRows);
    const text = details.rows.at(row);
    const indices = details.indices.at(row);
    const rowEnd = details.rowEnds.at(row);
    if (text === undefined || indices === undefined || rowEnd === undefined) {
      return undefined;
    }
    let currentColumn = 0;
    let characterIndex = 0;
    for (const character of text) {
      const width = characterCellWidth(character);
      if (column < currentColumn + width) {
        return indices.at(characterIndex) ?? rowEnd;
      }
      currentColumn += width;
      characterIndex += 1;
    }
    return rowEnd;
  }

  #selectionBounds(): { end: number; start: number } | undefined {
    const anchor = this.#selectionAnchor;
    const focus = this.#selectionFocus;
    if (anchor === undefined || focus === undefined || anchor === focus) {
      return undefined;
    }
    return anchor < focus
      ? { end: focus, start: anchor }
      : { end: anchor, start: focus };
  }

  #clearSelection(): void {
    this.#selectionAnchor = undefined;
    this.#selectionFocus = undefined;
    this.#selectionOrigin = undefined;
    this.#wordSelectionStart = undefined;
    this.#wordSelectionEnd = undefined;
  }

  #wordBounds(target: number): { end: number; start: number } {
    const selectedSeparator = isWordSeparator(this.#characters.at(target));
    let start = target;
    let end = target + 1;
    while (
      start > 0 &&
      isWordSeparator(this.#characters.at(start - 1)) === selectedSeparator
    ) {
      start -= 1;
    }
    while (
      end < this.#characters.length &&
      isWordSeparator(this.#characters.at(end)) === selectedSeparator
    ) {
      end += 1;
    }
    return { end, start };
  }

  #deleteSelection(): boolean {
    const selection = this.#selectionBounds();
    if (selection === undefined) {
      return false;
    }
    this.#characters.splice(
      selection.start,
      selection.end - selection.start,
    );
    this.#cursor = selection.start;
    this.#clearSelection();
    return true;
  }
}
