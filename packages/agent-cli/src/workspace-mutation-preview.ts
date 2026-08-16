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

type TerminalSeparator = "" | "\r" | "\n" | "\r\n";

type PatchMutationPreview = Readonly<{
  effect: "create" | "update";
  hunks: readonly TextPatchHunk[];
  path: string;
}>;

export type PatchMutationDisplay = Readonly<{
  diff: string;
  path: string;
}>;

function logicalRowTokens(content: string): readonly string[] {
  const rows: string[] = [];
  let start = 0;
  let index = 0;
  while (index < content.length) {
    const character = content.charAt(index);
    if (character === "\r") {
      index += content.charAt(index + 1) === "\n" ? 2 : 1;
      rows.push(content.slice(start, index));
      start = index;
    } else if (character === "\n") {
      index += 1;
      rows.push(content.slice(start, index));
      start = index;
    } else {
      index += 1;
    }
  }
  if (start < content.length) {
    rows.push(content.slice(start));
  }
  return Object.freeze(rows);
}

function changedRows(hunk: TextPatchHunk): TextPatchHunk | undefined {
  if (hunk.oldText === hunk.newText) {
    return undefined;
  }
  const removed = logicalRowTokens(hunk.oldText);
  const inserted = logicalRowTokens(hunk.newText);
  let prefix = 0;
  while (
    prefix < removed.length &&
    prefix < inserted.length &&
    removed.at(prefix) === inserted.at(prefix)
  ) {
    prefix += 1;
  }

  let removedEnd = removed.length;
  let insertedEnd = inserted.length;
  while (
    removedEnd > prefix &&
    insertedEnd > prefix &&
    removed.at(removedEnd - 1) === inserted.at(insertedEnd - 1)
  ) {
    removedEnd -= 1;
    insertedEnd -= 1;
  }

  const oldText = removed.slice(prefix, removedEnd).join("");
  const newText = inserted.slice(prefix, insertedEnd).join("");
  return oldText.length === 0 && newText.length === 0
    ? undefined
    : Object.freeze({ newText, oldText });
}

function changedMutation(
  mutation: PatchMutationPreview,
): PatchMutationPreview | undefined {
  if (mutation.effect === "create") {
    return mutation;
  }
  const hunks: TextPatchHunk[] = [];
  for (let index = 0; index < mutation.hunks.length; index += 1) {
    const hunk = mutation.hunks.at(index);
    if (hunk === undefined) {
      continue;
    }
    const changed = changedRows(hunk);
    if (changed === undefined) {
      return undefined;
    }
    hunks.push(changed);
  }
  return Object.freeze({
    effect: mutation.effect,
    hunks: Object.freeze(hunks),
    path: mutation.path,
  });
}

function terminalSeparator(content: string): TerminalSeparator {
  if (content.endsWith("\r\n")) return "\r\n";
  if (content.endsWith("\r")) return "\r";
  return content.endsWith("\n") ? "\n" : "";
}

function terminalSeparatorExposure(hunk: TextPatchHunk): Readonly<{
  inserted: boolean;
  removed: boolean;
}> {
  const removed = terminalSeparator(hunk.oldText);
  const inserted = terminalSeparator(hunk.newText);
  const onlyDifference = removed !== inserted &&
    hunk.oldText.slice(0, hunk.oldText.length - removed.length) ===
      hunk.newText.slice(0, hunk.newText.length - inserted.length);
  return Object.freeze({
    inserted: onlyDifference && inserted.length > 0,
    removed: onlyDifference && removed.length > 0,
  });
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

function escapeDiffText(
  content: string,
  exposeTerminalSeparator: boolean,
): string {
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
      let separator = "\\r";
      if (content.charAt(index) === "\n") {
        index += 1;
        separator += "\\n";
      }
      parts.push(
        exposeTerminalSeparator && index === content.length
          ? separator
          : "\n",
      );
    } else if (scalar === "\n") {
      parts.push(
        exposeTerminalSeparator && index === content.length
          ? "\\n"
          : "\n",
      );
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
  exposeTerminalSeparator: boolean,
): void {
  if (content.length === 0) {
    return;
  }
  const retained = budget === undefined
    ? Object.freeze({ omitted: 0, prefix: content, suffix: "" })
    : excerpt(content, budget);
  if (retained.prefix.length > 0) {
    const lines = escapeDiffText(
      retained.prefix,
      exposeTerminalSeparator &&
        retained.omitted === 0 &&
        retained.suffix.length === 0,
    ).split("\n");
    if (lines.at(-1) === "") {
      lines.pop();
    }
    for (const line of lines) {
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
    const lines = escapeDiffText(
      retained.suffix,
      exposeTerminalSeparator,
    ).split("\n");
    if (lines.at(-1) === "") {
      lines.pop();
    }
    for (const line of lines) {
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
    const separatorExposure = terminalSeparatorExposure(hunk);
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
      separatorExposure.removed,
    );
    appendChangedRows(
      rows,
      "+",
      hunk.newText,
      insertBudget,
      compactOmission,
      separatorExposure.inserted,
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
  const changed = changedMutation(mutation);
  if (changed === undefined) {
    return undefined;
  }
  const exact = renderDiff(changed, undefined, false);
  if (exact.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS) {
    return exact;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const bounded = renderDiff(changed, budget, false);
    if (bounded.length <= WORKSPACE_MUTATION_PREVIEW_CODE_UNITS) {
      return bounded;
    }
  }
  const compact = renderDiff(changed, 0, true);
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
