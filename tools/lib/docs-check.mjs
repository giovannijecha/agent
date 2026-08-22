import { createHash } from "node:crypto";
import path from "node:path";

const CANONICAL_LICENSE_DIGEST =
  "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";
const CANONICAL_GIT_ATTRIBUTES = "* text=auto eol=lf\n";

export const DOCUMENT_PATHS = Object.freeze([
  "AGENTS.md",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "assets/brand/README.md",
  "docs/ARCHITECTURE.md",
  "docs/ENGINEERING.md",
  "docs/manual/01-running-agent.md",
  "docs/manual/02-turn-lifecycle.md",
  "docs/manual/03-terminal-interface.md",
  "docs/manual/04-tools-and-approval.md",
  "docs/manual/05-providers-and-authentication.md",
  "docs/manual/06-verification-and-diagnostics.md",
  "docs/manual/README.md",
  "evaluations/README.md",
]);

const FORBIDDEN_AUTHORSHIP_PATTERNS = Object.freeze([
  /^co-authored-by:\s*(?:codex|openai)\b/imu,
  /^generated[- ]by\b/imu,
  /^written[- ]by\s+(?:codex|openai)\b/imu,
  /^(?:ai|machine)[- ]generated\b/imu,
  /\b100% (?:human(?:-written)?|hand[- ]written)\b/iu,
  /\bentirely human(?:-written)?\b/iu,
  /\bmade without (?:ai|tools?)\b/iu,
  /\bno (?:ai|tools?) (?:(?:was|were) )?used\b/iu,
]);

