import { lstat, opendir } from "node:fs/promises";
import path from "node:path";

import { err, ok, StructuredObject, type Result } from "@agent/core";
import {
  ToolEffectPlan,
  type ToolHandler,
  type ToolHandlerError,
  ToolHandlerOutcome,
  type ToolPlanner,
} from "@agent/tools";

import type {
  WorkspaceNamespaceCommit,
  WorkspaceNamespaceCommitter,
} from "./workspace-namespace-committer.js";
import {
  namespaceMutationPreview,
  WORKSPACE_NAMESPACE_LIMITS,
} from "./workspace-namespace-preview.js";
import {
  isMissingWorkspacePath,
  mapWorkspaceIoError,
  resolveExistingWorkspaceEntry,
  resolveExistingWorkspacePath,
  resolveWorkspaceCreationPath,
  sameWorkspaceIdentity,
  type WorkspaceObjectIdentity,
  workspacePolicyPath,
} from "./workspace-path.js";
import { encodeUtf8Text } from "./utf8-text.js";

type NamespaceRequest =
  | Readonly<{ operation: "create_directory"; path: string }>
  | Readonly<{ destination: string; operation: "move"; path: string }>
  | Readonly<{ operation: "remove"; path: string }>;

function failure(
  kind: ToolHandlerError["kind"],
): Result<never, ToolHandlerError> {
  return err(Object.freeze({ kind }));
}

function samePath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}

function text(input: StructuredObject, name: string): string {
  const value = input.get(name);
  if (typeof value !== "string") {
    throw new Error("validated namespace input invariant");
  }
  return value;
}

function request(input: StructuredObject): NamespaceRequest {
  const value = input.get("request");
  if (!(value instanceof StructuredObject)) {
    throw new Error("validated namespace request invariant");
  }
  const operation = text(value, "operation");
  if (operation === "create_directory" || operation === "remove") {
    return Object.freeze({ operation, path: text(value, "path") });
  }
  if (operation === "move") {
    return Object.freeze({
      destination: text(value, "destination"),
      operation,
      path: text(value, "path"),
    });
  }
  throw new Error("validated namespace operation invariant");
}

function admittedPath(value: string): boolean {
  const encoded = encodeUtf8Text(value, true);
  return (
    value.length > 0 &&
    value.length <= WORKSPACE_NAMESPACE_LIMITS.pathCodeUnits &&
    encoded.ok &&
    encoded.value.length <= WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes
  );
}

async function absent(target: string): Promise<Result<void, ToolHandlerError>> {
  try {
    await lstat(target);
    return failure("conflict");
  } catch (cause: unknown) {
    return isMissingWorkspacePath(cause)
      ? ok(undefined)
      : err(mapWorkspaceIoError(cause));
  }
}

async function emptyDirectory(
  target: string,
): Promise<Result<void, ToolHandlerError>> {
  let directory: Awaited<ReturnType<typeof opendir>> | undefined;
  let result: Result<void, ToolHandlerError>;
  try {
    directory = await opendir(target);
    result = (await directory.read()) === null
      ? ok(undefined)
      : failure("conflict");
  } catch (cause: unknown) {
    result = err(mapWorkspaceIoError(cause));
  }
  if (directory !== undefined) {
    try {
      await directory.close();
    } catch (cause: unknown) {
      if (result.ok) {
        result = err(mapWorkspaceIoError(cause));
      }
    }
  }
  return result;
}

async function parentSnapshot(
  root: string,
  canonical: string,
): Promise<Result<Readonly<{ canonical: string; identity: WorkspaceObjectIdentity }>, ToolHandlerError>> {
  const relative = workspacePolicyPath(root, path.dirname(canonical));
  return resolveExistingWorkspacePath(root, relative, "directory");
}

function invocation(
  committer: WorkspaceNamespaceCommitter,
  commit: WorkspaceNamespaceCommit,
): ToolHandler {
  return async (_input, cancellation) => {
    const settled = await committer.commit(commit, cancellation);
    return settled.ok
      ? ok(ToolHandlerOutcome.success({ effect: settled.value }))
      : err(settled.error);
  };
}

async function planCreate(
  root: string,
  relative: string,
  committer: WorkspaceNamespaceCommitter,
): Promise<Result<ToolEffectPlan, ToolHandlerError>> {
  const observed = await resolveWorkspaceCreationPath(root, relative);
  if (!observed.ok) {
    return observed;
  }
  const missing = await absent(observed.value.target);
  if (!missing.ok) {
    return missing;
  }
  const checked = await resolveWorkspaceCreationPath(root, relative);
  if (
    !checked.ok ||
    !samePath(checked.value.canonical, observed.value.canonical) ||
    !samePath(checked.value.target, observed.value.target) ||
    !sameWorkspaceIdentity(checked.value.identity, observed.value.identity)
  ) {
    return failure("conflict");
  }
  const stillMissing = await absent(checked.value.target);
  if (!stillMissing.ok) {
    return stillMissing;
  }
  const canonical = workspacePolicyPath(root, checked.value.target);
  const preview = namespaceMutationPreview({
    operation: "create_directory",
    path: canonical,
  });
  if (preview === undefined) {
    return failure("limit");
  }
  const effect = ToolEffectPlan.create(
    preview,
    invocation(committer, Object.freeze({
      kind: "create_directory" as const,
      parentIdentity: checked.value.identity,
      relativePath: canonical,
      root,
    })),
  );
  return effect.ok ? ok(effect.value) : failure("limit");
}

