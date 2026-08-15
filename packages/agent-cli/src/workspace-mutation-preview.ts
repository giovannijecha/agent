import type { TextPatchHunk } from "./workspace-text-patch.js";

export const WORKSPACE_MUTATION_PREVIEW_CODE_UNITS = 2_048;

const PATH_PREFIX = "Path: ";
const EXCERPT_BUDGETS = Object.freeze([768, 512, 256, 128, 64, 0]);
const UNSAFE_DISPLAY = /[\p{C}\p{Zl}\p{Zp}]/u;

type TextExcerpt = Readonly<{
  omitted: number;
  prefix: string;
  suffix: string;
}>;

type PatchMutationPreview = Readonly<{
  effect: "create" | "update";
  hunks: readonly TextPatchHunk[];
  path: string;
}>;

export type PatchMutationDisplay = Readonly<{
  diff: string;
  path: string;
}>;

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
  if (content.length <= budget) {
    return Object.freeze({ omitted: 0, prefix: content, suffix: "" });
  }
  const prefix = safePrefix(content, Math.ceil(budget / 2));
  const suffix = safeSuffix(content, Math.floor(budget / 2));
  return Object.freeze({
    omitted: content.length - prefix.length - suffix.length,
    prefix,
    suffix,
  });
}

function escapeDiffText(content: string): string {
  const parts: string[] = [];
  let index = 0;
  while (index < content.length) {
    const point = content.codePointAt(index);
    if (point === undefined) {
      break;
    }
    const scalar = String.fromCodePoint(point);
    index += scalar.length;
    if (scalar === "\r") {
      if (content.charAt(index) === "\n") {
        index += 1;
      }
      parts.push("\n");
    } else if (scalar === "\n") {
      parts.push("\n");
    } else if (scalar === "\\") {
      parts.push("\\\\");
    } else if (scalar === "\t") {
      parts.push("\\t");
    } else if (UNSAFE_DISPLAY.test(scalar)) {
      parts.push("\\u{" + point.toString(16) + "}");
    } else {
      parts.push(scalar);
    }
  }
  return parts.join("");
}

function appendChangedRows(
  rows: string[],
  marker: "-" | "+",
  content: string,
  budget: number | undefined,
  compactOmission: boolean,
): void {
  if (content.length === 0) {
    return;
  }
  const retained = budget === undefined
    ? Object.freeze({ omitted: 0, prefix: content, suffix: "" })
    : excerpt(content, budget);
  if (retained.prefix.length > 0) {
    for (const line of escapeDiffText(retained.prefix).split("\n")) {
      rows.push(marker + " " + line);
    }
  }
  if (retained.omitted > 0) {
    rows.push(
      compactOmission
        ? marker + " [" + String(retained.omitted) + " omitted]"
        : marker + " ... " + String(retained.omitted) +
          " code units omitted",
    );
  }
  if (retained.suffix.length > 0) {
    for (const line of escapeDiffText(retained.suffix).split("\n")) {
      rows.push(marker + " " + line);
    }
  }
}

function nonEmptyFieldCount(hunks: readonly TextPatchHunk[]): number {
  let count = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk !== undefined) {
      if (hunk.oldText.length > 0) count += 1;
      if (hunk.newText.length > 0) count += 1;
    }
  }
  return count;
}

function renderDiff(
  mutation: PatchMutationPreview,
  totalBudget: number | undefined,
  compactOmission: boolean,
): string {
  const rows = [PATH_PREFIX + mutation.path];
  const fields = nonEmptyFieldCount(mutation.hunks);
  const sharedBudget = totalBudget === undefined || fields === 0
    ? undefined
    : Math.floor(totalBudget / fields);
  const remainder = totalBudget === undefined || fields === 0
    ? 0
    : totalBudget % fields;
  let fieldIndex = 0;
  for (let index = 0; index < mutation.hunks.length; index += 1) {
    const hunk = mutation.hunks.at(index);
    if (hunk === undefined) {
      continue;
    }
    const removeBudget = sharedBudget === undefined || hunk.oldText.length === 0
      ? sharedBudget
      : sharedBudget + (fieldIndex < remainder ? 1 : 0);
    if (hunk.oldText.length > 0) fieldIndex += 1;
    const insertBudget = sharedBudget === undefined || hunk.newText.length === 0
      ? sharedBudget
      : sharedBudget + (fieldIndex < remainder ? 1 : 0);
    if (hunk.newText.length > 0) fieldIndex += 1;
    appendChangedRows(
      rows,
      "-",
      hunk.oldText,
      removeBudget,
      compactOmission,
    );
    appendChangedRows(
      rows,
      "+",
      hunk.newText,
      insertBudget,
      compactOmission,
    );
  }
  if (
    mutation.effect === "create" &&
    mutation.hunks.length === 1 &&
    rows.length === 1
  ) {
    rows.push("+ [empty file]");
  }
  return rows.join("\n");
}

function validPath(path: string): boolean {
  return path.length > 0 && !UNSAFE_DISPLAY.test(path);
}

/** Renders one bounded human-readable diff for exact patch permission. */
export function patchMutationPreview(
  mutation: PatchMutationPreview,
): string | undefined {
  if (!validPath(mutation.path) || mutation.hunks.length === 0) {
    return undefined;
  }
  const exact = renderDiff(mutation, undefined, false);
  if (exact.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS) {
    return exact;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const bounded = renderDiff(mutation, budget, false);
    if (bounded.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS) {
      return bounded;
    }
  }
  const compact = renderDiff(mutation, 0, true);
  return compact.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS
    ? compact
    : undefined;
}

/** Splits an owned patch preview into one safe subject and its diff body. */
export function projectPatchMutationPreview(
  preview: string,
): PatchMutationDisplay | undefined {
  const rows = preview.split("\n");
  const head = rows.at(0);
  if (
    head === undefined ||
    !head.startsWith(PATH_PREFIX) ||
    rows.length < 2
  ) {
    return undefined;
  }
  const path = head.slice(PATH_PREFIX.length);
  const body = rows.slice(1);
  if (
    !validPath(path) ||
    body.some((row) => !row.startsWith("- ") && !row.startsWith("+ "))
  ) {
    return undefined;
  }
  return Object.freeze({
    diff: body.join("\n"),
    path,
  });
}
