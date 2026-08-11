import { TUI_LIMITS } from "./limits.js";
import type { Tone } from "./tone.js";

type SyntaxProfile = "json" | "markup" | "plain" | "script" | "shell" | "style";
type SyntaxConstruct =
  | "blockComment"
  | "doubleQuote"
  | "markupComment"
  | "none"
  | "powerShellComment"
  | "singleQuote"
  | "template";
type ShellDialect = "cmd" | "generic" | "powershell";

export type SyntaxRun = Readonly<{ text: string; tone: Tone }>;

export type SyntaxState = Readonly<{
  active: SyntaxProfile;
  base: SyntaxProfile;
  construct: SyntaxConstruct;
  shellDialect: ShellDialect;
}>;

export type HighlightedSyntaxLine = Readonly<{
  runs: readonly SyntaxRun[];
  state: SyntaxState;
}>;

const SCRIPT_KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "set",
  "static",
  "super",
  "switch",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const SCRIPT_LITERALS = new Set([
  "false",
  "Infinity",
  "NaN",
  "null",
  "true",
  "undefined",
]);

const SHELL_KEYWORDS = new Set([
  "case",
  "do",
  "done",
  "elif",
  "else",
  "esac",
  "fi",
  "for",
  "foreach",
  "function",
  "if",
  "in",
  "param",
  "return",
  "select",
  "switch",
  "then",
  "trap",
  "until",
  "while",
]);

const PROFILE_ALIASES = new Map<string, SyntaxProfile>([
  ["bash", "shell"],
  ["bat", "shell"],
  ["cjs", "script"],
  ["cmd", "shell"],
  ["css", "style"],
  ["html", "markup"],
  ["javascript", "script"],
  ["js", "script"],
  ["json", "json"],
  ["jsonc", "json"],
  ["jsx", "script"],
  ["mjs", "script"],
  ["powershell", "shell"],
  ["ps1", "shell"],
  ["scss", "style"],
  ["sh", "shell"],
  ["shell", "shell"],
  ["svg", "markup"],
  ["ts", "script"],
  ["tsx", "script"],
  ["typescript", "script"],
  ["xml", "markup"],
  ["zsh", "shell"],
]);

type MutableRun = { text: string; tone: Tone };

function syntaxState(
  base: SyntaxProfile,
  active: SyntaxProfile,
  construct: SyntaxConstruct,
  shellDialect: ShellDialect,
): SyntaxState {
  return Object.freeze({ active, base, construct, shellDialect });
}

function append(runs: MutableRun[], text: string, tone: Tone): void {
  if (text.length === 0) {
    return;
  }
  const previous = runs.at(-1);
  if (previous?.tone === tone) {
    previous.text += text;
  } else {
    runs.push({ text, tone });
  }
}

function finish(
  source: string,
  runs: readonly MutableRun[],
  state: SyntaxState,
): HighlightedSyntaxLine {
  const normalized =
    runs.length > TUI_LIMITS.rowSpans
      ? Object.freeze([Object.freeze({ text: source, tone: "plain" as const })])
      : Object.freeze(
          runs.map((candidate) =>
            Object.freeze({ text: candidate.text, tone: candidate.tone }),
          ),
        );
  return Object.freeze({ runs: normalized, state });
}

function codePointUnits(text: string, index: number): number {
  const point = text.codePointAt(index);
  return point !== undefined && point > 0xffff ? 2 : 1;
}

function isAsciiLetter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= "0" && character <= "9";
}

function isIdentifierStart(character: string | undefined): boolean {
  return isAsciiLetter(character) || character === "_" || character === "$";
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || isDigit(character);
}

function scanWhile(
  text: string,
  start: number,
  predicate: (character: string | undefined) => boolean,
): number {
  let index = start;
  while (index < text.length && predicate(text.at(index))) {
    index += 1;
  }
  return index;
}

