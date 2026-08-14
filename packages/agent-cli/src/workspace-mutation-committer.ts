import type { Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

import type { WorkspaceObjectIdentity } from "./workspace-path.js";

export type WorkspaceCreateCommit = Readonly<{
  content: string;
  identity: WorkspaceObjectIdentity;
  kind: "create";
  relativePath: string;
  root: string;
}>;

export type WorkspaceReplaceCommit = Readonly<{
  expectedContent: string;
  identity: WorkspaceObjectIdentity;
  kind: "replace";
  relativePath: string;
  replacement: string;
  root: string;
}>;

export type WorkspaceMutationCommit =
  | WorkspaceCreateCommit
  | WorkspaceReplaceCommit;

export type WorkspaceMutationCommitResult = "created" | "replaced";

/** One removable platform commit boundary behind approved effect plans. */
export interface WorkspaceMutationCommitter {
  commit(
    request: WorkspaceMutationCommit,
    cancellation: ToolCancellation,
  ): Promise<Result<WorkspaceMutationCommitResult, ToolHandlerError>>;
}
