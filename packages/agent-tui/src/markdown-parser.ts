import {
  type DisplayDecoration,
  type DisplayLine,
  type DisplayRun,
  type DisplaySurfaceGroup,
  type DisplayWrap,
  readSanitizedLine,
} from "./display-text.js";
import { textCellWidth } from "./cell-width.js";
import { TUI_LIMITS } from "./limits.js";
import {
  highlightSyntaxLine,
  initialSyntaxState,
} from "./syntax-highlighter.js";
import type { Tone } from "./tone.js";

const FENCE_LANGUAGE = /^[A-Za-z0-9_+.#-]{0,32}$/u;
const ORDERED_ITEM = /^(\d{1,9}\. )(.*)$/u;
const TABLE_DELIMITER = /^:?-{3,}:?$/u;

function run(text: string, tone: Tone): DisplayRun {
  return Object.freeze({ text, tone });
}

function displayLine(
  content: readonly DisplayRun[],
  wrap: DisplayWrap = "word",
  prefix: readonly DisplayRun[] = Object.freeze([]),
  continuation: readonly DisplayRun[] = Object.freeze([]),
  surfaceGroup: DisplaySurfaceGroup | undefined = undefined,
  decoration: DisplayDecoration | undefined = undefined,
): DisplayLine {
  return Object.freeze({
    content,
    continuation,
    decoration,
    prefix,
    surfaceGroup,
    wrap,
  });
}

function structuredSurfaceGroup(
  id: number,
  horizontalPadding: 0 | 1 = 1,
): DisplaySurfaceGroup {
  return Object.freeze({ horizontalPadding, id, surface: "inset" });
}

function separatorLine(): DisplayLine {
  return displayLine(
    Object.freeze([]),
    "cell",
    Object.freeze([]),
    Object.freeze([]),
    undefined,
    "separator",
  );
}

function normalizeRuns(runs: readonly DisplayRun[]): readonly DisplayRun[] {
  const normalized: Array<{ text: string; tone: Tone }> = [];
  for (const candidate of runs) {
    if (candidate.text.length === 0) {
      continue;
    }
    const previous = normalized.at(-1);
    if (previous?.tone === candidate.tone) {
      previous.text += candidate.text;
    } else {
      normalized.push({ text: candidate.text, tone: candidate.tone });
    }
  }
  return Object.freeze(
    normalized.map((candidate) => run(candidate.text, candidate.tone)),
  );
}

function exactDelimiterAt(
  text: string,
  index: number,
  delimiter: "`" | "**",
): boolean {
  const unit = delimiter.at(0);
  return (
    unit !== undefined &&
    text.startsWith(delimiter, index) &&
    (index === 0 || text.at(index - 1) !== unit) &&
    text.at(index + delimiter.length) !== unit
  );
}

function findExactClosing(
  text: string,
  startIndex: number,
  delimiter: "`" | "**",
): number {
  let searchIndex = startIndex;
  while (searchIndex < text.length) {
    const found = text.indexOf(delimiter, searchIndex);
    if (found < 0) {
      return -1;
    }
    if (found > startIndex && exactDelimiterAt(text, found, delimiter)) {
      return found;
    }
    searchIndex = found + 1;
  }
  return -1;
}

function inlineRuns(text: string, baseTone: Tone): readonly DisplayRun[] {
  const parsed: DisplayRun[] = [];
  let plainStart = 0;
  let index = 0;
  while (index < text.length) {
    let markerLength = 0;
    if (exactDelimiterAt(text, index, "`")) {
      markerLength = 1;
    } else if (exactDelimiterAt(text, index, "**")) {
      markerLength = 2;
    }
    if (markerLength === 0) {
      index += 1;
      continue;
    }
    const contentStart = index + markerLength;
    const delimiter = markerLength === 1 ? "`" : "**";
    const closing = findExactClosing(text, contentStart, delimiter);
    if (closing < 0) {
      index += markerLength;
      continue;
    }
    if (plainStart < index) {
      parsed.push(run(text.slice(plainStart, index), baseTone));
    }
    parsed.push(
      run(
        text.slice(contentStart, closing),
        delimiter === "`" ? "accent" : "emphasis",
      ),
    );
    index = closing + markerLength;
    plainStart = index;
  }
  if (plainStart < text.length) {
    parsed.push(run(text.slice(plainStart), baseTone));
  }
  return normalizeRuns(parsed);
}

function parsedLine(
  original: string,
  prefix: readonly DisplayRun[],
  content: string,
  baseTone: Tone,
  continuation: readonly DisplayRun[] = Object.freeze([]),
): DisplayLine {
  const parsed = inlineRuns(content, baseTone);
  return prefix.length + parsed.length + continuation.length <=
    TUI_LIMITS.rowSpans
    ? displayLine(parsed, "word", prefix, continuation)
    : displayLine(Object.freeze([run(original, "plain")]));
}

function fenceLanguage(line: string): string | undefined {
  if (!line.startsWith("```")) {
    return undefined;
  }
  const language = line.slice(3);
  return FENCE_LANGUAGE.test(language) ? language : undefined;
}

type Fence = Readonly<{
  bodyRows: number;
  hadBreak: boolean;
  nextIndex: number;
  startIndex: number;
}>;

function findClosingFence(text: string, startIndex: number): Fence | undefined {
  let index = startIndex;
  let bodyRows = 0;
  while (index < text.length) {
    const start = index;
    const line = readSanitizedLine(text, index);
    if (line.text === "```") {
      return Object.freeze({
        bodyRows,
        hadBreak: line.hadBreak,
        nextIndex: line.nextIndex,
        startIndex: start,
      });
    }
    bodyRows += 1;
    index = line.nextIndex;
  }
  return undefined;
}

function tableCells(line: string): readonly string[] | undefined {
  let source = line.trim();
  if (!source.includes("|") || source.includes("\\|")) {
    return undefined;
  }
  if (source.startsWith("|")) {
    source = source.slice(1);
  }
  if (source.endsWith("|")) {
    source = source.slice(0, -1);
  }
  const cells = source.split("|").map((cell) => cell.trim());
  if (cells.length < 2 || cells.some((cell) => cell.length === 0)) {
    return undefined;
  }
  return Object.freeze(cells);
}

function tableDelimiter(
  line: string,
  expectedCells: number,
): boolean {
  const cells = tableCells(line);
  return (
    cells !== undefined &&
    cells.length === expectedCells &&
    cells.every((cell) => TABLE_DELIMITER.test(cell))
  );
}

function inlineWidth(text: string, baseTone: Tone): number {
  return inlineRuns(text, baseTone).reduce(
    (total, candidate) => total + textCellWidth(candidate.text),
    0,
  );
}

function tableColumnWidths(
  text: string,
  bodyIndex: number,
  header: readonly string[],
): readonly number[] {
  const widths = header.map((cell) => inlineWidth(cell, "emphasis"));
  let index = bodyIndex;
  while (index < text.length) {
    const line = readSanitizedLine(text, index);
    const cells = tableCells(line.text);
    if (cells === undefined || cells.length !== header.length) {
      break;
    }
    for (let position = 0; position < cells.length; position += 1) {
      const cell = cells.at(position);
      if (cell !== undefined) {
        widths.splice(
          position,
          1,
          Math.max(
            widths.at(position) ?? 0,
            inlineWidth(cell, "plain"),
          ),
        );
      }
    }
    index = line.nextIndex;
  }
  return Object.freeze(widths);
}

function tableLine(
  original: string,
  cells: readonly string[],
  columnWidths: readonly number[],
  baseTone: Tone,
  surfaceGroup: DisplaySurfaceGroup,
): DisplayLine {
  const runs: DisplayRun[] = [];
  for (let position = 0; position < cells.length; position += 1) {
    const cell = cells.at(position);
    if (cell === undefined) {
      return displayLine(
        Object.freeze([run(original, "plain")]),
        "word",
        Object.freeze([]),
        Object.freeze([]),
        surfaceGroup,
      );
    }
    if (position > 0) {
      runs.push(run(" \u2502 ", "muted"));
    }
    const cellRuns = inlineRuns(cell, baseTone);
    runs.push(...cellRuns);
    const padding = (columnWidths.at(position) ?? 0) - inlineWidth(cell, baseTone);
    if (padding > 0) {
      runs.push(run(" ".repeat(padding), baseTone));
    }
  }
  return runs.length <= TUI_LIMITS.rowSpans
    ? displayLine(
        normalizeRuns(runs),
        "word",
        Object.freeze([]),
        Object.freeze([]),
        surfaceGroup,
      )
    : displayLine(
        Object.freeze([run(original, "plain")]),
        "word",
        Object.freeze([]),
        Object.freeze([]),
        surfaceGroup,
      );
}

function tableHeaderRule(
  columnWidths: readonly number[],
  surfaceGroup: DisplaySurfaceGroup,
): DisplayLine {
  const ruleWidth = columnWidths.reduce(
    (total, width) => total + width,
    Math.max(0, columnWidths.length - 1) * 3,
  );
  return displayLine(
    Object.freeze([run("─".repeat(ruleWidth), "muted")]),
    "cell",
    Object.freeze([]),
    Object.freeze([]),
    surfaceGroup,
  );
}

function ordinaryLine(line: string): DisplayLine {
  if (line === "---") {
    return separatorLine();
  }
  let count = 0;
  while (count < line.length && line.at(count) === "#") {
    count += 1;
  }
  if (count >= 1 && count <= 6 && line.at(count) === " ") {
    return parsedLine(line, Object.freeze([]), line.slice(count + 1), "emphasis");
  }
  if (line.startsWith("- ")) {
    return parsedLine(
      line,
      Object.freeze([run("- ", "muted")]),
      line.slice(2),
      "plain",
      Object.freeze([run("  ", "muted")]),
    );
  }
  const ordered = ORDERED_ITEM.exec(line);
  if (ordered !== null) {
    const marker = ordered.at(1) ?? "";
    return parsedLine(
      line,
      Object.freeze([run(marker, "muted")]),
      ordered.at(2) ?? "",
      "plain",
      Object.freeze([run(" ".repeat(marker.length), "muted")]),
    );
  }
  if (line.startsWith("> ")) {
    return parsedLine(
      line,
      Object.freeze([run("\u2502 ", "muted")]),
      line.slice(2),
      "plain",
      Object.freeze([run("\u2502 ", "muted")]),
    );
  }
  return parsedLine(line, Object.freeze([]), line, "plain");
}

/** Pure line-oriented compiler for the closed Markdown subset in decision 0023. */
export function* markdownDisplayLines(text: string): Generator<DisplayLine> {
  let index = 0;
  let nextSurfaceGroup = 0;
  let noClosingFenceFrom: number | undefined;
  while (index < text.length) {
    const line = readSanitizedLine(text, index);
    const language = fenceLanguage(line.text);
    if (language !== undefined) {
      const maySearch =
        noClosingFenceFrom === undefined || line.nextIndex < noClosingFenceFrom;
      const closing = maySearch
        ? findClosingFence(text, line.nextIndex)
        : undefined;
      if (closing === undefined) {
        noClosingFenceFrom ??= line.nextIndex;
        yield displayLine(Object.freeze([run(line.text, "plain")]));
        index = line.nextIndex;
        if (line.hadBreak && index === text.length) {
          yield displayLine(Object.freeze([]));
        }
        continue;
      } else {
        const visibleRows = closing.bodyRows + (language.length > 0 ? 1 : 0);
        const surfaceGroup = structuredSurfaceGroup(
          nextSurfaceGroup,
          visibleRows <= 2 ? 0 : 1,
        );
        nextSurfaceGroup += 1;
        if (language.length > 0) {
          yield displayLine(
            Object.freeze([run(language, "accent")]),
            "cell",
            Object.freeze([]),
            Object.freeze([]),
            surfaceGroup,
          );
        }
        let codeIndex = line.nextIndex;
        let emittedCode = false;
        let syntaxState = initialSyntaxState(language);
        while (codeIndex < closing.startIndex) {
          const code = readSanitizedLine(text, codeIndex);
          const highlighted = highlightSyntaxLine(code.text, syntaxState);
          yield displayLine(
            highlighted.runs,
            "cell",
            Object.freeze([]),
            Object.freeze([]),
            surfaceGroup,
          );
          emittedCode = true;
          syntaxState = highlighted.state;
          codeIndex = code.nextIndex;
        }
        if (!emittedCode && language.length === 0) {
          yield displayLine(
            Object.freeze([]),
            "cell",
            Object.freeze([]),
            Object.freeze([]),
            surfaceGroup,
          );
        }
        index = closing.nextIndex;
        if (closing.hadBreak && index === text.length) {
          yield displayLine(Object.freeze([]));
        }
        continue;
      }
    } else if (line.hadBreak) {
      const header = tableCells(line.text);
      if (header !== undefined && line.nextIndex < text.length) {
        const delimiter = readSanitizedLine(text, line.nextIndex);
        if (tableDelimiter(delimiter.text, header.length)) {
          const surfaceGroup = structuredSurfaceGroup(nextSurfaceGroup);
          const columnWidths = tableColumnWidths(
            text,
            delimiter.nextIndex,
            header,
          );
          nextSurfaceGroup += 1;
          yield tableLine(
            line.text,
            header,
            columnWidths,
            "emphasis",
            surfaceGroup,
          );
          yield tableHeaderRule(columnWidths, surfaceGroup);
          index = delimiter.nextIndex;
          let lastHadBreak = delimiter.hadBreak;
          while (index < text.length) {
            const body = readSanitizedLine(text, index);
            const cells = tableCells(body.text);
            if (cells === undefined || cells.length !== header.length) {
              break;
            }
            yield tableLine(
              body.text,
              cells,
              columnWidths,
              "plain",
              surfaceGroup,
            );
            index = body.nextIndex;
            lastHadBreak = body.hadBreak;
          }
          if (lastHadBreak && index === text.length) {
            yield displayLine(Object.freeze([]));
          }
          continue;
        }
      }
    }
    yield ordinaryLine(line.text);
    index = line.nextIndex;
    if (line.hadBreak && index === text.length) {
      yield displayLine(Object.freeze([]));
    }
  }
}

/** Compiles isolated documents with one literal blank row between them. */
export function* markdownDisplayDocuments(
  documents: readonly string[],
): Generator<DisplayLine> {
  for (let position = 0; position < documents.length; position += 1) {
    const document = documents.at(position);
    if (document === undefined) {
      return;
    }
    if (position > 0) {
      yield displayLine(Object.freeze([]));
    }
    yield* markdownDisplayLines(document);
  }
}
