import {
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import { renderStructuredProjection } from "@agent/tools";

import type { TextPatchHunk } from "./workspace-text-patch.js";

export const WORKSPACE_MUTATION_PREVIEW_CODE_UNITS = 2_048;

const EXCERPT_BUDGETS = Object.freeze([768, 512, 256, 128, 64, 0]);

type TextExcerpt = Readonly<{
  omitted: number;
  prefix: string;
  suffix: string;
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

function patchDocument(hunks: readonly TextPatchHunk[]): string {
  const sections: string[] = [];
  for (let index = 0; index < hunks.length; index += 1) {
    const hunk = hunks.at(index);
    if (hunk === undefined) {
      continue;
    }
    sections.push(
      "@@ hunk " + String(index + 1) + " @@\nremove:\n" + hunk.oldText +
        "\ninsert:\n" + hunk.newText,
    );
  }
  return sections.join("\n");
}

/** Renders one bounded exact structured-patch approval preview. */
export function patchMutationPreview(
  mutation: PatchMutationPreview,
): string | undefined {
  const patch = patchDocument(mutation.hunks);
  const observedState =
    mutation.effect === "create"
      ? Object.freeze({ observed: "absent" })
      : Object.freeze({ observedDigest: mutation.observedDigest });
  const base = {
    addedLines: mutation.addedLines,
    effect: mutation.effect,
    hunks: mutation.hunks.length,
    ...observedState,
    operation: "apply_patch",
    patchCodeUnits: patch.length,
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
    { ...base, patch },
    Object.freeze([
      ...commonFields,
      { mode: "exact" as const, name: "patch" },
    ]),
  );
  if (complete !== undefined) {
    return complete;
  }
  for (const budget of EXCERPT_BUDGETS) {
    const bounded = excerpt(patch, budget);
    const preview = renderPreview(
      {
        ...base,
        patchOmitted: bounded.omitted,
        patchPrefix: bounded.prefix,
        patchSuffix: bounded.suffix,
      },
      Object.freeze([
        ...commonFields,
        { mode: "exact" as const, name: "patchPrefix" },
        { mode: "exact" as const, name: "patchOmitted" },
        { mode: "exact" as const, name: "patchSuffix" },
      ]),
    );
    if (preview !== undefined) {
      return preview;
    }
  }
  return undefined;
}
