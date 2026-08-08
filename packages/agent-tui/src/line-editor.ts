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

/** Bounded generic single-line editor over Unicode code-point boundaries. */
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

  /** Applies one decoded key and returns an immutable state outcome. */
  apply(event: KeyEvent): EditorOutcome {
    if (event.kind === "text") {
      const inserted = editableCharacters(event.text);
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
}
