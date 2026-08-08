/** Conservative lexical analysis for owned JavaScript and TypeScript modules. */

export class ModuleScanError extends Error {
  constructor(message, line) {
    super("line " + String(line) + ": " + message);
    this.name = "ModuleScanError";
  }
}

function isIdentifierStart(character) {
  return /[A-Za-z_$]/u.test(character);
}

function isIdentifierPart(character) {
  return /[A-Za-z0-9_$]/u.test(character);
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

    if (isIdentifierStart(character)) {
      const startLine = line;
      let value = "";
      while (index < source.length) {
        const current = source[index];
        if (current === undefined || !isIdentifierPart(current)) {
          break;
        }
        value += advance();
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

function closingBracketIndex(tokens, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.value === "[") {
      depth += 1;
      continue;
    }
    if (token?.value !== "]") {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return undefined;
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
