/** Conservative lexical analysis for owned JavaScript and TypeScript modules. */

const STATIC_STRING_DEPTH_LIMIT = 8;
const STATIC_STRING_FRAGMENT_LIMIT = 32;
const STATIC_STRING_LENGTH_LIMIT = 1_024;
const RUNTIME_ALIAS_EXPRESSION_DEPTH_LIMIT = 32;
const RUNTIME_BINDING_ALIAS_LIMIT = 256;
const RUNTIME_TYPE_ANNOTATION_DEPTH_LIMIT = 32;
const RUNTIME_TYPE_ANNOTATION_TOKEN_LIMIT = 256;

export class ModuleScanError extends Error {
  constructor(message, line) {
    super("line " + String(line) + ": " + message);
    this.name = "ModuleScanError";
  }
}

function isIdentifierStart(character) {
  return (
    character === "$" ||
    character === "_" ||
    /\p{ID_Start}/u.test(character)
  );
}

function isIdentifierPart(character) {
  return (
    character === "$" ||
    character === "_" ||
    character === "\u200C" ||
    character === "\u200D" ||
    /\p{ID_Continue}/u.test(character)
  );
}

function sourceCharacterAt(source, index) {
  const codePoint = source.codePointAt(index);
  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

function canStartRegex(tokens) {
  const previous = tokens[tokens.length - 1];
  if (previous === undefined) {
    return true;
  }
  if (previous.kind === "punctuation") {
    return /[([{=,:;!?&|+\-*%^~<>]/u.test(previous.value);
  }
  return (
    previous.kind === "identifier" &&
    [
      "await",
      "case",
      "delete",
      "in",
      "instanceof",
      "of",
      "return",
      "throw",
      "typeof",
      "void",
      "yield",
    ].includes(previous.value)
  );
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let line = 1;

  function advance() {
    const character = source[index];
    index += 1;
    if (character === "\n") {
      line += 1;
    }
    return character;
  }

  while (index < source.length) {
    const character = source[index];
    if (character === undefined) {
      break;
    }

    if (/\s/u.test(character)) {
      advance();
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && advance() !== "\n") {
        // Skip the comment.
      }
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      const startLine = line;
      advance();
      advance();
      let closed = false;
      while (index < source.length) {
        if (source[index] === "*" && source[index + 1] === "/") {
          advance();
          advance();
          closed = true;
          break;
        }
        advance();
      }
      if (!closed) {
        throw new ModuleScanError("unterminated block comment", startLine);
      }
      continue;
    }

    if (character === "/" && canStartRegex(tokens)) {
      const startLine = line;
      advance();
      let inCharacterClass = false;
      let closed = false;
      while (index < source.length) {
        const current = advance();
        if (current === "\n") {
          throw new ModuleScanError("newline in regular expression", startLine);
        }
        if (current === "\\") {
          if (index >= source.length) {
            break;
          }
          advance();
          continue;
        }
        if (current === "[") {
          inCharacterClass = true;
          continue;
        }
        if (current === "]") {
          inCharacterClass = false;
          continue;
        }
        if (current === "/" && !inCharacterClass) {
          closed = true;
          break;
        }
      }
      if (!closed) {
        throw new ModuleScanError("unterminated regular expression", startLine);
      }
      while (/[A-Za-z]/u.test(source[index] ?? "")) {
        advance();
      }
      tokens.push({ kind: "regex", line: startLine });
      continue;
    }

    if (character === "\"" || character === "'") {
      const quote = character;
      const startLine = line;
      advance();
      let value = "";
      let escaped = false;
      let closed = false;
      while (index < source.length) {
        const current = advance();
        if (current === "\\") {
          escaped = true;
          if (index < source.length) {
            value += current + advance();
          }
          continue;
        }
        if (current === quote) {
          closed = true;
          break;
        }
        if (current === "\n") {
          throw new ModuleScanError("newline in string literal", startLine);
        }
        value += current;
      }
      if (!closed) {
        throw new ModuleScanError("unterminated string literal", startLine);
      }
      tokens.push({ kind: "string", value, escaped, line: startLine });
      continue;
    }

    if (character === "`") {
      const startLine = line;
      advance();
      let value = "";
      let escaped = false;
      let closed = false;
      while (index < source.length) {
        const current = advance();
        if (current === "\\") {
          escaped = true;
          if (index < source.length) {
            value += current + advance();
          }
          continue;
        }
        if (current === "$" && source[index] === "{") {
          throw new ModuleScanError(
            "interpolated templates are forbidden by the owned scanner",
            startLine,
          );
        }
        if (current === "`") {
          closed = true;
          break;
        }
        value += current;
      }
      if (!closed) {
        throw new ModuleScanError("unterminated template literal", startLine);
      }
      tokens.push({ kind: "template", value, escaped, line: startLine });
      continue;
    }

    if (character === "\\" && source[index + 1] === "u") {
      throw new ModuleScanError("escaped identifiers are forbidden", line);
    }

    const identifierStart = sourceCharacterAt(source, index);
    if (identifierStart !== undefined && isIdentifierStart(identifierStart)) {
      const startLine = line;
      let value = "";
      while (index < source.length) {
        const current = sourceCharacterAt(source, index);
        if (current === undefined || !isIdentifierPart(current)) {
          break;
        }
        value += current;
        index += current.length;
      }
      tokens.push({ kind: "identifier", value, line: startLine });
      continue;
    }

    tokens.push({ kind: "punctuation", value: advance(), line });
  }

  return tokens;
}

function requirePlainString(token, contextLine) {
  if (token?.kind !== "string") {
    throw new ModuleScanError("module specifier must be a string literal", contextLine);
  }
  if (token.escaped) {
    throw new ModuleScanError("escaped module specifiers are forbidden", token.line);
  }
  return token;
}

function decodeScannableEscapes(value) {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value.at(index);
    if (character !== "\\") {
      decoded += character;
      continue;
    }
    const escaped = value.at(index + 1);
    if (escaped === undefined || escaped === "\n" || escaped === "\r") {
      return undefined;
    }
    const simple = new Map([
      ["b", "\b"],
      ["f", "\f"],
      ["n", "\n"],
      ["r", "\r"],
      ["t", "\t"],
      ["v", "\v"],
      ["0", "\0"],
      ["'", "'"],
      ['"', '"'],
      ["`", "`"],
      ["\\", "\\"],
    ]);
    const simpleValue = simple.get(escaped);
    if (simpleValue !== undefined) {
      if (escaped === "0" && /[0-9]/u.test(value.at(index + 2) ?? "")) {
        return undefined;
      }
      decoded += simpleValue;
      index += 1;
      continue;
    }
    if (escaped === "x") {
      const digits = value.slice(index + 2, index + 4);
      if (!/^[0-9A-Fa-f]{2}$/u.test(digits)) {
        return undefined;
      }
      decoded += String.fromCodePoint(Number.parseInt(digits, 16));
      index += 3;
      continue;
    }
    if (escaped === "u" && value.at(index + 2) === "{") {
      const closing = value.indexOf("}", index + 3);
      const digits = closing < 0 ? "" : value.slice(index + 3, closing);
      const point = Number.parseInt(digits, 16);
      if (
        closing < 0 ||
        !/^[0-9A-Fa-f]{1,6}$/u.test(digits) ||
        point > 0x10ffff
      ) {
        return undefined;
      }
      decoded += String.fromCodePoint(point);
      index = closing;
      continue;
    }
    if (escaped === "u") {
      const digits = value.slice(index + 2, index + 6);
      if (!/^[0-9A-Fa-f]{4}$/u.test(digits)) {
        return undefined;
      }
      decoded += String.fromCodePoint(Number.parseInt(digits, 16));
      index += 5;
      continue;
    }
    return undefined;
  }
  return decoded;
}

function staticStringLimit(line) {
  throw new ModuleScanError("static string expression exceeds owned bounds", line);
}

function combineStaticStrings(left, right, line) {
  const fragments = left.fragments + right.fragments;
  const value = left.value + right.value;
  if (
    fragments > STATIC_STRING_FRAGMENT_LIMIT ||
    value.length > STATIC_STRING_LENGTH_LIMIT
  ) {
    staticStringLimit(line);
  }
  return {
    composed: true,
    fragments,
    line,
    next: right.next,
    value,
  };
}

function parseStaticStringArrayJoin(tokens, openingIndex, depth) {
  const opening = tokens[openingIndex];
  if (opening?.value !== "[") {
    return undefined;
  }
  const closingIndex = closingBracketIndex(tokens, openingIndex);
  if (
    closingIndex === undefined ||
    tokens[closingIndex + 1]?.value !== "." ||
    tokens[closingIndex + 2]?.kind !== "identifier" ||
    tokens[closingIndex + 2]?.value !== "join" ||
    tokens[closingIndex + 3]?.value !== "("
  ) {
    return undefined;
  }
  const values = [];
  let fragments = 0;
  let cursor = openingIndex + 1;
  if (tokens[cursor]?.value !== "]") {
    while (cursor < tokens.length) {
      const element = parseStaticStringExpression(tokens, cursor, depth + 1);
      if (element === undefined) {
        return undefined;
      }
      values.push(element.value);
      fragments += element.fragments;
      cursor = element.next;
      if (tokens[cursor]?.value === "]") {
        break;
      }
      if (tokens[cursor]?.value !== ",") {
        return undefined;
      }
      cursor += 1;
      if (tokens[cursor]?.value === "]") {
        break;
      }
    }
  }
  if (
    cursor !== closingIndex ||
    values.length > STATIC_STRING_FRAGMENT_LIMIT
  ) {
    staticStringLimit(opening.line);
  }
  cursor = closingIndex + 4;
  let separator = ",";
  if (tokens[cursor]?.value !== ")") {
    const parsedSeparator = parseStaticStringExpression(
      tokens,
      cursor,
      depth + 1,
    );
    if (
      parsedSeparator === undefined ||
      tokens[parsedSeparator.next]?.value !== ")"
    ) {
      return undefined;
    }
    separator = parsedSeparator.value;
    fragments += parsedSeparator.fragments;
    cursor = parsedSeparator.next;
  }
  const value = values.join(separator);
  if (
    fragments > STATIC_STRING_FRAGMENT_LIMIT ||
    value.length > STATIC_STRING_LENGTH_LIMIT
  ) {
    staticStringLimit(opening.line);
  }
  return {
    composed: true,
    fragments,
    line: opening.line,
    next: cursor + 1,
    value,
  };
}

function parseStaticStringPrimary(tokens, index, depth) {
  if (depth > STATIC_STRING_DEPTH_LIMIT) {
    staticStringLimit(tokens[index]?.line ?? 1);
  }
  const token = tokens[index];
  if (isLiteralToken(token)) {
    const value = decodeScannableEscapes(token.value);
    return value === undefined
      ? undefined
      : {
          composed: false,
          fragments: 1,
          line: token.line,
          next: index + 1,
          value,
        };
  }
  if (token?.value === "[") {
    return parseStaticStringArrayJoin(tokens, index, depth);
  }
  if (token?.value !== "(") {
    return undefined;
  }
  const nested = parseStaticStringExpression(tokens, index + 1, depth + 1);
  if (nested === undefined || tokens[nested.next]?.value !== ")") {
    return undefined;
  }
  return {
    ...nested,
    line: token.line,
    next: nested.next + 1,
  };
}

function parseStaticStringExpression(tokens, index, depth) {
  let current = parseStaticStringPrimary(tokens, index, depth);
  if (current === undefined) {
    return undefined;
  }
  while (tokens[current.next]?.value === "+") {
    const right = parseStaticStringPrimary(tokens, current.next + 1, depth);
    if (right === undefined) {
      return undefined;
    }
    current = combineStaticStrings(current, right, current.line);
  }
  return current;
}

/** Returns bounded values reconstructed entirely from static string syntax. */
export function collectStaticStringValues(source) {
  const tokens = tokenize(source);
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const parsed = parseStaticStringExpression(tokens, index, 0);
    if (parsed?.composed !== true) {
      continue;
    }
    values.push(Object.freeze({ line: parsed.line, value: parsed.value }));
    index = parsed.next - 1;
  }
  return Object.freeze(values);
}

function closingDelimiterIndex(tokens, openingIndex, opening, closing) {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    const value = tokens[index]?.value;
    if (value === opening) {
      depth += 1;
      continue;
    }
    if (value !== closing) {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return undefined;
}

function directAssertionTypeEnd(tokens, start, end) {
  let cursor = start;
  if (tokens[cursor]?.value === "const") {
    return cursor + 1 <= end ? cursor + 1 : undefined;
  }
  if (tokens[cursor]?.value === "typeof") {
    cursor += 1;
  }
  if (cursor >= end || tokens[cursor]?.kind !== "identifier") {
    return undefined;
  }
  cursor += 1;
  while (
    cursor + 1 < end &&
    tokens[cursor]?.value === "." &&
    tokens[cursor + 1]?.kind === "identifier"
  ) {
    cursor += 2;
  }
  return cursor;
}

function directAliasSource(
  tokens,
  start,
  end,
  strictAssertions = false,
  depth = 0,
) {
  if (depth > RUNTIME_ALIAS_EXPRESSION_DEPTH_LIMIT) {
    throw new ModuleScanError(
      "runtime alias expression exceeds owned bounds",
      tokens[start]?.line ?? 1,
    );
  }
  const first = tokens[start];
  let source;
  let cursor;
  if (first?.kind === "identifier") {
    source = first;
    cursor = start + 1;
  } else if (first?.value === "(") {
    const closing = closingDelimiterIndex(tokens, start, "(", ")");
    if (closing === undefined || closing >= end) {
      return undefined;
    }
    const nested = directAliasSource(
      tokens,
      start + 1,
      closing,
      strictAssertions,
      depth + 1,
    );
    if (nested === undefined) {
      return undefined;
    }
    source = Object.freeze({ line: first.line, value: nested });
    cursor = closing + 1;
  } else if (isPunctuationToken(tokens, start, "<")) {
    const closing = directAssertionTypeEnd(tokens, start + 1, end);
    if (
      closing === undefined ||
      !isPunctuationToken(tokens, closing, ">")
    ) {
      if (strictAssertions) {
        throw new ModuleScanError(
          "runtime alias assertion is outside owned bounds",
          first.line,
        );
      }
      return undefined;
    }
    const nested = directAliasSource(
      tokens,
      closing + 1,
      end,
      strictAssertions,
      depth + 1,
    );
    if (nested === undefined) {
      return undefined;
    }
    source = Object.freeze({ line: first.line, value: nested });
    cursor = end;
  } else {
    return undefined;
  }
  let asserted = false;
  while (cursor < end) {
    if (tokens[cursor]?.value === "!") {
      cursor += 1;
      continue;
    }
    if (["as", "satisfies"].includes(tokens[cursor]?.value)) {
      asserted = true;
      const next = directAssertionTypeEnd(tokens, cursor + 1, end);
      if (next === undefined) {
        if (strictAssertions) {
          throw new ModuleScanError(
            "runtime alias assertion is outside owned bounds",
            tokens[cursor]?.line ?? source.line,
          );
        }
        return undefined;
      }
      cursor = next;
      continue;
    }
    if (asserted && strictAssertions) {
      throw new ModuleScanError(
        "runtime alias assertion is outside owned bounds",
        tokens[cursor]?.line ?? source.line,
      );
    }
    return undefined;
  }
  return source.value;
}

function isAutomaticSemicolonAliasBoundary(tokens, start, cursor) {
  const current = tokens[cursor];
  const previous = tokens[cursor - 1];
  if (
    current === undefined ||
    previous === undefined ||
    current.line <= previous.line ||
    directAliasSource(tokens, start, cursor) === undefined ||
    ["as", "satisfies"].includes(previous.value)
  ) {
    return false;
  }
  if (current.kind === "identifier") {
    return !["as", "in", "instanceof", "satisfies"].includes(current.value);
  }
  if (current.kind === "string") {
    return true;
  }
  if (current.kind !== "punctuation") {
    return false;
  }
  if (current.value === "{" || /[0-9]/u.test(current.value)) {
    return true;
  }
  if (
    (current.value === "+" || current.value === "-") &&
    tokens[cursor + 1]?.value === current.value
  ) {
    return true;
  }
  return current.value === "." &&
    /[0-9]/u.test(tokens[cursor + 1]?.value ?? "");
}

function runtimeExpressionEnd(tokens, start, commaTerminates) {
  let cursor = start;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  while (cursor < tokens.length) {
    const value = tokens[cursor]?.value;
    if (
      parentheses === 0 &&
      brackets === 0 &&
      braces === 0 &&
      (
        value === ";" ||
        (commaTerminates && value === ",") ||
        isAutomaticSemicolonAliasBoundary(tokens, start, cursor)
      )
    ) {
      break;
    }
    if (value === "(") {
      parentheses += 1;
    } else if (value === ")" && parentheses > 0) {
      parentheses -= 1;
    } else if (value === "[") {
      brackets += 1;
    } else if (value === "]" && brackets > 0) {
      brackets -= 1;
    } else if (value === "{") {
      braces += 1;
    } else if (value === "}" && braces > 0) {
      braces -= 1;
    }
    cursor += 1;
  }
  return cursor;
}

const TYPE_ANNOTATION_STATEMENT_STARTERS = Object.freeze([
  "class",
  "const",
  "declare",
  "enum",
  "export",
  "function",
  "interface",
  "let",
  "namespace",
  "type",
  "var",
]);

function isAutomaticSemicolonTypeBoundary(tokens, start, cursor) {
  const current = tokens[cursor];
  const previous = tokens[cursor - 1];
  return (
    cursor > start &&
    current?.kind === "identifier" &&
    previous !== undefined &&
    current.line > previous.line &&
    TYPE_ANNOTATION_STATEMENT_STARTERS.includes(current.value)
  );
}

function typeAnnotationClosing(value) {
  if (value === "(") {
    return ")";
  }
  if (value === "[") {
    return "]";
  }
  if (value === "{") {
    return "}";
  }
  return value === "<" ? ">" : undefined;
}

function isPunctuationToken(tokens, index, value) {
  const token = tokens[index];
  return token?.kind === "punctuation" && token.value === value;
}

function isArrowPunctuation(tokens, index) {
  return (
    isPunctuationToken(tokens, index, "=") &&
    isPunctuationToken(tokens, index + 1, ">")
  );
}

function isAssignmentPunctuation(tokens, index) {
  return (
    isPunctuationToken(tokens, index, "=") &&
    !isPunctuationToken(tokens, index - 1, "=") &&
    !isPunctuationToken(tokens, index + 1, "=") &&
    !isPunctuationToken(tokens, index + 1, ">")
  );
}

function typeAnnotationEnd(tokens, start) {
  const expectedClosings = [];
  let cursor = start;
  let tokenCount = 0;
  while (cursor < tokens.length) {
    const token = tokens[cursor];
    const value = token?.value;
    const punctuation = token?.kind === "punctuation";
    if (
      expectedClosings.length === 0 &&
      (
        (punctuation && (value === "," || value === ";")) ||
        isAutomaticSemicolonTypeBoundary(tokens, start, cursor)
      )
    ) {
      break;
    }
    if (
      expectedClosings.length === 0 &&
      isAssignmentPunctuation(tokens, cursor)
    ) {
      break;
    }
    if (isArrowPunctuation(tokens, cursor)) {
      tokenCount += 2;
      if (tokenCount > RUNTIME_TYPE_ANNOTATION_TOKEN_LIMIT) {
        throw new ModuleScanError(
          "runtime variable type annotation exceeds owned bounds",
          token?.line ?? 1,
        );
      }
      cursor += 2;
      continue;
    }
    tokenCount += 1;
    if (tokenCount > RUNTIME_TYPE_ANNOTATION_TOKEN_LIMIT) {
      throw new ModuleScanError(
        "runtime variable type annotation exceeds owned bounds",
        token?.line ?? 1,
      );
    }
    const closing = typeAnnotationClosing(punctuation ? value : undefined);
    if (closing !== undefined) {
      expectedClosings.push(closing);
      if (expectedClosings.length > RUNTIME_TYPE_ANNOTATION_DEPTH_LIMIT) {
        throw new ModuleScanError(
          "runtime variable type annotation exceeds owned bounds",
          token?.line ?? 1,
        );
      }
    } else if (
      punctuation &&
      [")", "]", "}", ">"].includes(value)
    ) {
      if (expectedClosings.at(-1) !== value) {
        throw new ModuleScanError(
          "runtime variable type annotation is outside owned bounds",
          token?.line ?? 1,
        );
      }
      expectedClosings.pop();
    }
    cursor += 1;
  }
  if (tokenCount === 0 || expectedClosings.length !== 0) {
    throw new ModuleScanError(
      "runtime variable type annotation is outside owned bounds",
      tokens[start]?.line ?? 1,
    );
  }
  return cursor;
}

function variableDeclarator(tokens, start) {
  let cursor = start + 1;
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  while (cursor < tokens.length) {
    const value = tokens[cursor]?.value;
    if (parentheses === 0 && brackets === 0 && braces === 0) {
      if (isPunctuationToken(tokens, cursor, ":")) {
        cursor = typeAnnotationEnd(tokens, cursor + 1);
        continue;
      }
      if (
        isPunctuationToken(tokens, cursor, ",") ||
        isPunctuationToken(tokens, cursor, ";")
      ) {
        return { alias: undefined, next: cursor };
      }
      if (isAssignmentPunctuation(tokens, cursor)) {
        const initializerStart = cursor + 1;
        const next = runtimeExpressionEnd(tokens, initializerStart, true);
        return {
          alias: directAliasSource(tokens, initializerStart, next, true),
          next,
        };
      }
    }
    if (value === "(") {
      parentheses += 1;
    } else if (value === ")" && parentheses > 0) {
      parentheses -= 1;
    } else if (value === "[") {
      brackets += 1;
    } else if (value === "]" && brackets > 0) {
      brackets -= 1;
    } else if (value === "{") {
      braces += 1;
    } else if (value === "}" && braces > 0) {
      braces -= 1;
    }
    cursor += 1;
  }
  return {
    alias: undefined,
    next: cursor,
  };
}

function collectVariableBindingAliases(tokens) {
  const aliases = new Map();
  const declarations = new Map();
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const value = tokens[index]?.value;
    if (value === ")" && parentheses > 0) {
      parentheses -= 1;
    } else if (value === "]" && brackets > 0) {
      brackets -= 1;
    } else if (value === "}" && braces > 0) {
      braces -= 1;
    }
    if (
      value === "var" &&
      tokens[index - 1]?.value !== "." &&
      (
        tokens[index + 1]?.kind === "identifier" ||
        tokens[index + 1]?.value === "{" ||
        tokens[index + 1]?.value === "["
      ) &&
      (parentheses !== 0 || brackets !== 0 || braces !== 0)
    ) {
      throw new ModuleScanError(
        "delimiter-nested var declarations are outside owned bounds",
        tokens[index].line,
      );
    }
    if (
      parentheses !== 0 ||
      brackets !== 0 ||
      braces !== 0 ||
      !["const", "let", "var"].includes(value) ||
      tokens[index - 1]?.value === "."
    ) {
      if (value === "(") {
        parentheses += 1;
      } else if (value === "[") {
        brackets += 1;
      } else if (value === "{") {
        braces += 1;
      }
      continue;
    }
    if (["{", "["].includes(tokens[index + 1]?.value)) {
      throw new ModuleScanError(
        "module-scope runtime binding patterns are outside owned bounds",
        tokens[index].line,
      );
    }
    const names = [];
    let cursor = index + 1;
    while (cursor < tokens.length) {
      const name = tokens[cursor];
      if (name?.kind !== "identifier") {
        break;
      }
      const declarator = variableDeclarator(tokens, cursor);
      names.push(name.value);
      if (declarator.alias !== undefined) {
        if (!aliases.has(name.value) && aliases.size >= RUNTIME_BINDING_ALIAS_LIMIT) {
          throw new ModuleScanError(
            "runtime binding alias count exceeds owned bounds",
            name.line,
          );
        }
        aliases.set(name.value, declarator.alias);
      }
      if (tokens[declarator.next]?.value !== ",") {
        break;
      }
      cursor = declarator.next + 1;
    }
    declarations.set(index, Object.freeze(names));
  }
  return { aliases, declarations };
}

function resolveDirectBindingAlias(aliases, local, line) {
  const visited = new Set();
  let current = local;
  while (aliases.has(current)) {
    if (visited.has(current) || visited.size >= RUNTIME_BINDING_ALIAS_LIMIT) {
      throw new ModuleScanError("runtime binding alias cycle", line);
    }
    visited.add(current);
    current = aliases.get(current);
  }
  return current;
}

/** Returns runtime bindings named or directly aliased by runtime exports. */
export function collectRuntimeExportBindings(source) {
  const tokens = tokenize(source);
  const { aliases, declarations } = collectVariableBindingAliases(tokens);
  const bindings = [];
  function appendBinding(exported, line, local) {
    bindings.push(Object.freeze({
      exported,
      line,
      local: resolveDirectBindingAlias(aliases, local, line),
    }));
  }
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.value !== "export") {
      continue;
    }
    let cursor = index + 1;
    if (
      tokens[cursor]?.value === "type" ||
      tokens[cursor]?.value === "interface"
    ) {
      continue;
    }
    if (tokens[cursor]?.value === "default") {
      const expressionStart = cursor + 1;
      const expressionEnd = runtimeExpressionEnd(
        tokens,
        expressionStart,
        false,
      );
      const local = directAliasSource(
        tokens,
        expressionStart,
        expressionEnd,
        true,
      );
      if (
        local !== undefined &&
        !["async", "class", "function"].includes(local)
      ) {
        appendBinding("default", tokens[index].line, local);
      }
      index = Math.max(index, expressionEnd - 1);
      continue;
    }
    if (["const", "let", "var"].includes(tokens[cursor]?.value)) {
      for (const declared of declarations.get(cursor) ?? []) {
        appendBinding(declared, tokens[index].line, declared);
      }
      continue;
    }
    if (tokens[cursor]?.value !== "{") {
      continue;
    }
    cursor += 1;
    while (cursor < tokens.length && tokens[cursor]?.value !== "}") {
      if (tokens[cursor]?.value === ",") {
        cursor += 1;
        continue;
      }
      const typeOnly =
        tokens[cursor]?.value === "type" &&
        tokens[cursor + 1]?.kind === "identifier" &&
        tokens[cursor + 1]?.value !== "as";
      if (typeOnly) {
        cursor += 1;
      }
      const local = tokens[cursor];
      if (local?.kind !== "identifier") {
        break;
      }
      cursor += 1;
      let exported = local.value;
      if (tokens[cursor]?.value === "as") {
        const alias = tokens[cursor + 1];
        if (alias?.kind !== "identifier" && alias?.kind !== "string") {
          break;
        }
        exported = alias.value;
        cursor += 2;
      }
      if (!typeOnly) {
        appendBinding(exported, tokens[index].line, local.value);
      }
    }
  }
  return Object.freeze(bindings);
}