function scanNumber(text: string, start: number): number {
  let index = start;
  const radix = text.at(index + 1)?.toLowerCase();
  if (text.at(index) === "0" && radix === "x") {
    index += 2;
    return scanWhile(text, index, (character) =>
      character !== undefined && /[0-9A-Fa-f_]/u.test(character),
    );
  }
  if (text.at(index) === "0" && radix === "b") {
    index += 2;
    return scanWhile(
      text,
      index,
      (character) => character === "0" || character === "1" || character === "_",
    );
  }
  if (text.at(index) === "0" && radix === "o") {
    index += 2;
    return scanWhile(
      text,
      index,
      (character) =>
        character === "_" ||
        (character !== undefined && character >= "0" && character <= "7"),
    );
  }
  index = scanWhile(text, index, (character) =>
    isDigit(character) || character === "_",
  );
  if (text.at(index) === ".") {
    index += 1;
    index = scanWhile(text, index, (character) =>
      isDigit(character) || character === "_",
    );
  }
  if (text.at(index) === "e" || text.at(index) === "E") {
    const exponent = index;
    index += 1;
    if (text.at(index) === "+" || text.at(index) === "-") {
      index += 1;
    }
    const digits = scanWhile(text, index, (character) =>
      isDigit(character) || character === "_",
    );
    index = digits === index ? exponent : digits;
  }
  return index;
}

function quotedEnd(
  text: string,
  start: number,
  quote: "'" | '"' | "`",
): Readonly<{ closed: boolean; end: number }> {
  let index = start;
  let escaped = false;
  while (index < text.length) {
    const character = text.at(index);
    index += 1;
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === quote) {
      return Object.freeze({ closed: true, end: index });
    }
  }
  return Object.freeze({ closed: false, end: index });
}

function quoteCharacter(construct: SyntaxConstruct): "'" | '"' | "`" | undefined {
  switch (construct) {
    case "singleQuote":
      return "'";
    case "doubleQuote":
      return '"';
    case "template":
      return "`";
    default:
      return undefined;
  }
}

function quoteConstruct(quote: "'" | '"' | "`"): SyntaxConstruct {
  return quote === "'"
    ? "singleQuote"
    : quote === '"'
      ? "doubleQuote"
      : "template";
}

type ScanResult = Readonly<{
  construct: SyntaxConstruct;
  lineComment?: boolean;
  runs: readonly MutableRun[];
}>;

function scanScript(text: string, construct: SyntaxConstruct): ScanResult {
  const runs: MutableRun[] = [];
  let index = 0;
  let active = construct;
  let lineComment = false;
  while (index < text.length) {
    if (active === "blockComment") {
      const closing = text.indexOf("*/", index);
      const end = closing < 0 ? text.length : closing + 2;
      append(runs, text.slice(index, end), "syntaxComment");
      index = end;
      if (closing < 0) {
        break;
      }
      active = "none";
      continue;
    }
    const continuedQuote = quoteCharacter(active);
    if (continuedQuote !== undefined) {
      const quoted = quotedEnd(text, index, continuedQuote);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      if (!quoted.closed) {
        break;
      }
      active = "none";
      continue;
    }
    if (text.startsWith("//", index) || (index === 0 && text.startsWith("#!"))) {
      append(runs, text.slice(index), "syntaxComment");
      index = text.length;
      lineComment = true;
      continue;
    }
    if (text.startsWith("/*", index)) {
      active = "blockComment";
      continue;
    }
    const character = text.at(index);
    if (character === "'" || character === '"' || character === "`") {
      const quoted = quotedEnd(text, index + 1, character);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      active = quoted.closed ? "none" : quoteConstruct(character);
      continue;
    }
    if (isDigit(character)) {
      const end = scanNumber(text, index);
      append(runs, text.slice(index, end), "syntaxLiteral");
      index = end;
      continue;
    }
    if (isIdentifierStart(character)) {
      const end = scanWhile(text, index + 1, isIdentifierPart);
      const word = text.slice(index, end);
      append(
        runs,
        word,
        SCRIPT_KEYWORDS.has(word)
          ? "syntaxKeyword"
          : SCRIPT_LITERALS.has(word)
            ? "syntaxLiteral"
            : "plain",
      );
      index = end;
      continue;
    }
    const units = codePointUnits(text, index);
    append(runs, text.slice(index, index + units), "plain");
    index += units;
  }
  return Object.freeze({ construct: active, lineComment, runs });
}

