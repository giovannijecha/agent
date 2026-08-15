import { StructuredObject, structuredValueFromUnknown } from "@agent/core";
import { renderStructuredProjection } from "@agent/tools";

export const WORKSPACE_NAMESPACE_LIMITS = Object.freeze({
  pathCodeUnits: 512,
  pathUtf8Bytes: 2_048,
  previewCodeUnits: 2_048,
});

type NamespacePreview =
  | Readonly<{ operation: "create_directory"; path: string }>
  | Readonly<{
      destination: string;
      objectKind: "directory" | "file";
      operation: "move";
      path: string;
    }>
  | Readonly<{
      objectKind: "directory" | "file";
      operation: "remove";
      path: string;
    }>;

/** Renders the complete bounded effect authorized by one namespace approval. */
export function namespaceMutationPreview(
  value: NamespacePreview,
): string | undefined {
  const structured = structuredValueFromUnknown(value);
  if (!structured.ok || !(structured.value instanceof StructuredObject)) {
    return undefined;
  }
  const fields = value.operation === "move"
    ? Object.freeze([
        { mode: "exact" as const, name: "operation" },
        { mode: "exact" as const, name: "objectKind" },
        { mode: "exact" as const, name: "path" },
        { mode: "exact" as const, name: "destination" },
      ])
    : value.operation === "remove"
      ? Object.freeze([
          { mode: "exact" as const, name: "operation" },
          { mode: "exact" as const, name: "objectKind" },
          { mode: "exact" as const, name: "path" },
        ])
      : Object.freeze([
          { mode: "exact" as const, name: "operation" },
          { mode: "exact" as const, name: "path" },
        ]);
  return renderStructuredProjection(
    fields,
    structured.value,
    WORKSPACE_NAMESPACE_LIMITS.previewCodeUnits,
  );
}
