import { err, ok, type Result } from "@agent/core";

import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";

export type WorkspaceFileReadProjection = Readonly<{
  hasMore: boolean;
  lineCount: number;
  startLine: number;
  text: string;
  totalLines: number;
}>;

export type WorkspaceFileReadProjectionError = Readonly<{
  kind: "invalidInput" | "limit";
}>;

function failure(
  kind: WorkspaceFileReadProjectionError["kind"],
): WorkspaceFileReadProjectionError {
  return Object.freeze({ kind });
}

function logicalLineCount(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  let lines = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charAt(index) === "\n") {
      lines += 1;
    }
  }
  return content.charAt(content.length - 1) === "\n" ? lines : lines + 1;
}

function lineOffset(content: string, line: number): number {
  if (line <= 1) {
    return 0;
  }
  let current = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charAt(index) === "\n") {
      current += 1;
      if (current === line) {
        return index + 1;
      }
    }
  }
  return content.length;
}

function validOptionalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= minimum &&
      value <= maximum)
  );
}

/** Projects exact LF-delimited logical lines from one already bounded file. */
export function projectWorkspaceFileRead(
  content: unknown,
  startLine: unknown,
  maximumLines: unknown,
): Result<WorkspaceFileReadProjection, WorkspaceFileReadProjectionError> {
  if (
    typeof content !== "string" ||
    !validOptionalInteger(
      startLine,
      1,
      BUILTIN_TOOL_LIMITS.fileLineNumber,
    ) ||
    !validOptionalInteger(
      maximumLines,
      1,
      BUILTIN_TOOL_LIMITS.fileRangeLines,
    )
  ) {
    return err(failure("invalidInput"));
  }
  if (content.length > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
    return err(failure("limit"));
  }

  const totalLines = logicalLineCount(content);
  const requestedStart = startLine ?? 1;
  const actualStart = Math.min(requestedStart, totalLines + 1);
  const remainingLines = Math.max(0, totalLines - actualStart + 1);
  const selectedLines =
    maximumLines === undefined
      ? remainingLines
      : Math.min(maximumLines, remainingLines);
  const startOffset = lineOffset(content, actualStart);
  const endOffset = lineOffset(content, actualStart + selectedLines);

  return ok(
    Object.freeze({
      hasMore: actualStart - 1 + selectedLines < totalLines,
      lineCount: selectedLines,
      startLine: actualStart,
      text: content.slice(startOffset, endOffset),
      totalLines,
    }),
  );
}