function scanJson(text: string, construct: SyntaxConstruct): ScanResult {
  const runs: MutableRun[] = [];
  let index = 0;
  let active = construct;
  while (index < text.length) {
    if (active === "blockComment") {
      const closing = text.indexOf("*/", index);
      const end = closing < 0 ? text.length : closing + 2;
      append(runs, text.slice(index, end), "syntaxComment");
      index = end;
      if (closing < 0) {
        break;
      }
      active = "none";
      continue;
    }
    if (text.startsWith("//", index)) {
      append(runs, text.slice(index), "syntaxComment");
      break;
    }
    if (text.startsWith("/*", index)) {
      active = "blockComment";
      continue;
    }
    if (active === "doubleQuote") {
      const quoted = quotedEnd(text, index, '"');
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      if (!quoted.closed) {
        break;
      }
      active = "none";
      continue;
    }
    const character = text.at(index);
    if (character === '"') {
      const quoted = quotedEnd(text, index + 1, '"');
      let lookahead = quoted.end;
      while (text.at(lookahead) === " " || text.at(lookahead) === "\t") {
        lookahead += 1;
      }
      append(
        runs,
        text.slice(index, quoted.end),
        quoted.closed && text.at(lookahead) === ":"
          ? "syntaxName"
          : "syntaxString",
      );
      index = quoted.end;
      active = quoted.closed ? "none" : "doubleQuote";
      continue;
    }
    if (isDigit(character) || (character === "-" && isDigit(text.at(index + 1)))) {
      const start = index;
      if (character === "-") {
        index += 1;
      }
      index = scanNumber(text, index);
      append(runs, text.slice(start, index), "syntaxLiteral");
      continue;
    }
    if (isAsciiLetter(character)) {
      const end = scanWhile(text, index + 1, isIdentifierPart);
      const word = text.slice(index, end);
      append(
        runs,
        word,
        word === "true" || word === "false" || word === "null"
          ? "syntaxLiteral"
          : "plain",
      );
      index = end;
      continue;
    }
    const units = codePointUnits(text, index);
    append(runs, text.slice(index, index + units), "plain");
    index += units;
  }
  return Object.freeze({ construct: active, runs });
}

