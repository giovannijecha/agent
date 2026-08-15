import { characterCellWidth } from "./cell-width.js";
import {
  type DisplayLine,
  type DisplayRun,
} from "./display-text.js";
import { markdownDisplayLines } from "./markdown-parser.js";
import type { Tone } from "./tone.js";
import {
  isHttpsTarget,
  TextSelection,
} from "./text-interaction.js";

const TAB_CELLS = 4;
const HTTPS_PREFIX = "https://";
const TRAILING_URI_PUNCTUATION = ".,;:!?)]}";

function displayRun(
  text: string,
  tone: DisplayRun["tone"],
  options: Readonly<{
    hyperlink?: string | undefined;
    mark?: DisplayRun["mark"] | undefined;
    position?: DisplayRun["position"] | undefined;
    slant?: DisplayRun["slant"] | undefined;
  }> = Object.freeze({}),
): DisplayRun {
  return Object.freeze({
    ...(options.hyperlink === undefined
      ? Object.freeze({})
      : Object.freeze({ hyperlink: options.hyperlink })),
    ...(options.mark === undefined
      ? Object.freeze({})
      : Object.freeze({ mark: options.mark })),
    ...(options.position === undefined
      ? Object.freeze({})
      : Object.freeze({ position: options.position })),
    ...(options.slant === undefined
      ? Object.freeze({})
      : Object.freeze({ slant: options.slant })),
    text,
    tone,
  });
}

function normalizeTabs(
  runs: readonly DisplayRun[],
  initialColumn: number,
): Readonly<{ column: number; runs: readonly DisplayRun[] }> {
  const normalized: DisplayRun[] = [];
  let column = initialColumn;
  for (const candidate of runs) {
    let chunk = "";
    const flush = (): void => {
      if (chunk.length > 0) {
        normalized.push(
          displayRun(chunk, candidate.tone, { slant: candidate.slant }),
        );
        chunk = "";
      }
    };
    for (const character of candidate.text) {
      if (character === "\t") {
        flush();
        const spaces = TAB_CELLS - (column % TAB_CELLS);
        normalized.push(
          displayRun(" ".repeat(spaces), candidate.tone, {
            slant: candidate.slant,
          }),
        );
        column += spaces;
      } else {
        chunk += character;
        column += characterCellWidth(character);
      }
    }
    flush();
  }
  return Object.freeze({ column, runs: Object.freeze(normalized) });
}

function normalizedLine(line: DisplayLine): DisplayLine {
  if (line.decoration !== undefined) {
    return line;
  }
  const prefix = normalizeTabs(line.prefix, 0);
  const content = normalizeTabs(line.content, prefix.column);
  const continuation = normalizeTabs(line.continuation, 0);
  return Object.freeze({
    content: content.runs,
    continuation: continuation.runs,
    decoration: line.decoration,
    prefix: prefix.runs,
    surfaceGroup: line.surfaceGroup,
    wrap: line.wrap,
  });
}

type LinkSegment = Readonly<{
  hyperlink: string | undefined;
  text: string;
}>;

function isUriCharacter(character: string): boolean {
  const point = character.codePointAt(0);
  return (
    point !== undefined &&
    point >= 0x21 &&
    point <= 0x7e &&
    character !== "\"" &&
    character !== "'" &&
    character !== "<" &&
    character !== ">" &&
    character !== "`"
  );
}

function linkSegments(text: string): readonly LinkSegment[] {
  const segments: LinkSegment[] = [];
  let retained = 0;
  let search = 0;
  while (search < text.length) {
    const start = text.indexOf(HTTPS_PREFIX, search);
    if (start < 0) {
      break;
    }
    let end = start + HTTPS_PREFIX.length;
    while (end < text.length) {
      const character = text.at(end);
      if (character === undefined || !isUriCharacter(character)) {
        break;
      }
      end += character.length;
    }
    while (
      end > start + HTTPS_PREFIX.length &&
      TRAILING_URI_PUNCTUATION.includes(text.at(end - 1) ?? "")
    ) {
      end -= 1;
    }
    const target = text.slice(start, end);
    if (!isHttpsTarget(target)) {
      search = start + HTTPS_PREFIX.length;
      continue;
    }
    if (retained < start) {
      segments.push(
        Object.freeze({ hyperlink: undefined, text: text.slice(retained, start) }),
      );
    }
    segments.push(Object.freeze({ hyperlink: target, text: target }));
    retained = end;
    search = Math.max(end, start + HTTPS_PREFIX.length);
  }
  if (retained < text.length) {
    segments.push(
      Object.freeze({ hyperlink: undefined, text: text.slice(retained) }),
    );
  }
  return Object.freeze(segments);
}

function referencedRuns(
  runs: readonly DisplayRun[],
  document: number,
  initialOffset: number,
  selection: TextSelection | undefined,
): Readonly<{ offset: number; runs: readonly DisplayRun[] }> {
  const referenced: DisplayRun[] = [];
  let offset = initialOffset;
  for (const candidate of runs) {
    for (const segment of linkSegments(candidate.text)) {
      let chunk = "";
      let chunkOffset = offset;
      let chunkSelected: boolean | undefined;
      const flush = (): void => {
        if (chunk.length === 0 || chunkSelected === undefined) {
          return;
        }
        referenced.push(
          displayRun(chunk, candidate.tone, {
            hyperlink: segment.hyperlink,
            mark: chunkSelected ? "selected" : "none",
            position: Object.freeze({ document, offset: chunkOffset }),
            slant: candidate.slant,
          }),
        );
        chunk = "";
      };
      for (const character of segment.text) {
        const selected = selection?.contains({ document, offset }) ?? false;
        if (chunkSelected !== selected) {
          flush();
          chunkOffset = offset;
          chunkSelected = selected;
        }
        chunk += character;
        offset += 1;
      }
      flush();
    }
  }
  return Object.freeze({ offset, runs: Object.freeze(referenced) });
}

function logicalLineText(line: DisplayLine): string {
  if (line.decoration !== undefined) {
    return "";
  }
  let text = "";
  for (const candidate of line.prefix) {
    text += candidate.text;
  }
  for (const candidate of line.content) {
    text += candidate.text;
  }
  return text;
}

/** Exact visible logical text used by clipboard reconstruction. */
export function markdownSelectionText(text: string): string {
  const lines: string[] = [];
  for (const candidate of markdownDisplayLines(text)) {
    lines.push(logicalLineText(normalizedLine(candidate)));
  }
  return lines.join("\n");
}

/** Adds stable logical offsets, links, and selection before shared wrapping. */
export function* interactiveMarkdownLines(
  text: string,
  document: number,
  selection: TextSelection | undefined,
  baseTone: Tone = "plain",
): Generator<DisplayLine> {
  let offset = 0;
  let first = true;
  for (const candidate of markdownDisplayLines(text, baseTone)) {
    const line = normalizedLine(candidate);
    if (!first) {
      offset += 1;
    }
    first = false;
    if (line.decoration !== undefined) {
      yield line;
      continue;
    }
    const prefix = referencedRuns(
      line.prefix,
      document,
      offset,
      selection,
    );
    const content = referencedRuns(
      line.content,
      document,
      prefix.offset,
      selection,
    );
    offset = content.offset;
    yield Object.freeze({
      content: content.runs,
      continuation: line.continuation,
      decoration: line.decoration,
      prefix: prefix.runs,
      surfaceGroup: line.surfaceGroup,
      wrap: line.wrap,
    });
  }
}
