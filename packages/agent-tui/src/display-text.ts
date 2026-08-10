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

export type DisplayWrap = "cell" | "word";

/** Internal logical line with one explicit owned wrapping policy. */
export type DisplayLine = Readonly<{
  content: readonly DisplayRun[];
  continuation: readonly DisplayRun[];
  prefix: readonly DisplayRun[];
  wrap: DisplayWrap;
}>;

type DisplayCell = Readonly<{
  text: string;
  tone: Tone;
  width: number;
}>;

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
    yield Object.freeze({
      content: Object.freeze([Object.freeze({ text: line.text, tone })]),
      continuation: Object.freeze([]),
      prefix: Object.freeze([]),
      wrap: "word",
    });
    index = line.nextIndex;
    if (line.hadBreak && index === text.length) {
      yield Object.freeze({
        content: Object.freeze([]),
        continuation: Object.freeze([]),
        prefix: Object.freeze([]),
        wrap: "word",
      });
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
    let cells: DisplayCell[] = [];
    let width = 0;
    let complete = false;
    let failure: ComponentError | undefined;
    let continuationCells: readonly DisplayCell[] = Object.freeze([]);
    let pendingContinuation = false;
    let wordBreakFloor = 0;

    const retainRow = (rowCells: readonly DisplayCell[]): void => {
      if (complete || failure !== undefined) {
        return;
      }
      const groups: Array<{ chunks: string[]; tone: Tone }> = [];
      for (const cell of rowCells) {
        const previous = groups.at(-1);
        if (previous?.tone === cell.tone) {
          previous.chunks.push(cell.text);
        } else {
          groups.push({ chunks: [cell.text], tone: cell.tone });
        }
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
    };

    const pushRow = (): void => {
      retainRow(cells);
      cells = [];
      width = 0;
    };

    const appendCell = (text: string, tone: Tone, cellWidth: number): void => {
      cells.push(Object.freeze({ text, tone, width: cellWidth }));
      width += cellWidth;
    };

    const lastWordBreak = (): Readonly<{
      continuation: number;
      prefix: number;
    }> | undefined => {
      let space = cells.length - 1;
      while (space >= 0 && cells.at(space)?.text !== " ") {
        space -= 1;
      }
      if (space < 0) {
        return undefined;
      }
      let prefix = space;
      while (prefix > 0 && cells.at(prefix - 1)?.text === " ") {
        prefix -= 1;
      }
      if (prefix <= wordBreakFloor) {
        return undefined;
      }
      let continuation = space + 1;
      while (
        continuation < cells.length &&
        cells.at(continuation)?.text === " "
      ) {
        continuation += 1;
      }
      return Object.freeze({ continuation, prefix });
    };

    const replaceCells = (next: readonly DisplayCell[]): void => {
      cells = [...next];
      width = cells.reduce((total, cell) => total + cell.width, 0);
    };

    const prepareContinuation = (nextWidth: number): void => {
      if (!pendingContinuation) {
        return;
      }
      pendingContinuation = false;
      const continuationWidth = continuationCells.reduce(
        (total, cell) => total + cell.width,
        0,
      );
      if (continuationWidth + nextWidth <= columns) {
        replaceCells(continuationCells);
        wordBreakFloor = continuationCells.length;
      } else {
        replaceCells(Object.freeze([]));
        wordBreakFloor = 0;
      }
    };

    const pushWrappedRow = (): void => {
      pushRow();
      pendingContinuation = true;
      wordBreakFloor = 0;
    };

    const appendPrintable = (
      character: string,
      tone: Tone,
      wrap: DisplayWrap,
    ): void => {
      let printable = character;
      let cellWidth = characterCellWidth(printable);
      if (cellWidth > columns) {
        printable = REPLACEMENT;
        cellWidth = 1;
      }
      if (pendingContinuation) {
        if (wrap === "word" && printable === " ") {
          return;
        }
        prepareContinuation(cellWidth);
      }
      if (width + cellWidth > columns) {
        if (wrap === "word" && printable === " ") {
          pushWrappedRow();
          return;
        }
        const wordBreak = wrap === "word" ? lastWordBreak() : undefined;
        if (wordBreak === undefined) {
          pushWrappedRow();
          prepareContinuation(cellWidth);
        } else {
          const carried = cells.slice(wordBreak.continuation);
          retainRow(cells.slice(0, wordBreak.prefix));
          if (complete || failure !== undefined) {
            return;
          }
          const carriedWidth = carried.reduce(
            (total, cell) => total + cell.width,
            0,
          );
          const continuationWidth = continuationCells.reduce(
            (total, cell) => total + cell.width,
            0,
          );
          const repeated =
            continuationWidth + carriedWidth <= columns
              ? continuationCells
              : Object.freeze([]);
          replaceCells([...repeated, ...carried]);
          wordBreakFloor = repeated.length;
          if (width + cellWidth > columns) {
            pushWrappedRow();
            prepareContinuation(cellWidth);
          }
        }
      }
      if (complete || failure !== undefined) {
        return;
      }
      appendCell(printable, tone, cellWidth);
    };

    const compileContinuation = (
      runs: readonly DisplayRun[],
    ): readonly DisplayCell[] => {
      const compiled: DisplayCell[] = [];
      let compiledWidth = 0;
      for (const candidate of runs) {
        for (const character of candidate.text) {
          if (character === "\t") {
            const spaces = TAB_CELLS - (compiledWidth % TAB_CELLS);
            for (let count = 0; count < spaces; count += 1) {
              if (compiledWidth + 1 >= columns) {
                return Object.freeze([]);
              }
              compiled.push(
                Object.freeze({ text: " ", tone: candidate.tone, width: 1 }),
              );
              compiledWidth += 1;
            }
          } else {
            let printable = character;
            let cellWidth = characterCellWidth(printable);
            if (cellWidth > columns) {
              printable = REPLACEMENT;
              cellWidth = 1;
            }
            if (compiledWidth + cellWidth >= columns) {
              return Object.freeze([]);
            }
            compiled.push(
              Object.freeze({
                text: printable,
                tone: candidate.tone,
                width: cellWidth,
              }),
            );
            compiledWidth += cellWidth;
          }
        }
      }
      return Object.freeze(compiled);
    };

    for (const line of lines) {
      if (complete || failure !== undefined) {
        break;
      }
      if (
        typeof line !== "object" ||
        line === null ||
        !Array.isArray(line.content) ||
        !Array.isArray(line.continuation) ||
        !Array.isArray(line.prefix) ||
        line.content.length + line.continuation.length + line.prefix.length >
          TUI_LIMITS.rowSpans ||
        (line.wrap !== "cell" && line.wrap !== "word")
      ) {
        return err(new ComponentError("invalidRow", undefined));
      }
      const allRuns = [...line.prefix, ...line.content, ...line.continuation];
      for (let position = 0; position < allRuns.length; position += 1) {
        const candidate = allRuns.at(position);
        if (
          candidate === undefined ||
          typeof candidate.text !== "string" ||
          !isTone(candidate.tone)
        ) {
          return err(new ComponentError("invalidRow", position));
        }
      }
      continuationCells = compileContinuation(line.continuation);
      pendingContinuation = false;
      wordBreakFloor = 0;
      const initialRuns = [...line.prefix, ...line.content];
      for (let position = 0; position < initialRuns.length; position += 1) {
        const candidate = initialRuns.at(position);
        if (candidate === undefined) {
          return err(new ComponentError("invalidRow", position));
        }
        for (const character of candidate.text) {
          if (character === "\t") {
            const spaces = TAB_CELLS - (width % TAB_CELLS);
            for (let count = 0; count < spaces; count += 1) {
              appendPrintable(" ", candidate.tone, line.wrap);
            }
          } else {
            appendPrintable(character, candidate.tone, line.wrap);
          }
          if (complete || failure !== undefined) {
            break;
          }
        }
        if (complete || failure !== undefined) {
          break;
        }
        if (position + 1 === line.prefix.length) {
          wordBreakFloor = cells.length;
        }
      }
      if (!(pendingContinuation && cells.length === 0)) {
        pushRow();
      }
      continuationCells = Object.freeze([]);
      pendingContinuation = false;
      wordBreakFloor = 0;
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