function closingBracketIndex(tokens, openingIndex) {
  return closingDelimiterIndex(tokens, openingIndex, "[", "]");
}

function isLiteralToken(token) {
  return token?.kind === "string" || token?.kind === "template";
}

function staticComputedName(tokens, openingIndex, closingIndex) {
  const first = tokens[openingIndex + 1];
  if (!isLiteralToken(first)) {
    return undefined;
  }
  let value = decodeScannableEscapes(first.value);
  if (value === undefined) {
    return undefined;
  }
  let cursor = openingIndex + 1;
  while (
    tokens[cursor + 1]?.value === "+" &&
    isLiteralToken(tokens[cursor + 2])
  ) {
    const part = decodeScannableEscapes(tokens[cursor + 2].value);
    if (part === undefined) {
      return undefined;
    }
    value += part;
    cursor += 2;
  }
  return cursor === closingIndex - 1 ? value : undefined;
}

function hasComputedReceiver(tokens, openingIndex) {
  let receiverIndex = openingIndex - 1;
  if (
    tokens[receiverIndex]?.value === "." &&
    tokens[receiverIndex - 1]?.value === "?"
  ) {
    receiverIndex -= 2;
  }
  while (tokens[receiverIndex]?.value === "!") {
    receiverIndex -= 1;
  }
  const receiver = tokens[receiverIndex];
  return (
    receiver?.kind === "identifier" ||
    receiver?.kind === "string" ||
    receiver?.kind === "template" ||
    receiver?.kind === "regex" ||
    receiver?.value === ")" ||
    receiver?.value === "]" ||
    receiver?.value === "}" ||
    receiver?.value === ">"
  );
}

