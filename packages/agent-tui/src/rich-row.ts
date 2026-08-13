import {
  characterCellWidth,
  hasLoneSurrogate,
  textCellWidth,
} from "./cell-width.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";
import {
  normalizeTextStyle,
  type SurfaceTone,
  type TextMark,
  type TextSlant,
  type TextStyleOptions,
} from "./text-style.js";
import {
  normalizeTextInteraction,
  type TextPosition,
} from "./text-interaction.js";
import { isTone, type Tone } from "./tone.js";

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/u;

export type RichRowErrorKind =
  | "controlCharacter"
  | "invalidRow"
  | "invalidScalar"
  | "invalidSpan"
  | "invalidStyle"
  | "invalidText"
  | "invalidTone"
  | "invalidWidth"
  | "lineTooLong"
  | "tooManySpans";

/** Content-free validation failure for one semantic span or structured row. */
export class RichRowError {
  readonly #kind: RichRowErrorKind;
  readonly #position: number | undefined;

  constructor(kind: RichRowErrorKind, position: number | undefined) {
    this.#kind = kind;
    this.#position = position;
    Object.freeze(this);
  }

  get kind(): RichRowErrorKind {
    return this.#kind;
  }

  get position(): number | undefined {
    return this.#position;
  }
}

function codePointLength(text: string): number {
  let count = 0;
  for (const _character of text) {
    count += 1;
  }
  return count;
}

function validateText(text: unknown): Result<string, RichRowError> {
  if (typeof text !== "string") {
    return err(new RichRowError("invalidText", undefined));
  }
  if (text.length > TUI_LIMITS.frameLineCodePoints * 2) {
    return err(new RichRowError("lineTooLong", undefined));
  }
  if (CONTROL_CHARACTER.test(text)) {
    return err(new RichRowError("controlCharacter", undefined));
  }
  if (hasLoneSurrogate(text)) {
    return err(new RichRowError("invalidScalar", undefined));
  }
  if (codePointLength(text) > TUI_LIMITS.frameLineCodePoints) {
    return err(new RichRowError("lineTooLong", undefined));
  }
  return ok(text);
}

/** Immutable printable text carrying one renderer-owned semantic role. */
export class TextSpan {
  readonly #slant: TextSlant;
  readonly #surface: SurfaceTone;
  readonly #text: string;
  readonly #tone: Tone;
  readonly #hyperlink: string | undefined;
  readonly #mark: TextMark;
  readonly #position: TextPosition | undefined;

  private constructor(
    text: string,
    tone: Tone,
    mark: TextMark,
    slant: TextSlant,
    surface: SurfaceTone,
    hyperlink: string | undefined,
    position: TextPosition | undefined,
  ) {
    this.#text = text;
    this.#tone = tone;
    this.#mark = mark;
    this.#slant = slant;
    this.#surface = surface;
    this.#hyperlink = hyperlink;
    this.#position = position;
    Object.freeze(this);
  }

  static create(
    text: unknown,
    tone: unknown = "plain",
    style?: unknown,
    interaction?: unknown,
  ): Result<TextSpan, RichRowError> {
    const validated = validateText(text);
    if (!validated.ok) {
      return validated;
    }
    if (!isTone(tone)) {
      return err(new RichRowError("invalidTone", undefined));
    }
    const normalizedStyle = normalizeTextStyle(style);
    if (normalizedStyle === undefined) {
      return err(new RichRowError("invalidStyle", undefined));
    }
    const normalizedInteraction = normalizeTextInteraction(interaction);
    if (normalizedInteraction === undefined) {
      return err(new RichRowError("invalidSpan", undefined));
    }
    return ok(
      new TextSpan(
        validated.value,
        tone,
        normalizedStyle.mark,
        normalizedStyle.slant,
        normalizedStyle.surface,
        normalizedInteraction.hyperlink,
        normalizedInteraction.position,
      ),
    );
  }

  /** Copies a genuine span without invoking overridable public accessors. */
  static snapshot(value: unknown): Result<TextSpan, RichRowError> {
    if (!(value instanceof TextSpan)) {
      return err(new RichRowError("invalidSpan", undefined));
    }
    try {
      return TextSpan.create(value.#text, value.#tone, {
        mark: value.#mark,
        slant: value.#slant,
        surface: value.#surface,
      }, {
        hyperlink: value.#hyperlink,
        position: value.#position,
      });
    } catch (_cause: unknown) {
      return err(new RichRowError("invalidSpan", undefined));
    }
  }

  get text(): string {
    return this.#text;
  }

  get slant(): TextSlant {
    return this.#slant;
  }

  get mark(): TextMark {
    return this.#mark;
  }

  get surface(): SurfaceTone {
    return this.#surface;
  }

  get tone(): Tone {
    return this.#tone;
  }

  get hyperlink(): string | undefined {
    return this.#hyperlink;
  }

  get position(): TextPosition | undefined {
    return this.#position;
  }
}

/** Immutable normalized row used by every component, frame, and renderer. */
export class RichRow {
  static readonly #empty = new RichRow(Object.freeze([]), "", 0);

  readonly #cellWidth: number;
  readonly #spans: readonly TextSpan[];
  readonly #text: string;

  private constructor(
    spans: readonly TextSpan[],
    text: string,
    cellWidth: number,
  ) {
    this.#spans = Object.freeze([...spans]);
    this.#text = text;
    this.#cellWidth = cellWidth;
    Object.freeze(this);
  }

  static empty(): RichRow {
    return RichRow.#empty;
  }

  static fromText(
    text: unknown,
    tone: unknown = "plain",
    style?: TextStyleOptions,
  ): Result<RichRow, RichRowError> {
    const created = TextSpan.create(text, tone, style);
    return created.ok ? RichRow.create([created.value]) : created;
  }

