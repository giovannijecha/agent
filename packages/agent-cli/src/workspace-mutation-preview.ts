import {
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import { renderStructuredProjection } from "@agent/tools";

import type { TextPatchHunk } from "./workspace-text-patch.js";

export const WORKSPACE_MUTATION_PREVIEW_CODE_UNITS = 2_048;

const EXCERPT_BUDGETS = Object.freeze([768, 512, 256, 128, 64]);
const EXACT_PATCH_FIELDS = Object.freeze([
  "removeCodeUnits",
  "removeText",
  "insertCodeUnits",
  "insertText",
]);
const EXCERPT_PATCH_FIELDS = Object.freeze([
  "removeCodeUnits",
  "removePrefix",
  "removeOmitted",
  "removeSuffix",
  "insertCodeUnits",
  "insertPrefix",
  "insertOmitted",
  "insertSuffix",
]);
const OMITTED_PATCH_FIELDS = Object.freeze([
  "removeCodeUnits",
  "removeOmitted",
  "insertCodeUnits",
  "insertOmitted",
]);

type TextExcerpt = Readonly<{
  omitted: number;
  prefix: string;
  suffix: string;
}>;

type PatchExcerpt = Readonly<{
  hunks: readonly (readonly (number | string)[])[];
  omitted: number;
}>;

type PatchMutationPreview = Readonly<{
  addedLines: number;
  effect: "create" | "update";
  hunks: readonly TextPatchHunk[];
  observedDigest?: string;
  path: string;
  removedLines: number;
  resultingDigest: string;
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

function patchCodeUnits(hunks: readonly TextPatchHunk[]): number {
  let codeUnits = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk !== undefined) {
      codeUnits += hunk.oldText.length + hunk.newText.length;
    }
  }
  return codeUnits;
}

function exactPatchHunks(
  hunks: readonly TextPatchHunk[],
): readonly (readonly (number | string)[])[] {
  const projected: (readonly (number | string)[])[] = [];
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk !== undefined) {
      projected.push(
        Object.freeze([
          hunk.oldText.length,
          hunk.oldText,
          hunk.newText.length,
          hunk.newText,
        ]),
      );
    }
  }
  return Object.freeze(projected);
}

function excerptPatchHunks(
  hunks: readonly TextPatchHunk[],
  budget: number,
): PatchExcerpt {
  const fieldCount = hunks.length * 2;
  const sharedBudget = fieldCount === 0 ? 0 : Math.floor(budget / fieldCount);
  const remainder = fieldCount === 0 ? 0 : budget % fieldCount;
  const projected: (readonly (number | string)[])[] = [];
  let fieldIndex = 0;
  let omitted = 0;
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk === undefined) {
      continue;
    }
    const remove = excerpt(
      hunk.oldText,
      sharedBudget + (fieldIndex < remainder ? 1 : 0),
    );
    fieldIndex += 1;
    const insert = excerpt(
      hunk.newText,
      sharedBudget + (fieldIndex < remainder ? 1 : 0),
    );
    fieldIndex += 1;
    omitted += remove.omitted + insert.omitted;
    projected.push(
      Object.freeze([
        hunk.oldText.length,
        remove.prefix,
        remove.omitted,
        remove.suffix,
        hunk.newText.length,
        insert.prefix,
        insert.omitted,
        insert.suffix,
      ]),
    );
  }
  return Object.freeze({ hunks: Object.freeze(projected), omitted });
}

function omittedPatchHunks(
  hunks: readonly TextPatchHunk[],
): readonly (readonly number[])[] {
  const projected: (readonly number[])[] = [];
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk !== undefined) {
      projected.push(
        Object.freeze([
          hunk.oldText.length,
          hunk.oldText.length,
          hunk.newText.length,
          hunk.newText.length,
        ]),
      );
    }
  }
  return Object.freeze(projected);
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

/** Renders one bounded exact structured-patch approval preview. */
export function patchMutationPreview(
  mutation: PatchMutationPreview,
): string | undefined {
  const observedState =
    mutation.effect === "create"
      ? Object.freeze({ observed: "absent" })
      : Object.freeze({ observedDigest: mutation.observedDigest });
  const changedCodeUnits = patchCodeUnits(mutation.hunks);
  const base = {
    addedLines: mutation.addedLines,
    effect: mutation.effect,
    hunks: mutation.hunks.length,
    ...observedState,
    operation: "apply_patch",
    patchCodeUnits: changedCodeUnits,
    path: mutation.path,
    removedLines: mutation.removedLines,
    resultingDigest: mutation.resultingDigest,
  };
  const commonFields = [
    { mode: "exact" as const, name: "operation" },
    { mode: "exact" as const, name: "effect" },
    { mode: "exact" as const, name: "path" },
    mutation.effect === "create"
      ? { mode: "exact" as const, name: "observed" }
      : { mode: "exact" as const, name: "observedDigest" },
    { mode: "exact" as const, name: "resultingDigest" },
    { mode: "exact" as const, name: "hunks" },
    { mode: "exact" as const, name: "removedLines" },
    { mode: "exact" as const, name: "addedLines" },
    { mode: "exact" as const, name: "patchCodeUnits" },
  ];
  const complete = renderPreview(
    {
      ...base,
      patchFields: EXACT_PATCH_FIELDS,
      patchHunks: exactPatchHunks(mutation.hunks),
    },
    Object.freeze([
      ...commonFields,
      { mode: "exact" as const, name: "patchFields" },
      { mode: "exact" as const, name: "patchHunks" },
    ]),
  );
  if (complete !== undefined) {
    return complete;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const bounded = excerptPatchHunks(mutation.hunks, budget);
    const preview = renderPreview(
      {
        ...base,
        patchFields: EXCERPT_PATCH_FIELDS,
        patchHunks: bounded.hunks,
        patchOmitted: bounded.omitted,
      },
      Object.freeze([
        ...commonFields,
        { mode: "exact" as const, name: "patchFields" },
        { mode: "exact" as const, name: "patchHunks" },
        { mode: "exact" as const, name: "patchOmitted" },
      ]),
    );
    if (preview !== undefined) {
      return preview;
    }
  }
  return renderPreview(
    {
      ...base,
      patchFields: OMITTED_PATCH_FIELDS,
      patchHunks: omittedPatchHunks(mutation.hunks),
      patchOmitted: changedCodeUnits,
    },
    Object.freeze([
      ...commonFields,
      { mode: "exact" as const, name: "patchFields" },
      { mode: "exact" as const, name: "patchHunks" },
      { mode: "exact" as const, name: "patchOmitted" },
    ]),
  );
}