/** Returns static module specifiers and dangerous runtime constructs. */
export function analyzeModule(source, options = {}) {
  const tokens = tokenize(source);
  const imports = [];
  const forbidden = [];
  const dangerousNames = [
    "require",
    "eval",
    "Function",
    "Reflect",
    "createRequire",
    "getBuiltinModule",
    "getOwnPropertyDescriptor",
    "getOwnPropertyDescriptors",
    "getOwnPropertyNames",
    "getPrototypeOf",
    "globalThis",
    "__proto__",
  ];
  const reflectivePropertyNames = [["con", "structor"].join("")];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.value === "[") {
      const closingIndex = closingBracketIndex(tokens, index);
      if (
        closingIndex !== undefined &&
        (tokens[index - 1]?.value === "{" || tokens[index - 1]?.value === ",") &&
        tokens[closingIndex + 1]?.value === ":"
      ) {
        forbidden.push({ name: "computedBinding", line: token.line });
      } else if (
        options.failClosedComputedMembers === true &&
        closingIndex !== undefined &&
        closingIndex > index + 1 &&
        hasComputedReceiver(tokens, index) &&
        staticComputedName(tokens, index, closingIndex) === undefined
      ) {
        forbidden.push({ name: "computedMember", line: token.line });
      }
    }
    if (isLiteralToken(token)) {
      let combined = decodeScannableEscapes(token.value);
      if (combined === undefined) {
        if (options.failClosedComputedMembers === true) {
          forbidden.push({ name: "literalEscape", line: token.line });
        }
        continue;
      }
      let cursor = index;
      while (
        tokens[cursor + 1]?.value === "+" &&
        isLiteralToken(tokens[cursor + 2])
      ) {
        const part = decodeScannableEscapes(tokens[cursor + 2].value);
        if (part === undefined) {
          if (options.failClosedComputedMembers === true) {
            forbidden.push({ name: "literalEscape", line: token.line });
          }
          combined = undefined;
          break;
        }
        combined += part;
        cursor += 2;
      }
      if (combined === undefined) {
        continue;
      }
      if ((cursor > index || token.escaped) && dangerousNames.includes(combined)) {
        forbidden.push({ name: combined, line: token.line });
      }
      if (reflectivePropertyNames.includes(combined)) {
        forbidden.push({ name: combined, line: token.line });
      }
    }
    const computedReceiver = tokens[index - 2];
    if (
      isLiteralToken(token) &&
      dangerousNames.includes(decodeScannableEscapes(token.value)) &&
      tokens[index - 1]?.value === "[" &&
      tokens[index + 1]?.value === "]" &&
      (computedReceiver?.kind === "identifier" ||
        computedReceiver?.value === ")" ||
        computedReceiver?.value === "]")
    ) {
      forbidden.push({
        name: decodeScannableEscapes(token.value),
        line: token.line,
      });
    }

    if (token?.kind !== "identifier") {
      continue;
    }

    if (dangerousNames.includes(token.value)) {
      forbidden.push({ name: token.value, line: token.line });
    }
    if (
      reflectivePropertyNames.includes(token.value) &&
      (tokens[index - 1]?.value === "." ||
        tokens[index + 1]?.value === ":" ||
        ((tokens[index - 1]?.value === "{" ||
          tokens[index - 1]?.value === ",") &&
          (tokens[index + 1]?.value === "}" ||
            tokens[index + 1]?.value === "," ||
            tokens[index + 1]?.value === "=")))
    ) {
      forbidden.push({ name: token.value, line: token.line });
    }

    if (token.value === "import") {
      const next = tokens[index + 1];
      if (next?.value === ".") {
        continue;
      }
      if (next?.value === "(") {
        throw new ModuleScanError("dynamic import is forbidden", token.line);
      }
      if (next?.kind === "string") {
        const specifier = requirePlainString(next, token.line);
        imports.push({ specifier: specifier.value, line: specifier.line });
        continue;
      }
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (candidate?.value === ";") {
          break;
        }
        if (candidate?.kind === "identifier" && candidate.value === "from") {
          const specifier = requirePlainString(tokens[cursor + 1], token.line);
          imports.push({ specifier: specifier.value, line: specifier.line });
          break;
        }
      }
      continue;
    }

    if (token.value === "export") {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const candidate = tokens[cursor];
        if (candidate?.value === ";") {
          break;
        }
        if (candidate?.kind === "identifier" && candidate.value === "from") {
          const specifier = requirePlainString(tokens[cursor + 1], token.line);
          imports.push({ specifier: specifier.value, line: specifier.line });
          break;
        }
      }
    }
  }

  return Object.freeze({
    imports: Object.freeze(imports),
    forbidden: Object.freeze(forbidden),
  });
}
