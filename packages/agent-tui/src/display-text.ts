import { characterCellWidth } from "./cell-width.js";
import {
  ComponentError,
  validComponentColumns,
} from "./component.js";
import { TUI_LIMITS } from "./limits.js";
import { RichRow, TextSpan } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import { isTone, type Tone } from "./tone.js";

const TAB_CELLS = 4;
const REPLACEMENT = "?";

/** Internal printable run consumed by the single structured display layout. */
export type DisplayRun = Readonly<{ text: string; tone: Tone }>;

/** Internal logical line before conservative terminal-cell wrapping. */
export type DisplayLine = readonly DisplayRun[];

export type SanitizedLine = Readonly<{
  hadBreak: boolean;
  nextIndex: number;
  text: string;
}>;

function isControl(point: number): boolean {
  return point <= 0x1f || (point >= 0x7f && point <= 0x9f);
}

function isSurrogate(point: number): boolean {
  return point >= 0xd800 && point <= 0xdfff;
}

/** Reads and sanitizes one logical line without retaining the source object. */
export function readSanitizedLine(
  text: string,
  startIndex: number,
): SanitizedLine {
  const chunks: string[] = [];
  let index = startIndex;
  let printableStart = startIndex;
  const sanitizedThrough = (endIndex: number): string => {
    if (printableStart < endIndex) {
      chunks.push(text.slice(printableStart, endIndex));
    }
    return chunks.join("");
  };
  while (index < text.length) {
    const first = text.charCodeAt(index);
    if (first === 0x0d || first === 0x0a) {
      const nextIndex =
        first === 0x0d && text.charCodeAt(index + 1) === 0x0a
          ? index + 2
          : index + 1;
      return Object.freeze({
        hadBreak: true,
        nextIndex,
        text: sanitizedThrough(index),
      });
    }
    const point = text.codePointAt(index);
    if (point === undefined) {
      break;
    }
    const units = point > 0xffff ? 2 : 1;
    if ((isControl(point) && point !== 0x09) || isSurrogate(point)) {
      if (printableStart < index) {
        chunks.push(text.slice(printableStart, index));
      }
      chunks.push(REPLACEMENT);
      printableStart = index + units;
    }
    index += units;
  }
  return Object.freeze({
    hadBreak: false,
    nextIndex: index,
    text: sanitizedThrough(index),
  });
}

function* plainDisplayLines(text: string, tone: Tone): Generator<DisplayLine> {
  let index = 0;
  while (index < text.length) {
    const line = readSanitizedLine(text, index);
    yield Object.freeze([Object.freeze({ text: line.text, tone })]);
    index = line.nextIndex;
    if (line.hadBreak && index === text.length) {
      yield Object.freeze([]);
    }
  }
}

function validateLayout(
  columns: number,
  anchor: "head" | "tail",
  maximumRows: number,
): boolean {
  return (
    validComponentColumns(columns) &&
    Number.isSafeInteger(maximumRows) &&
    maximumRows >= 1 &&
    maximumRows <= TUI_LIMITS.frameRows &&
    (anchor === "head" || anchor === "tail")
  );
}

/**
 * Wraps sanitized logical lines into the canonical structured-row carrier.
 * This is the only display layout used by plain text and bounded Markdown.
 */
