import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@agent/core";
import type { ToolHandlerError } from "@agent/tools";

export type WorkspaceObjectIdentity = Readonly<{
  device: bigint;
  inode: bigint;
}>;

export type ExistingWorkspacePath = Readonly<{
  canonical: string;
  identity: WorkspaceObjectIdentity;
}>;

type WorkspacePathKind = "directory" | "file";

function toolFailure(
  kind: ToolHandlerError["kind"],
): Result<never, ToolHandlerError> {
  return err(Object.freeze({ kind }));
}

export function mapWorkspaceIoError(cause: unknown): ToolHandlerError {
  try {
    if (cause !== null && typeof cause === "object") {
      const code = (cause as Readonly<{ code?: unknown }>).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return Object.freeze({ kind: "notFound" as const });
      }
      if (code === "EACCES" || code === "EPERM") {
        return Object.freeze({ kind: "permission" as const });
      }
      if (code === "EEXIST") {
        return Object.freeze({ kind: "conflict" as const });
      }
    }
  } catch (_cause: unknown) {
    return Object.freeze({ kind: "io" as const });
  }
  return Object.freeze({ kind: "io" as const });
}

export function isMissingWorkspacePath(cause: unknown): boolean {
  try {
    return (
      cause !== null &&
      typeof cause === "object" &&
      (cause as Readonly<{ code?: unknown }>).code === "ENOENT"
    );
  } catch (_cause: unknown) {
    return false;
  }
}

export function insideWorkspace(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
}

export function lexicalWorkspacePath(
  root: string,
  relative: string,
): string | undefined {
  if (
    relative.length === 0 ||
    relative.includes("\u0000") ||
    /\p{Cc}/u.test(relative) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  const target = path.resolve(root, relative);
  return insideWorkspace(root, target) ? target : undefined;
}

export function relativeFromWorkspaceRoot(
  root: string,
  target: string,
): string {
  const relative = path.relative(root, target);
  return relative.length === 0 ? "." : relative;
}

export function workspacePolicyPath(root: string, target: string): string {
  return relativeFromWorkspaceRoot(root, target).split(path.sep).join("/");
}

export function sameWorkspaceIdentity(
  left: WorkspaceObjectIdentity,
  right: WorkspaceObjectIdentity,
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function identity(
  status: Readonly<{ dev: bigint; ino: bigint }>,
): WorkspaceObjectIdentity {
  return Object.freeze({ device: status.dev, inode: status.ino });
}

async function rejectSymlinkTraversal(
  root: string,
  target: string,
): Promise<Result<void, ToolHandlerError>> {
  const relative = path.relative(root, target);
  let current = root;
  try {
    for (const component of relative.split(path.sep)) {
      if (component.length === 0) {
        continue;
      }
      current = path.join(current, component);
      if ((await lstat(current)).isSymbolicLink()) {
        return toolFailure("permission");
      }
    }
    return ok(undefined);
  } catch (cause: unknown) {
    return err(mapWorkspaceIoError(cause));
  }
}

export async function resolveExistingWorkspacePath(
  root: string,
  relative: string,
  kind: WorkspacePathKind,
): Promise<Result<ExistingWorkspacePath, ToolHandlerError>> {
  const lexical = lexicalWorkspacePath(root, relative);
  if (lexical === undefined) {
    return toolFailure("permission");
  }
  try {
    const noSymlinks = await rejectSymlinkTraversal(root, lexical);
    if (!noSymlinks.ok) {
      return noSymlinks;
    }
    const status = await lstat(lexical, { bigint: true });
    if (status.isSymbolicLink()) {
      return toolFailure("permission");
    }
    if (
      (kind === "file" && !status.isFile()) ||
      (kind === "directory" && !status.isDirectory())
    ) {
      return toolFailure("unsupported");
    }
    const canonical = await realpath(lexical);
    return insideWorkspace(root, canonical)
      ? ok(
          Object.freeze({
            canonical,
            identity: identity(status),
          }),
        )
      : toolFailure("permission");
  } catch (cause: unknown) {
    return err(mapWorkspaceIoError(cause));
  }
}

export async function resolveWorkspaceCreationPath(
  root: string,
  relative: string,
): Promise<Result<ExistingWorkspacePath & { target: string }, ToolHandlerError>> {
  const lexical = lexicalWorkspacePath(root, relative);
  if (lexical === undefined) {
    return toolFailure("permission");
  }
  try {
    const parent = path.dirname(lexical);
    const noSymlinks = await rejectSymlinkTraversal(root, parent);
    if (!noSymlinks.ok) {
      return noSymlinks;
    }
    const status = await lstat(parent, { bigint: true });
    if (status.isSymbolicLink() || !status.isDirectory()) {
      return toolFailure(
        status.isSymbolicLink() ? "permission" : "unsupported",
      );
    }
    const canonical = await realpath(parent);
    return insideWorkspace(root, canonical)
      ? ok(
          Object.freeze({
            canonical,
            identity: identity(status),
            target: path.join(canonical, path.basename(lexical)),
          }),
        )
      : toolFailure("permission");
  } catch (cause: unknown) {
    return err(mapWorkspaceIoError(cause));
  }
}
