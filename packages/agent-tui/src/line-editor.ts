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
  caretRow: number;
  caretColumn: number;
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
  character: string,
  columns: number,
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
    rows.push(rendered);
    widths.push(width);
    return;
  }
  rows.splice(row, 1, (rows.at(row) ?? "") + rendered);
  widths.splice(row, 1, currentWidth + width);
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

  /** Returns the complete current draft. */
  get text(): string {
    return this.#characters.join("");
  }

  /** Returns the draft length in Unicode code points. */
  get length(): number {
    return this.#characters.length;
  }

  /** Releases all retained draft characters and restores the initial caret. */
  clear(): boolean {
    const changed = this.#characters.length > 0 || this.#cursor !== 0;
    this.#characters.splice(0);
    this.#cursor = 0;
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
      if (this.#characters.length + inserted.length > MAX_CODE_POINTS) {
        return OUTCOMES.limit;
      }
      this.#characters.splice(this.#cursor, 0, ...inserted);
      this.#cursor += inserted.length;
      return OUTCOMES.changed;
    }
    if (event.kind === "left") {
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#cursor -= 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "right") {
      if (this.#cursor === this.#characters.length) {
        return OUTCOMES.unchanged;
      }
      this.#cursor += 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "wordLeft" || event.kind === "wordBackspace") {
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
      return OUTCOMES.changed;
    }
    if (event.kind === "wordRight" || event.kind === "wordDelete") {
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
      return OUTCOMES.changed;
    }
    if (event.kind === "home") {
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#cursor = 0;
      return OUTCOMES.changed;
    }
    if (event.kind === "end") {
      if (this.#cursor === this.#characters.length) {
        return OUTCOMES.unchanged;
      }
      this.#cursor = this.#characters.length;
      return OUTCOMES.changed;
    }
    if (event.kind === "backspace") {
      if (this.#cursor === 0) {
        return OUTCOMES.unchanged;
      }
      this.#characters.splice(this.#cursor - 1, 1);
      this.#cursor -= 1;
      return OUTCOMES.changed;
    }
    if (event.kind === "delete") {
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
    if (!Number.isSafeInteger(columns) || columns < 1) {
      throw new RangeError("editor columns must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maximumRows) || maximumRows < 1) {
      throw new RangeError("editor rows must be a positive safe integer");
    }

    const rows = [""];
    const widths = [0];
    let caretRow = 0;
    let caretColumn = 0;
    for (let index = 0; index <= this.#characters.length; index += 1) {
      if (index === this.#cursor) {
        caretRow = rows.length - 1;
        caretColumn = widths.at(caretRow) ?? 0;
        if (caretColumn === columns && index === this.#characters.length) {
          rows.push("");
          widths.push(0);
          caretRow += 1;
          caretColumn = 0;
        } else if (caretColumn >= columns) {
          caretColumn = columns - 1;
        }
      }
      const character = this.#characters.at(index);
      if (character === undefined) {
        break;
      }
      if (character === "\n") {
        rows.push("");
        widths.push(0);
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
          rows.push("");
          widths.push(0);
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
          rows.push("");
          widths.push(0);
          width = 0;
          spaces = 4;
        }
        for (let space = 0; space < spaces; space += 1) {
          appendProjectedCharacter(rows, widths, " ", columns);
        }
        continue;
      }
      appendProjectedCharacter(rows, widths, character, columns);
    }

    const start = Math.max(
      0,
      Math.min(caretRow, rows.length - maximumRows),
    );
    const visibleRows = Object.freeze(rows.slice(start, start + maximumRows));
    return Object.freeze({
      rows: visibleRows,
      caretRow: caretRow - start,
      caretColumn,
    });
  }
}