export function layoutDisplayLines(
  lines: Iterable<DisplayLine>,
  columns: number,
  anchor: "head" | "tail",
  maximumRows: number,
): Result<readonly RichRow[], ComponentError> {
  if (!validateLayout(columns, anchor, maximumRows)) {
    return err(new ComponentError("invalidGeometry", undefined));
  }

  try {
    const headRows: RichRow[] = [];
    const tailRows = new Map<number, RichRow>();
    let retainedTailRows = 0;
    let tailCursor = 0;
    let groups: Array<{ chunks: string[]; tone: Tone }> = [];
    let width = 0;
    let complete = false;
    let failure: ComponentError | undefined;

    const pushRow = (): void => {
      if (complete || failure !== undefined) {
        return;
      }
      const spans: TextSpan[] = [];
      for (let position = 0; position < groups.length; position += 1) {
        const group = groups.at(position);
        if (group === undefined) {
          failure = new ComponentError("invalidRow", position);
          return;
        }
        const span = TextSpan.create(group.chunks.join(""), group.tone);
        if (!span.ok) {
          failure = new ComponentError("invalidRow", position);
          return;
        }
        spans.push(span.value);
      }
      const row = RichRow.create(spans);
      if (!row.ok) {
        failure = new ComponentError("invalidRow", undefined);
        return;
      }
      if (anchor === "head") {
        headRows.push(row.value);
        complete = headRows.length >= maximumRows;
      } else if (retainedTailRows < maximumRows) {
        tailRows.set(retainedTailRows, row.value);
        retainedTailRows += 1;
      } else {
        tailRows.set(tailCursor, row.value);
        tailCursor = (tailCursor + 1) % maximumRows;
      }
      groups = [];
      width = 0;
    };

    const appendPrintable = (character: string, tone: Tone): void => {
      let printable = character;
      let cellWidth = characterCellWidth(printable);
      if (cellWidth > columns) {
        printable = REPLACEMENT;
        cellWidth = 1;
      }
      if (width + cellWidth > columns) {
        pushRow();
      }
      if (complete || failure !== undefined) {
        return;
      }
      const previous = groups.at(-1);
      if (previous?.tone === tone) {
        previous.chunks.push(printable);
      } else {
        groups.push({ chunks: [printable], tone });
      }
      width += cellWidth;
    };

    for (const line of lines) {
      if (complete || failure !== undefined) {
        break;
      }
      if (!Array.isArray(line) || line.length > TUI_LIMITS.rowSpans) {
        return err(new ComponentError("invalidRow", undefined));
      }
      for (let position = 0; position < line.length; position += 1) {
        const candidate = line.at(position);
        if (
          candidate === undefined ||
          typeof candidate.text !== "string" ||
          !isTone(candidate.tone)
        ) {
          return err(new ComponentError("invalidRow", position));
        }
        for (const character of candidate.text) {
          if (character === "\t") {
            const spaces = TAB_CELLS - (width % TAB_CELLS);
            for (let count = 0; count < spaces; count += 1) {
              appendPrintable(" ", candidate.tone);
            }
          } else {
            appendPrintable(character, candidate.tone);
          }
          if (complete || failure !== undefined) {
            break;
          }
        }
        if (complete || failure !== undefined) {
          break;
        }
      }
      pushRow();
    }
    if (failure !== undefined) {
      return err(failure);
    }
    if (anchor === "head") {
      return ok(Object.freeze(headRows));
    }

    const ordered: RichRow[] = [];
    const start = retainedTailRows < maximumRows ? 0 : tailCursor;
    for (let offset = 0; offset < retainedTailRows; offset += 1) {
      const retained = tailRows.get((start + offset) % maximumRows);
      if (retained !== undefined) {
        ordered.push(retained);
      }
    }
    return ok(Object.freeze(ordered));
  } catch (_cause: unknown) {
    return err(new ComponentError("invalidText", undefined));
  }
}

/** Converts bounded untrusted text into printable conservatively wrapped rows. */
export function layoutDisplayText(
  text: string,
  columns: number,
  anchor: "head" | "tail",
  maximumRows: number,
  tone: Tone,
): Result<readonly RichRow[], ComponentError> {
  if (typeof text !== "string") {
    return err(new ComponentError("invalidText", undefined));
  }
  if (text.length > TUI_LIMITS.displayTextCodeUnits) {
    return err(new ComponentError("textTooLong", undefined));
  }
  if (!isTone(tone)) {
    return err(new ComponentError("invalidTone", undefined));
  }
  if (text.length === 0) {
    return validateLayout(columns, anchor, maximumRows)
      ? ok(Object.freeze([]))
      : err(new ComponentError("invalidGeometry", undefined));
  }
  return layoutDisplayLines(
    plainDisplayLines(text, tone),
    columns,
    anchor,
    maximumRows,
  );
}