function scanStyle(text: string, construct: SyntaxConstruct): ScanResult {
  const runs: MutableRun[] = [];
  let index = 0;
  let active = construct;
  let declarationName = true;
  while (index < text.length) {
    if (active === "blockComment") {
      const closing = text.indexOf("*/", index);
      const end = closing < 0 ? text.length : closing + 2;
      append(runs, text.slice(index, end), "syntaxComment");
      index = end;
      if (closing < 0) {
        break;
      }
      active = "none";
      continue;
    }
    const continuedQuote = quoteCharacter(active);
    if (continuedQuote !== undefined) {
      const quoted = quotedEnd(text, index, continuedQuote);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      if (!quoted.closed) {
        break;
      }
      active = "none";
      continue;
    }
    if (text.startsWith("/*", index)) {
      active = "blockComment";
      continue;
    }
    const character = text.at(index);
    if (character === "'" || character === '"') {
      const quoted = quotedEnd(text, index + 1, character);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      active = quoted.closed ? "none" : quoteConstruct(character);
      continue;
    }
    if (character === "{" || character === ";") {
      declarationName = true;
      append(runs, character, "plain");
      index += 1;
      continue;
    }
    if (character === ":") {
      declarationName = false;
      append(runs, character, "plain");
      index += 1;
      continue;
    }
    if (character === "@") {
      const end = scanWhile(text, index + 1, (candidate) =>
        isIdentifierPart(candidate) || candidate === "-",
      );
      append(runs, text.slice(index, end), "syntaxKeyword");
      index = end;
      continue;
    }
    if (
      isDigit(character) ||
      character === "#" ||
      (character === "." && isDigit(text.at(index + 1)))
    ) {
      const end = scanWhile(text, index + 1, (candidate) =>
        candidate !== undefined && /[A-Za-z0-9_.%#-]/u.test(candidate),
      );
      append(runs, text.slice(index, end), "syntaxLiteral");
      index = end;
      continue;
    }
    if (isIdentifierStart(character) || character === "-") {
      const end = scanWhile(text, index + 1, (candidate) =>
        isIdentifierPart(candidate) || candidate === "-",
      );
      append(
        runs,
        text.slice(index, end),
        declarationName ? "syntaxName" : "plain",
      );
      index = end;
      continue;
    }
    const units = codePointUnits(text, index);
    append(runs, text.slice(index, index + units), "plain");
    index += units;
  }
  return Object.freeze({ construct: active, runs });
}

function scanShell(
  text: string,
  construct: SyntaxConstruct,
  dialect: ShellDialect,
): ScanResult {
  const runs: MutableRun[] = [];
  let index = 0;
  let active = construct;
  let commandPosition = true;
  const trimmed = text.trimStart();
  if (dialect === "cmd" && trimmed.slice(0, 4).toLowerCase() === "rem ") {
    return Object.freeze({
      construct: "none",
      runs: Object.freeze([{ text, tone: "syntaxComment" as const }]),
    });
  }
  while (index < text.length) {
    if (active === "powerShellComment") {
      const closing = text.indexOf("#>", index);
      const end = closing < 0 ? text.length : closing + 2;
      append(runs, text.slice(index, end), "syntaxComment");
      index = end;
      if (closing < 0) {
        break;
      }
      active = "none";
      continue;
    }
    const continuedQuote = quoteCharacter(active);
    if (continuedQuote !== undefined) {
      const quoted = quotedEnd(text, index, continuedQuote);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      if (!quoted.closed) {
        break;
      }
      active = "none";
      commandPosition = false;
      continue;
    }
    if (dialect === "powershell" && text.startsWith("<#", index)) {
      active = "powerShellComment";
      continue;
    }
    const character = text.at(index);
    const previous = index === 0 ? undefined : text.at(index - 1);
    if (
      character === "#" &&
      (index === 0 || previous === " " || previous === "\t")
    ) {
      append(runs, text.slice(index), "syntaxComment");
      break;
    }
    if (character === "'" || character === '"') {
      const quoted = quotedEnd(text, index + 1, character);
      append(runs, text.slice(index, quoted.end), "syntaxString");
      index = quoted.end;
      active = quoted.closed ? "none" : quoteConstruct(character);
      commandPosition = false;
      continue;
    }
    if (character === "$" || character === "%") {
      let end = index + 1;
      if (text.at(end) === "{") {
        const closing = text.indexOf("}", end + 1);
        end = closing < 0 ? text.length : closing + 1;
      } else {
        end = scanWhile(text, end, (candidate) =>
          isIdentifierPart(candidate) || candidate === ":" || candidate === "%",
        );
      }
      append(runs, text.slice(index, end), "syntaxName");
      index = end;
      commandPosition = false;
      continue;
    }
    if (
      character === "-" &&
      (isAsciiLetter(text.at(index + 1)) ||
        (text.at(index + 1) === "-" && isAsciiLetter(text.at(index + 2))))
    ) {
      const end = scanWhile(text, index + 1, (candidate) =>
        isIdentifierPart(candidate) || candidate === "-",
      );
      append(runs, text.slice(index, end), "syntaxKeyword");
      index = end;
      commandPosition = false;
      continue;
    }
    if (isDigit(character)) {
      const end = scanNumber(text, index);
      append(runs, text.slice(index, end), "syntaxLiteral");
      index = end;
      commandPosition = false;
      continue;
    }
    if (isIdentifierStart(character) || character === "." || character === "/") {
      const end = scanWhile(text, index + 1, (candidate) =>
        candidate !== undefined && !/[\s|;&()]/u.test(candidate),
      );
      const word = text.slice(index, end);
      append(
        runs,
        word,
        SHELL_KEYWORDS.has(word.toLowerCase())
          ? "syntaxKeyword"
          : commandPosition
            ? "syntaxName"
            : "plain",
      );
      index = end;
      commandPosition = false;
      continue;
    }
    if (character === "|" || character === ";" || character === "&") {
      append(runs, character, "plain");
      commandPosition = true;
      index += 1;
      continue;
    }
    const units = codePointUnits(text, index);
    append(runs, text.slice(index, index + units), "plain");
    if (character !== " " && character !== "\t") {
      commandPosition = false;
    }
    index += units;
  }
  return Object.freeze({ construct: active, runs });
}

function asciiEqualAt(text: string, index: number, expected: string): boolean {
  if (index + expected.length > text.length) {
    return false;
  }
  for (let offset = 0; offset < expected.length; offset += 1) {
    const actual = text.at(index + offset);
    const wanted = expected.at(offset);
    if (actual === undefined || wanted === undefined) {
      return false;
    }
    const normalized =
      actual >= "A" && actual <= "Z"
        ? String.fromCharCode(actual.charCodeAt(0) + 32)
        : actual;
    if (normalized !== wanted) {
      return false;
    }
  }
  return true;
}

function findAscii(text: string, expected: string, start: number): number {
  let index = start;
  while (index <= text.length - expected.length) {
    if (asciiEqualAt(text, index, expected)) {
      return index;
    }
    index += codePointUnits(text, index);
  }
  return -1;
}

type EmbeddedResult = Readonly<{
  closing: number;
  construct: SyntaxConstruct;
  nextIndex: number;
  runs: readonly MutableRun[];
}>;

function scanEmbedded(
  text: string,
  start: number,
  active: "script" | "style",
  construct: SyntaxConstruct,
): EmbeddedResult {
  const runs: MutableRun[] = [];
  const closingName = active === "style" ? "</style" : "</script";
  let index = start;
  let activeConstruct = construct;
  while (index < text.length) {
    const closing = findAscii(text, closingName, index);
    const end = closing < 0 ? text.length : closing;
    const scanned =
      active === "style"
        ? scanStyle(text.slice(index, end), activeConstruct)
        : scanScript(text.slice(index, end), activeConstruct);
    for (const candidate of scanned.runs) {
      append(runs, candidate.text, candidate.tone);
    }
    activeConstruct = scanned.construct;
    index = end;
    if (closing < 0) {
      return Object.freeze({
        closing: -1,
        construct: activeConstruct,
        nextIndex: index,
        runs,
      });
    }
    if (scanned.lineComment === true) {
      append(runs, text.slice(index), "syntaxComment");
      return Object.freeze({
        closing: -1,
        construct: activeConstruct,
        nextIndex: text.length,
        runs,
      });
    }
    if (activeConstruct === "none") {
      return Object.freeze({
        closing,
        construct: activeConstruct,
        nextIndex: index,
        runs,
      });
    }
    const markerEnd = closing + closingName.length;
    const marker =
      active === "style"
        ? scanStyle(text.slice(index, markerEnd), activeConstruct)
        : scanScript(text.slice(index, markerEnd), activeConstruct);
    for (const candidate of marker.runs) {
      append(runs, candidate.text, candidate.tone);
    }
    activeConstruct = marker.construct;
    index = markerEnd;
  }
  return Object.freeze({
    closing: -1,
    construct: activeConstruct,
    nextIndex: index,
    runs,
  });
}

type MarkupResult = Readonly<{
  active: SyntaxProfile;
  construct: SyntaxConstruct;
  nextIndex: number;
  runs: readonly MutableRun[];
}>;

function scanMarkup(text: string, start: number, construct: SyntaxConstruct): MarkupResult {
  const runs: MutableRun[] = [];
  let index = start;
  let activeConstruct = construct;
  while (index < text.length) {
    if (activeConstruct === "markupComment") {
      const closing = text.indexOf("-->", index);
      const end = closing < 0 ? text.length : closing + 3;
      append(runs, text.slice(index, end), "syntaxComment");
      index = end;
      if (closing < 0) {
        break;
      }
      activeConstruct = "none";
      continue;
    }
    const opening = text.indexOf("<", index);
    if (opening < 0) {
      append(runs, text.slice(index), "plain");
      index = text.length;
      break;
    }
    append(runs, text.slice(index, opening), "plain");
    index = opening;
    if (text.startsWith("<!--", index)) {
      activeConstruct = "markupComment";
      continue;
    }
    const tagStart = index;
    const closingTag = text.startsWith("</", index);
    append(runs, closingTag ? "</" : "<", "syntaxKeyword");
    index += closingTag ? 2 : 1;
    if (text.at(index) === "!") {
      const end = text.indexOf(">", index + 1);
      const next = end < 0 ? text.length : end + 1;
      append(runs, text.slice(index, next), "syntaxKeyword");
      index = next;
      continue;
    }
    const nameStart = index;
    index = scanWhile(text, index, (candidate) =>
      isIdentifierPart(candidate) || candidate === "-" || candidate === ":",
    );
    if (index === nameStart) {
      index = tagStart + 1;
      continue;
    }
    const tagName = text.slice(nameStart, index).toLowerCase();
    append(runs, text.slice(nameStart, index), "syntaxName");
    let selfClosing = false;
    let closed = false;
    while (index < text.length) {
      const character = text.at(index);
      if (text.startsWith("/>", index)) {
        append(runs, "/>", "syntaxKeyword");
        index += 2;
        selfClosing = true;
        closed = true;
        break;
      }
      if (character === ">") {
        append(runs, ">", "syntaxKeyword");
        index += 1;
        closed = true;
        break;
      }
      if (character === " " || character === "\t") {
        const end = scanWhile(
          text,
          index,
          (candidate) => candidate === " " || candidate === "\t",
        );
        append(runs, text.slice(index, end), "plain");
        index = end;
        continue;
      }
      if (character === "=") {
        append(runs, character, "syntaxKeyword");
        index += 1;
        continue;
      }
      if (character === "'" || character === '"') {
        const quoted = quotedEnd(text, index + 1, character);
        append(runs, text.slice(index, quoted.end), "syntaxString");
        index = quoted.end;
        continue;
      }
      if (isIdentifierStart(character) || character === "-" || character === ":") {
        const end = scanWhile(text, index + 1, (candidate) =>
          isIdentifierPart(candidate) || candidate === "-" || candidate === ":",
        );
        const nextNonspace = scanWhile(
          text,
          end,
          (candidate) => candidate === " " || candidate === "\t",
        );
        append(
          runs,
          text.slice(index, end),
          text.at(nextNonspace) === "=" ? "syntaxName" : "syntaxString",
        );
        index = end;
        continue;
      }
      const units = codePointUnits(text, index);
      append(runs, text.slice(index, index + units), "plain");
      index += units;
    }
    if (!closed) {
      break;
    }
    if (!closingTag && !selfClosing && tagName === "style") {
      return Object.freeze({
        active: "style",
        construct: "none",
        nextIndex: index,
        runs,
      });
    }
    if (!closingTag && !selfClosing && tagName === "script") {
      return Object.freeze({
        active: "script",
        construct: "none",
        nextIndex: index,
        runs,
      });
    }
  }
  return Object.freeze({
    active: "markup",
    construct: activeConstruct,
    nextIndex: index,
    runs,
  });
}

/** Creates the closed initial lexer state for one sanitized fence label. */
export function initialSyntaxState(language: string): SyntaxState {
  const alias = language.toLowerCase();
  const profile = PROFILE_ALIASES.get(alias) ?? "plain";
  const dialect: ShellDialect =
    alias === "powershell" || alias === "ps1"
      ? "powershell"
      : alias === "cmd" || alias === "bat"
        ? "cmd"
        : "generic";
  return syntaxState(profile, profile, "none", dialect);
}

/** Highlights one sanitized line without changing or executing its text. */
export function highlightSyntaxLine(
  text: string,
  state: SyntaxState,
): HighlightedSyntaxLine {
  if (state.base === "plain") {
    return finish(text, [{ text, tone: "plain" }], state);
  }
  if (state.base !== "markup") {
    const scanned =
      state.active === "script"
        ? scanScript(text, state.construct)
        : state.active === "json"
          ? scanJson(text, state.construct)
          : state.active === "style"
            ? scanStyle(text, state.construct)
            : scanShell(text, state.construct, state.shellDialect);
    return finish(
      text,
      scanned.runs,
      syntaxState(state.base, state.active, scanned.construct, state.shellDialect),
    );
  }

  const runs: MutableRun[] = [];
  let index = 0;
  let active = state.active;
  let construct = state.construct;
  while (index < text.length) {
    if (active === "markup") {
      const markup = scanMarkup(text, index, construct);
      for (const candidate of markup.runs) {
        append(runs, candidate.text, candidate.tone);
      }
      index = markup.nextIndex;
      active = markup.active;
      construct = markup.construct;
      continue;
    }
    if (active !== "script" && active !== "style") {
      append(runs, text.slice(index), "plain");
      index = text.length;
      active = "markup";
      construct = "none";
      break;
    }
    const embedded = scanEmbedded(text, index, active, construct);
    for (const candidate of embedded.runs) {
      append(runs, candidate.text, candidate.tone);
    }
    index = embedded.nextIndex;
    construct = embedded.construct;
    if (embedded.closing < 0) {
      break;
    }
    active = "markup";
    construct = "none";
  }
  return finish(
    text,
    runs,
    syntaxState("markup", active, construct, state.shellDialect),
  );
}
