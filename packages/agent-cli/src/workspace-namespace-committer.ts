import type { Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

import type {
  WorkspaceObjectIdentity,
  WorkspacePathKind,
} from "./workspace-path.js";

export type WorkspaceNamespaceCommit =
  | Readonly<{
      kind: "create_directory";
      parentIdentity: WorkspaceObjectIdentity;
      relativePath: string;
      root: string;
    }>
  | Readonly<{
      destinationParentIdentity: WorkspaceObjectIdentity;
      destinationPath: string;
      entryKind: WorkspacePathKind;
      identity: WorkspaceObjectIdentity;
      kind: "move";
      relativePath: string;
      root: string;
      sourceParentIdentity: WorkspaceObjectIdentity;
    }>
  | Readonly<{
      entryKind: WorkspacePathKind;
      identity: WorkspaceObjectIdentity;
      kind: "remove";
      parentIdentity: WorkspaceObjectIdentity;
      relativePath: string;
      root: string;
    }>;

export type WorkspaceNamespaceCommitResult =
  | "directory_created"
  | "moved"
  | "removed";

export type WorkspaceNamespaceOperation = WorkspaceNamespaceCommit["kind"];

/** One removable platform boundary for an approved namespace effect. */
export interface WorkspaceNamespaceCommitter {
  supportsOperation(operation: WorkspaceNamespaceOperation): boolean;
  commit(
    request: WorkspaceNamespaceCommit,
    cancellation: ToolCancellation,
  ): Promise<Result<WorkspaceNamespaceCommitResult, ToolHandlerError>>;
}