  /** Validates, copies, and normalizes a bounded external span collection. */
  static create(spans: readonly TextSpan[]): Result<RichRow, RichRowError> {
    try {
      if (!Array.isArray(spans)) {
        return err(new RichRowError("invalidSpan", undefined));
      }
      const count = spans.length;
      if (count > TUI_LIMITS.rowSpans) {
        return err(new RichRowError("tooManySpans", undefined));
      }

      const groups: Array<{
        chunks: string[];
        hyperlink: string | undefined;
        length: number;
        mark: TextMark;
        position: TextPosition | undefined;
        slant: TextSlant;
        surface: SurfaceTone;
        tone: Tone;
      }> = [];
      let totalCodePoints = 0;
      for (let position = 0; position < count; position += 1) {
        let candidate: unknown;
        try {
          candidate = spans.at(position);
        } catch (_cause: unknown) {
          return err(new RichRowError("invalidSpan", position));
        }
        const copied = TextSpan.snapshot(candidate);
        if (!copied.ok) {
          return err(new RichRowError("invalidSpan", position));
        }
        if (copied.value.text.length === 0) {
          continue;
        }
        totalCodePoints += codePointLength(copied.value.text);
        if (totalCodePoints > TUI_LIMITS.frameLineCodePoints) {
          return err(new RichRowError("lineTooLong", position));
        }

        const previous = groups.at(-1);
        const contiguousPosition =
          previous?.position === undefined
            ? copied.value.position === undefined
            : copied.value.position !== undefined &&
              previous.position.document === copied.value.position.document &&
              previous.position.offset + previous.length ===
                copied.value.position.offset;
        if (
          previous?.tone === copied.value.tone &&
          previous.mark === copied.value.mark &&
          previous.slant === copied.value.slant &&
          previous.surface === copied.value.surface &&
          previous.hyperlink === copied.value.hyperlink &&
          contiguousPosition
        ) {
          previous.chunks.push(copied.value.text);
          previous.length += codePointLength(copied.value.text);
        } else {
          groups.push({
            chunks: [copied.value.text],
            hyperlink: copied.value.hyperlink,
            length: codePointLength(copied.value.text),
            mark: copied.value.mark,
            position: copied.value.position,
            slant: copied.value.slant,
            surface: copied.value.surface,
            tone: copied.value.tone,
          });
        }
      }

      if (groups.length === 0) {
        return ok(RichRow.empty());
      }
      const normalized: TextSpan[] = [];
      for (const group of groups) {
        const merged = TextSpan.create(group.chunks.join(""), group.tone, {
          mark: group.mark,
          slant: group.slant,
          surface: group.surface,
        }, {
          hyperlink: group.hyperlink,
          position: group.position,
        });
        if (!merged.ok) {
          return merged;
        }
        normalized.push(merged.value);
      }
      const text = normalized.map((span) => span.text).join("");
      return ok(new RichRow(normalized, text, textCellWidth(text)));
    } catch (_cause: unknown) {
      return err(new RichRowError("invalidSpan", undefined));
    }
  }

  /** Copies a genuine row without invoking overridable public accessors. */
  static snapshot(value: unknown): Result<RichRow, RichRowError> {
    if (!(value instanceof RichRow)) {
      return err(new RichRowError("invalidRow", undefined));
    }
    try {
      return RichRow.create(value.#spans);
    } catch (_cause: unknown) {
      return err(new RichRowError("invalidRow", undefined));
    }
  }

  /** Returns a cell-bounded prefix while preserving normalized span roles. */
  fit(columns: number): Result<RichRow, RichRowError> {
    try {
      if (
        !Number.isSafeInteger(columns) ||
        columns < 1
      ) {
        return err(new RichRowError("invalidWidth", undefined));
      }
      if (this.#cellWidth <= columns) {
        return ok(this);
      }

      const fitted: TextSpan[] = [];
      let used = 0;
      let full = false;
      for (const span of this.#spans) {
        const characters: string[] = [];
        for (const character of span.text) {
          const width = characterCellWidth(character);
          if (used + width > columns) {
            full = true;
            break;
          }
          characters.push(character);
          used += width;
        }
        if (characters.length > 0) {
          const created = TextSpan.create(characters.join(""), span.tone, {
            mark: span.mark,
            slant: span.slant,
            surface: span.surface,
          }, {
            hyperlink: span.hyperlink,
            position: span.position,
          });
          if (!created.ok) {
            return created;
          }
          fitted.push(created.value);
        }
        if (full) {
          break;
        }
      }
      return RichRow.create(fitted);
    } catch (_cause: unknown) {
      return err(new RichRowError("invalidRow", undefined));
    }
  }

  /** Structural comparison used by the differential renderer. */
  equals(other: unknown): boolean {
    if (!(other instanceof RichRow)) {
      return false;
    }
    try {
      if (this.#spans.length !== other.#spans.length) {
        return false;
      }
      for (let index = 0; index < this.#spans.length; index += 1) {
        const left = this.#spans.at(index);
        const right = other.#spans.at(index);
        if (
          left?.text !== right?.text ||
          left?.tone !== right?.tone ||
          left?.mark !== right?.mark ||
          left?.slant !== right?.slant ||
          left?.surface !== right?.surface ||
          left?.hyperlink !== right?.hyperlink ||
          left?.position?.document !== right?.position?.document ||
          left?.position?.offset !== right?.position?.offset
        ) {
          return false;
        }
      }
      return true;
    } catch (_cause: unknown) {
      return false;
    }
  }

  get cellWidth(): number {
    return this.#cellWidth;
  }

  get spans(): readonly TextSpan[] {
    return this.#spans;
  }

  get text(): string {
    return this.#text;
  }
}
