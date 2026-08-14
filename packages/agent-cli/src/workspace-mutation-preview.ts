import {
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import { renderStructuredProjection } from "@agent/tools";

export const WORKSPACE_MUTATION_PREVIEW_CODE_UNITS = 2_048;

const EXCERPT_BUDGETS = Object.freeze([512, 256, 128, 64, 0]);

type TextExcerpt = Readonly<{
  omitted: number;
  prefix: string;
  suffix: string;
}>;

type CreateMutationPreview = Readonly<{
  content: string;
  digest: string;
  path: string;
}>;

type ReplaceMutationPreview = Readonly<{
  line: number;
  newText: string;
  observedDigest: string;
  oldText: string;
  path: string;
  resultingDigest: string;
}>;

function lineBreaksBefore(content: string, end: number): number {
  let breaks = 0;
  for (let index = 0; index < end; index += 1) {
    const character = content.charAt(index);
    if (character === "\r") {
      breaks += 1;
      if (index + 1 < end && content.charAt(index + 1) === "\n") {
        index += 1;
      }
    } else if (character === "\n") {
      breaks += 1;
    }
  }
  return breaks;
}

function lineCount(content: string): number {
  return content.length === 0
    ? 0
    : lineBreaksBefore(content, content.length) + 1;
}

/** Returns the one-based preview line at one validated content offset. */
export function mutationPreviewLineAt(
  content: string,
  offset: number,
): number {
  return lineBreaksBefore(content, offset) + 1;
}

function safePrefix(content: string, codeUnits: number): string {
  let end = Math.min(content.length, codeUnits);
  if (
    end > 0 &&
    end < content.length &&
    /[\uD800-\uDBFF]/u.test(content.charAt(end - 1))
  ) {
    end -= 1;
  }
  return content.slice(0, end);
}

function safeSuffix(content: string, codeUnits: number): string {
  let start = Math.max(0, content.length - codeUnits);
  if (
    start > 0 &&
    start < content.length &&
    /[\uDC00-\uDFFF]/u.test(content.charAt(start))
  ) {
    start += 1;
  }
  return content.slice(start);
}

function excerpt(content: string, budget: number): TextExcerpt {
  const prefix = safePrefix(content, Math.ceil(budget / 2));
  const suffix = safeSuffix(content, Math.floor(budget / 2));
  return Object.freeze({
    omitted: content.length - prefix.length - suffix.length,
    prefix,
    suffix,
  });
}

function renderPreview(
  value: unknown,
  fields: readonly Readonly<{ mode: "exact" | "size"; name: string }>[],
): string | undefined {
  const structured = structuredValueFromUnknown(value);
  return structured.ok && structured.value instanceof StructuredObject
    ? renderStructuredProjection(
        fields,
        structured.value,
        WORKSPACE_MUTATION_PREVIEW_CODE_UNITS,
      )
    : undefined;
}

/** Renders a bounded concrete absent-target creation preview. */
export function createMutationPreview(
  mutation: CreateMutationPreview,
): string | undefined {
  const base = {
    contentCodeUnits: mutation.content.length,
    digest: mutation.digest,
    lines: lineCount(mutation.content),
    observed: "absent",
    operation: "create_file",
    path: mutation.path,
  };
  const complete = renderPreview(
    { ...base, content: mutation.content },
    Object.freeze([
      { mode: "exact", name: "operation" },
      { mode: "exact", name: "path" },
      { mode: "exact", name: "observed" },
      { mode: "exact", name: "digest" },
      { mode: "exact", name: "lines" },
      { mode: "exact", name: "contentCodeUnits" },
      { mode: "exact", name: "content" },
    ]),
  );
  if (complete !== undefined) {
    return complete;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const content = excerpt(mutation.content, budget);
    const preview = renderPreview(
      {
        ...base,
        contentPrefix: content.prefix,
        omittedCodeUnits: content.omitted,
        contentSuffix: content.suffix,
      },
      Object.freeze([
        { mode: "exact", name: "operation" },
        { mode: "exact", name: "path" },
        { mode: "exact", name: "observed" },
        { mode: "exact", name: "digest" },
        { mode: "exact", name: "lines" },
        { mode: "exact", name: "contentCodeUnits" },
        { mode: "exact", name: "contentPrefix" },
        { mode: "exact", name: "omittedCodeUnits" },
        { mode: "exact", name: "contentSuffix" },
      ]),
    );
    if (preview !== undefined) {
      return preview;
    }
  }
  return undefined;
}

/** Renders a bounded concrete one-match replacement preview. */
export function replaceMutationPreview(
  mutation: ReplaceMutationPreview,
): string | undefined {
  const base = {
    addedLines: lineCount(mutation.newText),
    line: mutation.line,
    observedDigest: mutation.observedDigest,
    operation: "replace_text",
    path: mutation.path,
    removedLines: lineCount(mutation.oldText),
    resultingDigest: mutation.resultingDigest,
  };
  const complete = renderPreview(
    { ...base, insert: mutation.newText, remove: mutation.oldText },
    Object.freeze([
      { mode: "exact", name: "operation" },
      { mode: "exact", name: "path" },
      { mode: "exact", name: "observedDigest" },
      { mode: "exact", name: "resultingDigest" },
      { mode: "exact", name: "line" },
      { mode: "exact", name: "removedLines" },
      { mode: "exact", name: "addedLines" },
      { mode: "exact", name: "remove" },
      { mode: "exact", name: "insert" },
    ]),
  );
  if (complete !== undefined) {
    return complete;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const removed = excerpt(mutation.oldText, budget);
    const inserted = excerpt(mutation.newText, budget);
    const preview = renderPreview(
      {
        ...base,
        insertOmitted: inserted.omitted,
        insertPrefix: inserted.prefix,
        insertSuffix: inserted.suffix,
        removeOmitted: removed.omitted,
        removePrefix: removed.prefix,
        removeSuffix: removed.suffix,
      },
      Object.freeze([
        { mode: "exact", name: "operation" },
        { mode: "exact", name: "path" },
        { mode: "exact", name: "observedDigest" },
        { mode: "exact", name: "resultingDigest" },
        { mode: "exact", name: "line" },
        { mode: "exact", name: "removedLines" },
        { mode: "exact", name: "addedLines" },
        { mode: "exact", name: "removePrefix" },
        { mode: "exact", name: "removeOmitted" },
        { mode: "exact", name: "removeSuffix" },
        { mode: "exact", name: "insertPrefix" },
        { mode: "exact", name: "insertOmitted" },
        { mode: "exact", name: "insertSuffix" },
      ]),
    );
    if (preview !== undefined) {
      return preview;
    }
  }
  return undefined;
}