async function planMove(
  root: string,
  sourcePath: string,
  destinationPath: string,
  committer: WorkspaceNamespaceCommitter,
): Promise<Result<ToolEffectPlan, ToolHandlerError>> {
  const source = await resolveExistingWorkspaceEntry(root, sourcePath);
  if (!source.ok) {
    return source;
  }
  const sourceParent = await parentSnapshot(root, source.value.canonical);
  if (!sourceParent.ok) {
    return sourceParent;
  }
  const destination = await resolveWorkspaceCreationPath(root, destinationPath);
  if (!destination.ok) {
    return destination;
  }
  if (
    samePath(source.value.canonical, destination.value.target) ||
    (source.value.kind === "directory" &&
      path.relative(source.value.canonical, destination.value.target) !== "" &&
      !path.relative(source.value.canonical, destination.value.target).startsWith(".." + path.sep) &&
      !path.isAbsolute(path.relative(source.value.canonical, destination.value.target))) ||
    source.value.identity.device !== destination.value.identity.device
  ) {
    return failure("conflict");
  }
  const missing = await absent(destination.value.target);
  if (!missing.ok) {
    return missing;
  }
  const checkedSource = await resolveExistingWorkspaceEntry(root, sourcePath);
  const checkedSourceParent = await parentSnapshot(root, source.value.canonical);
  const checkedDestination = await resolveWorkspaceCreationPath(root, destinationPath);
  if (
    !checkedSource.ok || !checkedSourceParent.ok || !checkedDestination.ok ||
    checkedSource.value.kind !== source.value.kind ||
    !sameWorkspaceIdentity(checkedSource.value.identity, source.value.identity) ||
    !sameWorkspaceIdentity(checkedSourceParent.value.identity, sourceParent.value.identity) ||
    !sameWorkspaceIdentity(checkedDestination.value.identity, destination.value.identity) ||
    !samePath(checkedDestination.value.target, destination.value.target)
  ) {
    return failure("conflict");
  }
  const stillMissing = await absent(checkedDestination.value.target);
  if (!stillMissing.ok) {
    return stillMissing;
  }
  const sourceRelative = workspacePolicyPath(root, checkedSource.value.canonical);
  const destinationRelative = workspacePolicyPath(root, checkedDestination.value.target);
  const preview = namespaceMutationPreview({
    destination: destinationRelative,
    objectKind: source.value.kind,
    operation: "move",
    path: sourceRelative,
  });
  if (preview === undefined) {
    return failure("limit");
  }
  const effect = ToolEffectPlan.create(
    preview,
    invocation(committer, Object.freeze({
      destinationParentIdentity: checkedDestination.value.identity,
      destinationPath: destinationRelative,
      entryKind: checkedSource.value.kind,
      identity: checkedSource.value.identity,
      kind: "move" as const,
      relativePath: sourceRelative,
      root,
      sourceParentIdentity: checkedSourceParent.value.identity,
    })),
  );
  return effect.ok ? ok(effect.value) : failure("limit");
}

async function planRemove(
  root: string,
  relative: string,
  committer: WorkspaceNamespaceCommitter,
): Promise<Result<ToolEffectPlan, ToolHandlerError>> {
  const observed = await resolveExistingWorkspaceEntry(root, relative);
  if (!observed.ok) {
    return observed;
  }
  const parent = await parentSnapshot(root, observed.value.canonical);
  if (!parent.ok) {
    return parent;
  }
  if (observed.value.kind === "directory") {
    const empty = await emptyDirectory(observed.value.canonical);
    if (!empty.ok) {
      return empty;
    }
  }
  const checked = await resolveExistingWorkspaceEntry(root, relative);
  const checkedParent = await parentSnapshot(root, observed.value.canonical);
  if (
    !checked.ok || !checkedParent.ok ||
    checked.value.kind !== observed.value.kind ||
    !sameWorkspaceIdentity(checked.value.identity, observed.value.identity) ||
    !sameWorkspaceIdentity(checkedParent.value.identity, parent.value.identity)
  ) {
    return failure("conflict");
  }
  if (checked.value.kind === "directory") {
    const stillEmpty = await emptyDirectory(checked.value.canonical);
    if (!stillEmpty.ok) {
      return stillEmpty;
    }
  }
  const canonical = workspacePolicyPath(root, checked.value.canonical);
  const preview = namespaceMutationPreview({
    objectKind: checked.value.kind,
    operation: "remove",
    path: canonical,
  });
  if (preview === undefined) {
    return failure("limit");
  }
  const effect = ToolEffectPlan.create(
    preview,
    invocation(committer, Object.freeze({
      entryKind: checked.value.kind,
      identity: checked.value.identity,
      kind: "remove" as const,
      parentIdentity: checkedParent.value.identity,
      relativePath: canonical,
      root,
    })),
  );
  return effect.ok ? ok(effect.value) : failure("limit");
}

/** Plans one exact create, move, or non-recursive remove namespace effect. */
export function managePathPlanner(
  root: string,
  committer: WorkspaceNamespaceCommitter,
): ToolPlanner {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return failure("cancelled");
    }
    const selected = request(input);
    if (
      !admittedPath(selected.path) ||
      (selected.operation === "move" && !admittedPath(selected.destination))
    ) {
      return failure("limit");
    }
    return selected.operation === "create_directory"
      ? planCreate(root, selected.path, committer)
      : selected.operation === "move"
        ? planMove(root, selected.path, selected.destination, committer)
        : planRemove(root, selected.path, committer);
  };
}