function fail(message) {
  throw new Error(message);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function isAuthorityDocument(file) {
  return (
    /^[A-Z][A-Z-]*\.md$/u.test(file) ||
    file === "assets/brand/README.md" ||
    /^docs\/.+\.md$/u.test(file) ||
    file === "evaluations/README.md"
  );
}

function namedCharacterReference(name) {
  switch (name) {
    case "AMP":
    case "amp":
      return "&";
    case "apos":
      return "'";
    case "ast":
      return "*";
    case "bsol":
      return "\\";
    case "colon":
      return ":";
    case "comma":
      return ",";
    case "commat":
      return "@";
    case "dollar":
      return "$";
    case "equals":
      return "=";
    case "excl":
      return "!";
    case "GT":
    case "gt":
      return ">";
    case "Hat":
      return "^";
    case "lbrace":
    case "lcub":
      return "{";
    case "lbrack":
    case "lsqb":
      return "[";
    case "lpar":
      return "(";
    case "LT":
    case "lt":
      return "<";
    case "lowbar":
      return "_";
    case "NewLine":
      return "\n";
    case "num":
      return "#";
    case "percnt":
      return "%";
    case "period":
      return ".";
    case "plus":
      return "+";
    case "quest":
      return "?";
    case "QUOT":
    case "quot":
      return '"';
    case "rbrace":
    case "rcub":
      return "}";
    case "rbrack":
    case "rsqb":
      return "]";
    case "rpar":
      return ")";
    case "semi":
      return ";";
    case "sol":
      return "/";
    case "Tab":
      return "\t";
    case "VerticalLine":
    case "verbar":
    case "vert":
      return "|";
    default:
      return undefined;
  }
}

function decodeCharacterReferences(text) {
  return text.replaceAll(
    /&(?:#([0-9]{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/gu,
    (reference, decimal, hexadecimal, name) => {
      if (name !== undefined) {
        return namedCharacterReference(name) ?? reference;
      }
      const value = Number.parseInt(decimal ?? hexadecimal, decimal === undefined ? 16 : 10);
      return value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)
        ? "\uFFFD"
        : String.fromCodePoint(value);
    },
  );
}

function normalizeTarget(source, rawTarget) {
  const renderedTarget = decodeCharacterReferences(
    rawTarget.replaceAll(
      /\\([!"#$%&'()*+,\-./:;<=>?@\[\\\]^_`{|}~])/gu,
      "$1",
    ),
  );
  const separator = renderedTarget.indexOf("#");
  const beforeFragment = separator === -1
    ? renderedTarget
    : renderedTarget.slice(0, separator);
  const withoutQuery = beforeFragment.split("?", 1)[0];
  if (/^https:\/\//iu.test(withoutQuery)) {
    return undefined;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(withoutQuery)) {
    fail("forbidden link target in " + source);
  }
  let decodedPath;
  let fragment;
  try {
    decodedPath = decodeURIComponent(withoutQuery);
    fragment = separator === -1
      ? undefined
      : decodeURIComponent(renderedTarget.slice(separator + 1));
  } catch {
    fail("invalid local link in " + source);
  }
  const portableTarget = decodedPath.replaceAll("\\", "/");
  if (path.posix.isAbsolute(portableTarget)) {
    fail("forbidden link target in " + source);
  }
  const normalized = portableTarget.length === 0
    ? source
    : path.posix.normalize(
      path.posix.join(path.posix.dirname(source), portableTarget),
    );
  if (normalized === ".." || normalized.startsWith("../")) {
    fail("local link escaped the repository in " + source);
  }
  return Object.freeze({ fragment, path: normalized });
}

function headingSlug(text) {
  return decodeCharacterReferences(text)
    .toLowerCase()
    .replaceAll(/<[^>]*>/gu, "")
    .replaceAll(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim()
    .replaceAll(/\s/gu, "-");
}

function maskedLiteral(text) {
  return text.replaceAll(/[^\r\n]/gu, " ");
}

function indentationAt(line, start, startColumn) {
  let column = startColumn;
  let index = start;
  while (index < line.length) {
    const character = line.at(index);
    if (character === " ") {
      column += 1;
    } else if (character === "\t") {
      column += 4 - (column % 4);
    } else {
      break;
    }
    index += 1;
  }
  return Object.freeze({ column, index });
}

function blockQuoteContentAt(
  line,
  startIndex,
  startColumn,
  maximumDepth = Number.POSITIVE_INFINITY,
) {
  let contentColumn = startColumn;
  let contentIndex = startIndex;
  let depth = 0;
  let indentation = indentationAt(line, contentIndex, contentColumn);
  while (depth < maximumDepth) {
    const relativeIndent = indentation.column - contentColumn;
    if (
      relativeIndent < 0 ||
      relativeIndent > 3 ||
      line.at(indentation.index) !== ">"
    ) {
      break;
    }
    contentIndex = indentation.index + 1;
    contentColumn = indentation.column + 1;
    const separator = line.at(contentIndex);
    if (separator === " ") {
      contentIndex += 1;
      contentColumn += 1;
    } else if (separator === "\t") {
      contentIndex += 1;
      contentColumn += 4 - (contentColumn % 4);
    }
    depth += 1;
    indentation = indentationAt(line, contentIndex, contentColumn);
  }
  return Object.freeze({ contentColumn, depth, indentation });
}

function blockQuoteContent(line, maximumDepth = Number.POSITIVE_INFINITY) {
  return blockQuoteContentAt(line, 0, 0, maximumDepth);
}

function listMarkerAt(line, baseColumn, indentation) {
  const relativeIndent = indentation.column - baseColumn;
  if (relativeIndent < 0 || relativeIndent > 3) {
    return undefined;
  }
  const marker = line
    .slice(indentation.index)
    .match(/^(?:[-+*]|[0-9]{1,9}[.)])(?=$|[ \t\r])/u)
    ?.at(0);
  if (marker === undefined) {
    return undefined;
  }
  const markerEndIndex = indentation.index + marker.length;
  const markerEndColumn = indentation.column + marker.length;
  const content = indentationAt(line, markerEndIndex, markerEndColumn);
  const padding = content.column - markerEndColumn;
  const hasContent = !/^[ \t]*\r?$/u.test(line.slice(markerEndIndex));
  const contentColumn = hasContent && padding >= 1 && padding <= 4
    ? content.column
    : markerEndColumn + 1;
  return Object.freeze({
    contentColumn,
    contentIndentation: content,
    hasContent,
  });
}

function fenceOpeningAt(line, baseColumn, indentation) {
  const relativeIndent = indentation.column - baseColumn;
  if (relativeIndent < 0 || relativeIndent > 3) {
    return undefined;
  }
  const match = line
    .slice(indentation.index)
    .match(/^(`{3,}|~{3,})([^\r]*)\r?$/u);
  const marker = match?.at(1);
  if (
    marker === undefined ||
    (marker.at(0) === "`" && match.at(2).includes("`"))
  ) {
    return undefined;
  }
  return Object.freeze({
    length: marker.length,
    marker: marker.at(0),
  });
}

function closesFence(line, fence, baseColumn, indentation) {
  const relativeIndent = indentation.column - baseColumn;
  if (relativeIndent < 0 || relativeIndent > 3) {
    return false;
  }
  const closing = line
    .slice(indentation.index)
    .match(/^(`{3,}|~{3,})[ \t]*\r?$/u)
    ?.at(1);
  return (
    closing !== undefined &&
    closing.at(0) === fence.marker &&
    closing.length >= fence.length
  );
}

function renderedMarkdown(text) {
  const rendered = [];
  const listContainers = [];
  let fence;
  for (const line of text.split("\n")) {
    if (fence !== undefined) {
      const quoted = blockQuoteContent(line, fence.quoteDepth);
      const fenceBase = fence.contentColumn;
      const blank = /^[ \t]*\r?$/u.test(line.slice(quoted.indentation.index));
      if (
        quoted.depth === fence.quoteDepth &&
        (
          fence.contentColumn === 0 ||
          blank ||
          quoted.indentation.column >= fenceBase
        )
      ) {
        if (closesFence(line, fence, fenceBase, quoted.indentation)) {
          fence = undefined;
        }
        rendered.push(maskedLiteral(line));
        continue;
      }
      fence = undefined;
    }

    const quoted = blockQuoteContent(line);
    const indentation = quoted.indentation;
    let quoteDepth = quoted.depth;
    const blank = /^[ \t]*\r?$/u.test(line.slice(indentation.index));
    while (
      listContainers.length > 0 &&
      listContainers.at(-1).quoteDepth !== quoted.depth
    ) {
      listContainers.pop();
    }
    while (
      !blank &&
      listContainers.length > 0 &&
      indentation.column < listContainers.at(-1).contentColumn
    ) {
      listContainers.pop();
    }
    let contentBase = listContainers.at(-1)?.contentColumn ??
      quoted.contentColumn;
    let contentIndentation = indentation;
    let emptyListMarker = false;
    while (true) {
      const listMarker = listMarkerAt(
        line,
        contentBase,
        contentIndentation,
      );
      if (listMarker !== undefined) {
        listContainers.push(Object.freeze({
          contentColumn: listMarker.contentColumn,
          quoteDepth,
        }));
        contentBase = listMarker.contentColumn;
        contentIndentation = listMarker.contentIndentation;
        if (!listMarker.hasContent) {
          emptyListMarker = true;
          break;
        }
        continue;
      }
      const nestedQuote = blockQuoteContentAt(
        line,
        contentIndentation.index,
        contentBase,
      );
      if (nestedQuote.depth === 0) {
        break;
      }
      quoteDepth += nestedQuote.depth;
      contentBase = nestedQuote.contentColumn;
      contentIndentation = nestedQuote.indentation;
    }
    if (emptyListMarker) {
      rendered.push(line);
      continue;
    }

    const opening = fenceOpeningAt(line, contentBase, contentIndentation);
    if (opening !== undefined) {
      fence = Object.freeze({
        contentColumn: contentBase,
        length: opening.length,
        marker: opening.marker,
        quoteDepth,
      });
      rendered.push(maskedLiteral(line));
      continue;
    }
    rendered.push(
      contentIndentation.column - contentBase >= 4
        ? maskedLiteral(line)
        : line,
    );
  }
  return rendered
    .join("\n")
    .replaceAll(/<!--[\s\S]*?(?:-->|$)/gu, maskedLiteral);
}

function containerProjectedMarkdown(text) {
  const projected = [];
  const listContainers = [];
  for (const line of text.split("\n")) {
    const quoted = blockQuoteContent(line);
    let quoteDepth = quoted.depth;
    const blank = /^[ \t]*\r?$/u.test(line.slice(quoted.indentation.index));
    while (
      listContainers.length > 0 &&
      listContainers.at(-1).quoteDepth !== quoted.depth
    ) {
      listContainers.pop();
    }
    while (
      !blank &&
      listContainers.length > 0 &&
      quoted.indentation.column < listContainers.at(-1).contentColumn
    ) {
      listContainers.pop();
    }

    let contentBase = listContainers.at(-1)?.contentColumn ??
      quoted.contentColumn;
    let contentIndentation = quoted.indentation;
    while (!blank) {
      const listMarker = listMarkerAt(
        line,
        contentBase,
        contentIndentation,
      );
      if (listMarker !== undefined) {
        listContainers.push(Object.freeze({
          contentColumn: listMarker.contentColumn,
          quoteDepth,
        }));
        contentBase = listMarker.contentColumn;
        contentIndentation = listMarker.contentIndentation;
        if (!listMarker.hasContent) {
          break;
        }
        continue;
      }
      const nestedQuote = blockQuoteContentAt(
        line,
        contentIndentation.index,
        contentBase,
      );
      if (nestedQuote.depth === 0) {
        break;
      }
      quoteDepth += nestedQuote.depth;
      contentBase = nestedQuote.contentColumn;
      contentIndentation = nestedQuote.indentation;
    }
    projected.push(
      blank ? "" : line.slice(contentIndentation.index),
    );
  }
  return projected.join("\n");
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; text.at(cursor) === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function markerRunLength(text, index, marker) {
  let length = 0;
  while (text.at(index + length) === marker) {
    length += 1;
  }
  return length;
}

function withoutCodeSpans(text) {
  const rendered = [];
  let retainedFrom = 0;
  let cursor = 0;
  while (cursor < text.length) {
    const opening = text.indexOf("`", cursor);
    if (opening === -1) {
      break;
    }
    const openingLength = markerRunLength(text, opening, "`");
    if (isEscaped(text, opening)) {
      cursor = opening + openingLength;
      continue;
    }
    let searchFrom = opening + openingLength;
    let closingEnd;
    while (searchFrom < text.length) {
      const closing = text.indexOf("`", searchFrom);
      if (closing === -1) {
        break;
      }
      const closingLength = markerRunLength(text, closing, "`");
      if (
        !isEscaped(text, closing) &&
        closingLength === openingLength
      ) {
        closingEnd = closing + closingLength;
        break;
      }
      searchFrom = closing + closingLength;
    }
    if (closingEnd === undefined) {
      cursor = opening + openingLength;
      continue;
    }
    rendered.push(text.slice(retainedFrom, opening));
    rendered.push(maskedLiteral(text.slice(opening, closingEnd)));
    retainedFrom = closingEnd;
    cursor = closingEnd;
  }
  rendered.push(text.slice(retainedFrom));
  return rendered.join("");
}

function closingLabelIndex(markdown, opening) {
  let depth = 1;
  for (let cursor = opening + 1; cursor < markdown.length; cursor += 1) {
    if (isEscaped(markdown, cursor)) {
      continue;
    }
    const character = markdown.at(cursor);
    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return undefined;
}

function whitespaceEnd(markdown, start) {
  let cursor = start;
  while (/\s/u.test(markdown.at(cursor) ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function horizontalWhitespaceEnd(markdown, start) {
  let cursor = start;
  while (/[ \t]/u.test(markdown.at(cursor) ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function titleEnd(markdown, opening) {
  const marker = markdown.at(opening);
  const closingMarker = marker === "(" ? ")" : marker;
  let depth = 1;
  for (let cursor = opening + 1; cursor < markdown.length; cursor += 1) {
    if (isEscaped(markdown, cursor)) {
      continue;
    }
    const character = markdown.at(cursor);
    if (marker === "(" && character === "(") {
      depth += 1;
    } else if (character === closingMarker) {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }
  return undefined;
}

function inlineTarget(markdown, opening) {
  let cursor = whitespaceEnd(markdown, opening + 1);
  const destinationStart = cursor;
  let target;
  if (markdown.at(cursor) === "<") {
    cursor += 1;
    const targetStart = cursor;
    while (
      cursor < markdown.length &&
      (markdown.at(cursor) !== ">" || isEscaped(markdown, cursor)) &&
      !/[\r\n]/u.test(markdown.at(cursor) ?? "")
    ) {
      cursor += 1;
    }
    if (markdown.at(cursor) !== ">") {
      return undefined;
    }
    target = markdown.slice(targetStart, cursor);
    cursor += 1;
  } else {
    let depth = 0;
    while (cursor < markdown.length) {
      const character = markdown.at(cursor);
      if (isEscaped(markdown, cursor)) {
        cursor += 1;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        if (depth === 0) {
          break;
        }
        depth -= 1;
      } else if (/\s/u.test(character ?? "")) {
        break;
      }
      cursor += 1;
    }
    if (depth !== 0) {
      return undefined;
    }
    target = markdown.slice(destinationStart, cursor);
  }

  const afterDestination = cursor;
  cursor = whitespaceEnd(markdown, cursor);
  if (markdown.at(cursor) === ")") {
    return Object.freeze({ end: cursor + 1, target });
  }
  if (cursor === afterDestination) {
    return undefined;
  }
  const titleMarker = markdown.at(cursor);
  if (titleMarker !== '"' && titleMarker !== "'" && titleMarker !== "(") {
    return undefined;
  }
  const afterTitle = titleEnd(markdown, cursor);
  if (afterTitle === undefined) {
    return undefined;
  }
  cursor = whitespaceEnd(markdown, afterTitle);
  return markdown.at(cursor) === ")"
    ? Object.freeze({ end: cursor + 1, target })
    : undefined;
}

function inlineTargets(markdown) {
  const targets = [];
  for (let cursor = 0; cursor < markdown.length; cursor += 1) {
    if (markdown.at(cursor) !== "[" || isEscaped(markdown, cursor)) {
      continue;
    }
    const closing = closingLabelIndex(markdown, cursor);
    if (closing === undefined || markdown.at(closing + 1) !== "(") {
      continue;
    }
    const parsed = inlineTarget(markdown, closing + 1);
    if (parsed !== undefined) {
      targets.push(parsed.target);
    }
  }
  return targets;
}

function normalizedReferenceLabel(label) {
  return label
    .replaceAll(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/gu, "$1")
    .trim()
    .replaceAll(/\s+/gu, " ")
    .toLowerCase();
}

function headingInlineText(markdown, referenceLabels) {
  const rendered = [];
  let retainedFrom = 0;
  let cursor = 0;
  while (cursor < markdown.length) {
    if (markdown.at(cursor) === "`" && !isEscaped(markdown, cursor)) {
      const openingLength = markerRunLength(markdown, cursor, "`");
      let searchFrom = cursor + openingLength;
      while (searchFrom < markdown.length) {
        const closing = markdown.indexOf("`", searchFrom);
        if (closing === -1) {
          searchFrom = markdown.length;
          break;
        }
        const closingLength = markerRunLength(markdown, closing, "`");
        if (!isEscaped(markdown, closing) && closingLength === openingLength) {
          cursor = closing + closingLength;
          break;
        }
        searchFrom = closing + closingLength;
      }
      if (searchFrom === markdown.length) {
        cursor += openingLength;
      }
      continue;
    }
    if (markdown.at(cursor) !== "[" || isEscaped(markdown, cursor)) {
      cursor += 1;
      continue;
    }
    const closing = closingLabelIndex(markdown, cursor);
    if (closing === undefined) {
      cursor += 1;
      continue;
    }
    let renderedEnd;
    if (markdown.at(closing + 1) === "(") {
      renderedEnd = inlineTarget(markdown, closing + 1)?.end;
    } else if (markdown.at(closing + 1) === "[") {
      const referenceClosing = closingLabelIndex(markdown, closing + 1);
      if (referenceClosing !== undefined) {
        const reference = markdown.slice(closing + 2, referenceClosing);
        const label = markdown.slice(cursor + 1, closing);
        const normalized = normalizedReferenceLabel(
          reference.length === 0 ? label : reference,
        );
        if (referenceLabels.has(normalized)) {
          renderedEnd = referenceClosing + 1;
        }
      }
    } else if (
      referenceLabels.has(
        normalizedReferenceLabel(markdown.slice(cursor + 1, closing)),
      )
    ) {
      renderedEnd = closing + 1;
    }
    if (renderedEnd === undefined) {
      cursor += 1;
      continue;
    }
    rendered.push(markdown.slice(retainedFrom, cursor));
    rendered.push(
      headingInlineText(
        markdown.slice(cursor + 1, closing),
        referenceLabels,
      ),
    );
    retainedFrom = renderedEnd;
    cursor = renderedEnd;
  }
  rendered.push(markdown.slice(retainedFrom));
  return rendered.join("");
}

function referenceDefinition(line, continuation) {
  const indentation = indentationAt(line, 0, 0);
  if (
    indentation.column > 3 ||
    line.at(indentation.index) !== "["
  ) {
    return undefined;
  }
  const closingLabel = closingLabelIndex(line, indentation.index);
  if (closingLabel === undefined || line.at(closingLabel + 1) !== ":") {
    return undefined;
  }
  const label = normalizedReferenceLabel(
    line.slice(indentation.index + 1, closingLabel),
  );
  if (label.length === 0) {
    return undefined;
  }

  let destinationLine = line;
  let cursor = horizontalWhitespaceEnd(line, closingLabel + 2);
  if (cursor === line.length) {
    if (continuation === undefined) {
      return undefined;
    }
    const continuationIndentation = indentationAt(continuation, 0, 0);
    if (continuationIndentation.column > 3) {
      return undefined;
    }
    destinationLine = continuation;
    cursor = continuationIndentation.index;
  }
  const destinationStart = cursor;
  let target;
  if (destinationLine.at(cursor) === "<") {
    cursor += 1;
    const targetStart = cursor;
    while (
      cursor < destinationLine.length &&
      (destinationLine.at(cursor) !== ">" ||
        isEscaped(destinationLine, cursor))
    ) {
      cursor += 1;
    }
    if (destinationLine.at(cursor) !== ">") {
      return undefined;
    }
    target = destinationLine.slice(targetStart, cursor);
    cursor += 1;
  } else {
    let depth = 0;
    while (cursor < destinationLine.length) {
      const character = destinationLine.at(cursor);
      if (isEscaped(destinationLine, cursor)) {
        cursor += 1;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        if (depth === 0) {
          return undefined;
        }
        depth -= 1;
      } else if (/\s/u.test(character ?? "")) {
        break;
      }
      cursor += 1;
    }
    if (depth !== 0) {
      return undefined;
    }
    target = destinationLine.slice(destinationStart, cursor);
  }
  if (target.length === 0) {
    return undefined;
  }

  const afterDestination = cursor;
  cursor = horizontalWhitespaceEnd(destinationLine, cursor);
  if (cursor === destinationLine.length) {
    return Object.freeze({ label, target });
  }
  if (cursor === afterDestination) {
    return undefined;
  }
  const titleMarker = destinationLine.at(cursor);
  if (titleMarker !== '"' && titleMarker !== "'" && titleMarker !== "(") {
    return undefined;
  }
  const afterTitle = titleEnd(destinationLine, cursor);
  if (afterTitle === undefined) {
    return undefined;
  }
  cursor = horizontalWhitespaceEnd(destinationLine, afterTitle);
  return cursor === destinationLine.length
    ? Object.freeze({ label, target })
    : undefined;
}

function referenceDefinitions(markdown) {
  const definitions = [];
  const lines = containerProjectedMarkdown(markdown)
    .split("\n")
    .map((line) => line.replace(/\r$/u, ""));
  for (let index = 0; index < lines.length; index += 1) {
    const definition = referenceDefinition(
      lines.at(index),
      lines.at(index + 1),
    );
    if (definition !== undefined) {
      definitions.push(definition);
    }
  }
  return definitions;
}

function referenceTargets(markdown) {
  return referenceDefinitions(markdown).map((definition) => definition.target);
}

function isHtmlWhitespace(character) {
  return /[\t\n\f\r ]/u.test(character ?? "");
}

function htmlTags(markdown) {
  const tags = [];
  let searchFrom = 0;
  while (searchFrom < markdown.length) {
    const opening = markdown.indexOf("<", searchFrom);
    if (opening === -1) {
      break;
    }
    let cursor = opening + 1;
    if (!/[A-Za-z]/u.test(markdown.at(cursor) ?? "")) {
      searchFrom = cursor;
      continue;
    }
    cursor += 1;
    while (/[A-Za-z0-9-]/u.test(markdown.at(cursor) ?? "")) {
      cursor += 1;
    }
    const tagBoundary = markdown.at(cursor);
    if (
      tagBoundary !== ">" &&
      tagBoundary !== "/" &&
      !isHtmlWhitespace(tagBoundary)
    ) {
      searchFrom = opening + 1;
      continue;
    }

    let complete = false;
    const tagAttributes = [];
    while (cursor < markdown.length) {
      while (isHtmlWhitespace(markdown.at(cursor))) {
        cursor += 1;
      }
      if (markdown.at(cursor) === ">") {
        cursor += 1;
        complete = true;
        break;
      }
      if (markdown.at(cursor) === "/" && markdown.at(cursor + 1) === ">") {
        cursor += 2;
        complete = true;
        break;
      }

      const nameStart = cursor;
      while (
        cursor < markdown.length &&
        !isHtmlWhitespace(markdown.at(cursor)) &&
        !/[=/>]/u.test(markdown.at(cursor) ?? "")
      ) {
        cursor += 1;
      }
      if (cursor === nameStart) {
        break;
      }
      const name = markdown.slice(nameStart, cursor).toLowerCase();
      while (isHtmlWhitespace(markdown.at(cursor))) {
        cursor += 1;
      }
      let value;
      if (markdown.at(cursor) === "=") {
        cursor += 1;
        while (isHtmlWhitespace(markdown.at(cursor))) {
          cursor += 1;
        }
        const quote = markdown.at(cursor);
        if (quote === '"' || quote === "'") {
          const valueStart = cursor + 1;
          const valueEnd = markdown.indexOf(quote, valueStart);
          if (valueEnd === -1) {
            break;
          }
          value = markdown.slice(valueStart, valueEnd);
          cursor = valueEnd + 1;
        } else {
          const valueStart = cursor;
          while (
            cursor < markdown.length &&
            !isHtmlWhitespace(markdown.at(cursor)) &&
            markdown.at(cursor) !== ">" &&
            !(
              markdown.at(cursor) === "/" &&
              markdown.at(cursor + 1) === ">"
            )
          ) {
            cursor += 1;
          }
          value = markdown.slice(valueStart, cursor);
        }
      }
      if (value !== undefined) {
        tagAttributes.push(Object.freeze({ name, value }));
      }
    }
    if (complete) {
      tags.push(Object.freeze({
        attributes: Object.freeze(tagAttributes),
        end: cursor,
        start: opening,
      }));
    }
    searchFrom = complete ? cursor : opening + 1;
  }
  return tags;
}

function withoutHtmlTags(markdown, tags) {
  const rendered = [];
  let retainedFrom = 0;
  for (const tag of tags) {
    rendered.push(markdown.slice(retainedFrom, tag.start));
    rendered.push(maskedLiteral(markdown.slice(tag.start, tag.end)));
    retainedFrom = tag.end;
  }
  rendered.push(markdown.slice(retainedFrom));
  return rendered.join("");
}

function headingAnchors(text) {
  const markdown = renderedMarkdown(text);
  const headingMarkdown = containerProjectedMarkdown(markdown);
  const referenceLabels = new Set(
    referenceDefinitions(markdown).map((definition) => definition.label),
  );
  const anchors = new Set();
  const occurrences = new Map();
  const headings = [];
  for (const match of headingMarkdown.matchAll(
    /^[ \t]{0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/gmu,
  )) {
    const heading = (match[1] ?? "").replace(/[ \t]+#+[ \t]*$/u, "");
    headings.push(Object.freeze({ index: match.index, text: heading }));
  }
  for (const match of headingMarkdown.matchAll(
    /^[ \t]{0,3}(\S(?:.*?\S)?)[ \t]*\r?\n[ \t]{0,3}(?:=+|-+)[ \t]*\r?$/gmu,
  )) {
    if (!/^#{1,6}(?:[ \t]|$)/u.test(match.at(1))) {
      headings.push(Object.freeze({ index: match.index, text: match.at(1) }));
    }
  }
  headings.sort((left, right) => left.index - right.index);
  for (const heading of headings) {
    const base = headingSlug(headingInlineText(heading.text, referenceLabels));
    if (base.length === 0) {
      continue;
    }
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : base + "-" + occurrence);
  }
  for (const tag of htmlTags(withoutCodeSpans(markdown))) {
    for (const attribute of tag.attributes) {
      if (
        (attribute.name === "id" || attribute.name === "name") &&
        attribute.value.length > 0
      ) {
        anchors.add(decodeCharacterReferences(attribute.value));
      }
    }
  }
  return anchors;
}

function localTargets(text) {
  const markdown = withoutCodeSpans(renderedMarkdown(text));
  const tags = htmlTags(markdown);
  const markdownContent = withoutHtmlTags(markdown, tags);
  const targets = inlineTargets(markdownContent);
  targets.push(...referenceTargets(markdownContent));
  for (const tag of tags) {
    for (const attribute of tag.attributes) {
      const { name, value } = attribute;
      if (name !== "href" && name !== "src" && name !== "srcset") {
        continue;
      }
      if (name !== "srcset") {
        targets.push(value);
        continue;
      }
      for (const candidate of value.split(",")) {
        const target = candidate.trim().split(/\s+/u).at(0);
        if (target !== undefined && target.length > 0) {
          targets.push(target);
        }
      }
    }
  }
  return targets;
}

export function validateDocumentation(context, options = {}) {
  if (
    context === null ||
    typeof context !== "object" ||
    context.files === null ||
    typeof context.files !== "object" ||
    typeof context.gitAttributesText !== "string" ||
    !Array.isArray(context.ownedPaths) ||
    typeof context.licenseText !== "string"
  ) {
    fail("documentation context is invalid");
  }

  if (context.gitAttributesText !== CANONICAL_GIT_ATTRIBUTES) {
    fail("Git text policy mismatch");
  }

  if (context.ownedPaths.some((file) => file.startsWith("docs/decisions/"))) {
    fail("decision ledger is forbidden");
  }

  const actualDocuments = sorted(context.ownedPaths.filter(isAuthorityDocument));
  const expectedDocuments = sorted(DOCUMENT_PATHS);
  if (JSON.stringify(actualDocuments) !== JSON.stringify(expectedDocuments)) {
    fail("documentation inventory mismatch");
  }

  const owned = new Set(context.ownedPaths);
  const anchorSets = new Map();
  for (const file of DOCUMENT_PATHS) {
    const text = context.files[file];
    if (typeof text !== "string" || text.length === 0) {
      fail("documentation input is missing: " + file);
    }
    if (text.charCodeAt(0) === 0xfeff) {
      fail("documentation contains a byte-order mark: " + file);
    }
    if (/docs\/decisions\/|\bdecisions?[\s-]+[0-9]{4}\b/iu.test(text)) {
      fail("decision ledger reference is forbidden: " + file);
    }
    if (FORBIDDEN_AUTHORSHIP_PATTERNS.some((pattern) => pattern.test(text))) {
      fail("authorship claim is forbidden: " + file);
    }
    for (const rawTarget of localTargets(text)) {
      const target = normalizeTarget(file, rawTarget);
      if (target === undefined) {
        continue;
      }
      if (!owned.has(target.path)) {
        fail("broken local link in " + file + ": " + rawTarget);
      }
      if (target.fragment !== undefined && target.fragment.length > 0) {
        let anchors = anchorSets.get(target.path);
        if (anchors === undefined) {
          const targetText = context.files[target.path];
          anchors = typeof targetText === "string"
            ? headingAnchors(targetText)
            : new Set();
          anchorSets.set(target.path, anchors);
        }
        if (!anchors.has(target.fragment)) {
          fail("broken local link fragment in " + file + ": " + rawTarget);
        }
      }
    }
  }

  if (!context.files["README.md"].includes(
    "An owned, zero-dependency personal coding agent.",
  )) {
    fail("public product description mismatch");
  }
  if (!context.files["AGENTS.md"].includes("`giovannijecha/agent`")) {
    fail("canonical repository identity mismatch");
  }

  const expectedLicenseDigest =
    options.expectedLicenseDigest ?? CANONICAL_LICENSE_DIGEST;
  const actualLicenseDigest = createHash("sha256")
    .update(context.licenseText)
    .digest("hex");
  if (actualLicenseDigest !== expectedLicenseDigest) {
    fail("license digest mismatch");
  }
}
