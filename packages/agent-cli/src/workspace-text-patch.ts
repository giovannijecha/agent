import { err, ok, scalarUtf8ByteLength, type Result } from "@agent/core";
import { structuredStringProjectionCodeUnits } from "@agent/tools";

import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";

export const TEXT_PATCH_LIMITS = Object.freeze({
  aggregateCodeUnits: 524_288,
  aggregateUtf8Bytes: 2_097_152,
  hunks: 32,
  pathCodeUnits: 447,
  pathProjectionCodeUnits: 896,
});

export type TextPatchHunk = Readonly<{
  newText: string;
  oldText: string;
}>;

export type TextPatchErrorKind = "conflict" | "limit" | "unsupported";
export type TextPatchError = Readonly<{ kind: TextPatchErrorKind }>;

export type TextPatchApplication = Readonly<{
  addedLines: number;
  hunkCount: number;
  removedLines: number;
  replacement: string;
}>;

function failure(kind: TextPatchErrorKind): TextPatchError {
  return Object.freeze({ kind });
}

function lineBreaks(content: string): number {
  let breaks = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content.charAt(index);
    if (character === "\r") {
      breaks += 1;
      if (
        index + 1 < content.length &&
        content.charAt(index + 1) === "\n"
      ) {
        index += 1;
      }
    } else if (character === "\n") {
      breaks += 1;
    }
  }
  return breaks;
}

function lineCount(content: string): number {
  return content.length === 0 ? 0 : lineBreaks(content) + 1;
}

/** Validates one path against the exact approval-projection reservation. */
export function validateTextPatchPath(
  path: string,
): Result<void, TextPatchError> {
  const projected = structuredStringProjectionCodeUnits(path);
  return path.length >= 1 &&
    path.length <= TEXT_PATCH_LIMITS.pathCodeUnits &&
    projected !== undefined &&
    projected <= TEXT_PATCH_LIMITS.pathProjectionCodeUnits
    ? ok(undefined)
    : err(failure("limit"));
}

/** Validates the complete hunk batch without observing a target snapshot. */
export function validateTextPatchHunks(
  hunks: readonly TextPatchHunk[],
): Result<void, TextPatchError> {
  if (hunks.length < 1 || hunks.length > TEXT_PATCH_LIMITS.hunks) {
    return err(failure("limit"));
  }
  let codeUnits = 0;
  let utf8Bytes = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk === undefined) {
      return err(failure("conflict"));
    }
    const oldBytes = scalarUtf8ByteLength(hunk.oldText, true);
    const newBytes = scalarUtf8ByteLength(hunk.newText, true);
    if (oldBytes === undefined || newBytes === undefined) {
      return err(failure("unsupported"));
    }
    codeUnits += hunk.oldText.length + hunk.newText.length;
    utf8Bytes += oldBytes + newBytes;
    if (
      codeUnits > TEXT_PATCH_LIMITS.aggregateCodeUnits ||
      utf8Bytes > TEXT_PATCH_LIMITS.aggregateUtf8Bytes
    ) {
      return err(failure("limit"));
    }
  }
  return ok(undefined);
}

function boundedResult(
  replacement: string,
  hunks: readonly TextPatchHunk[],
): Result<TextPatchApplication, TextPatchError> {
  const bytes = scalarUtf8ByteLength(replacement, true);
  if (
    bytes === undefined ||
    replacement.length > BUILTIN_TOOL_LIMITS.fileCodeUnits ||
    bytes > BUILTIN_TOOL_LIMITS.fileUtf8Bytes
  ) {
    return err(failure(bytes === undefined ? "unsupported" : "limit"));
  }
  let addedLines = 0;
  let removedLines = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk === undefined) {
      return err(failure("conflict"));
    }
    addedLines += lineCount(hunk.newText);
    removedLines += lineCount(hunk.oldText);
  }
  return ok(
    Object.freeze({
      addedLines,
      hunkCount: hunks.length,
      removedLines,
      replacement,
    }),
  );
}

/** Applies the one admitted absent-target patch form. */
export function createTextPatch(
  hunks: readonly TextPatchHunk[],
): Result<TextPatchApplication, TextPatchError> {
  const aggregate = validateTextPatchHunks(hunks);
  if (!aggregate.ok) {
    return aggregate;
  }
  const hunk = hunks.at(0);
  return hunks.length === 1 && hunk !== undefined && hunk.oldText === ""
    ? boundedResult(hunk.newText, hunks)
    : err(failure("conflict"));
}

/** Applies ordered exact anchors to one immutable observed source snapshot. */
export function applyTextPatch(
  source: string,
  hunks: readonly TextPatchHunk[],
): Result<TextPatchApplication, TextPatchError> {
  const aggregate = validateTextPatchHunks(hunks);
  if (!aggregate.ok) {
    return aggregate;
  }
  const parts: string[] = [];
  let cursor = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (
      hunk === undefined ||
      hunk.oldText.length === 0 ||
      hunk.oldText === hunk.newText
    ) {
      return err(failure("conflict"));
    }
    const first = source.indexOf(hunk.oldText);
    const second = first < 0
      ? -1
      : source.indexOf(hunk.oldText, first + 1);
    if (first < cursor || second >= 0) {
      return err(failure("conflict"));
    }
    parts.push(source.slice(cursor, first), hunk.newText);
    cursor = first + hunk.oldText.length;
  }
  parts.push(source.slice(cursor));
  return boundedResult(parts.join(""), hunks);
}
