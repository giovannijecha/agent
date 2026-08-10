import {
  type DisplayLine,
  type DisplayRun,
  type DisplayWrap,
  readSanitizedLine,
} from "./display-text.js";
import { TUI_LIMITS } from "./limits.js";
import type { Tone } from "./tone.js";

const FENCE_LANGUAGE = /^[A-Za-z0-9_+.#-]{0,32}$/u;
const ORDERED_ITEM = /^(\d{1,9}\. )(.*)$/u;

function run(text: string, tone: Tone): DisplayRun {
  return Object.freeze({ text, tone });
}

function displayLine(
  content: readonly DisplayRun[],
  wrap: DisplayWrap = "word",
  prefix: readonly DisplayRun[] = Object.freeze([]),
  continuation: readonly DisplayRun[] = Object.freeze([]),
): DisplayLine {
  return Object.freeze({ content, continuation, prefix, wrap });
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
    parsed.push(run(text.slice(contentStart, closing), "emphasis"));
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
  hadBreak: boolean;
  nextIndex: number;
  startIndex: number;
}>;

function findClosingFence(text: string, startIndex: number): Fence | undefined {
  let index = startIndex;
  while (index < text.length) {
    const start = index;
    const line = readSanitizedLine(text, index);
    if (line.text === "```") {
      return Object.freeze({
        hadBreak: line.hadBreak,
        nextIndex: line.nextIndex,
        startIndex: start,
      });
    }
    index = line.nextIndex;
  }
  return undefined;
}

function ordinaryLine(line: string): DisplayLine {
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
      } else {
        if (language.length > 0) {
          yield displayLine(
            Object.freeze([run(language, "muted")]),
            "cell",
            Object.freeze([run("\u2502 ", "muted")]),
            Object.freeze([run("\u2502 ", "muted")]),
          );
        }
        let codeIndex = line.nextIndex;
        let emittedCode = false;
        while (codeIndex < closing.startIndex) {
          const code = readSanitizedLine(text, codeIndex);
          yield displayLine(
            Object.freeze([run(code.text, "plain")]),
            "cell",
            Object.freeze([run("\u2502 ", "muted")]),
            Object.freeze([run("\u2502 ", "muted")]),
          );
          emittedCode = true;
          codeIndex = code.nextIndex;
        }
        if (!emittedCode && language.length === 0) {
          yield displayLine(
            Object.freeze([]),
            "cell",
            Object.freeze([run("\u2502", "muted")]),
          );
        }
        index = closing.nextIndex;
        if (closing.hadBreak && index === text.length) {
          yield displayLine(Object.freeze([]));
        }
        continue;
      }
    } else {
      yield ordinaryLine(line.text);
    }
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
