import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

import {
  err,
  ok,
  type Result,
  StructuredList,
  StructuredObject,
} from "@agent/core";
import {
  ToolEffectPlan,
  type ToolHandler,
  type ToolHandlerError,
  ToolHandlerOutcome,
  type ToolPlanner,
} from "@agent/tools";

import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";
import { decodeUtf8Text } from "./utf8-text.js";
import type { WorkspaceMutationCommitter } from "./workspace-mutation-committer.js";
import { patchMutationPreview } from "./workspace-mutation-preview.js";
import {
  applyTextPatch,
  createTextPatch,
  validateTextPatchHunks,
  type TextPatchApplication,
  type TextPatchError,
  type TextPatchHunk,
} from "./workspace-text-patch.js";
import {
  isMissingWorkspacePath,
  mapWorkspaceIoError,
  resolveExistingWorkspacePath,
  resolveWorkspaceCreationPath,
  sameWorkspaceIdentity,
  type WorkspaceObjectIdentity,
  workspacePolicyPath,
} from "./workspace-path.js";

type CreateEffectSnapshot = Readonly<{
  content: string;
  digest: string;
  hunkCount: number;
  parentIdentity: WorkspaceObjectIdentity;
  relative: string;
}>;

type ObservedFileSnapshot = Readonly<{
  content: string;
  digest: string;
  identity: WorkspaceObjectIdentity;
  relative: string;
}>;

type ReplaceEffectSnapshot = ObservedFileSnapshot & Readonly<{
  hunkCount: number;
  replacement: string;
  replacementDigest: string;
}>;

function toolFailure(
  kind: ToolHandlerError["kind"],
): Result<never, ToolHandlerError> {
  return err(Object.freeze({ kind }));
}

function toolSuccess(
  output: unknown,
): Result<ToolHandlerOutcome, ToolHandlerError> {
  return ok(ToolHandlerOutcome.success(output));
}

function text(input: StructuredObject, name: string): string {
  const value = input.get(name);
  if (typeof value !== "string") {
    throw new Error("validated mutation input invariant");
  }
  return value;
}

function patchHunks(input: StructuredObject): readonly TextPatchHunk[] {
  const value = input.get("hunks");
  if (!(value instanceof StructuredList)) {
    throw new Error("validated patch hunk list invariant");
  }
  const hunks: TextPatchHunk[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value.values.at(index);
    if (!(item instanceof StructuredObject)) {
      throw new Error("validated patch hunk invariant");
    }
    hunks.push(
      Object.freeze({
        newText: text(item, "newText"),
        oldText: text(item, "oldText"),
      }),
    );
  }
  return Object.freeze(hunks);
}

function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function patchFailure(
  error: TextPatchError,
): Result<never, ToolHandlerError> {
  return toolFailure(error.kind);
}

async function readFileHandleBounded(
  handle: Awaited<ReturnType<typeof open>>,
): Promise<Result<Uint8Array, ToolHandlerError>> {
  const bytes = new Uint8Array(BUILTIN_TOOL_LIMITS.fileUtf8Bytes + 1);
  let offset = 0;
  try {
    while (offset < bytes.length) {
      const read = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (
        !Number.isSafeInteger(read.bytesRead) ||
        read.bytesRead < 0 ||
        read.bytesRead > bytes.length - offset
      ) {
        return toolFailure("io");
      }
      if (read.bytesRead === 0) {
        return ok(bytes.slice(0, offset));
      }
      offset += read.bytesRead;
    }
    return toolFailure("limit");
  } catch (cause: unknown) {
    return err(mapWorkspaceIoError(cause));
  }
}

function sameCanonicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}

function createInvocation(
  committer: WorkspaceMutationCommitter,
  root: string,
  snapshot: CreateEffectSnapshot,
): ToolHandler {
  return async (_input, cancellation) => {
    const committed = await committer.commit(
      Object.freeze({
        content: snapshot.content,
        identity: snapshot.parentIdentity,
        kind: "create" as const,
        relativePath: snapshot.relative,
        root,
      }),
      cancellation,
    );
    return committed.ok
      ? toolSuccess({ effect: "created", hunks: snapshot.hunkCount })
      : err(committed.error);
  };
}

async function observeCreate(
  root: string,
  relative: string,
  application: TextPatchApplication,
): Promise<Result<CreateEffectSnapshot, ToolHandlerError>> {
  const observed = await resolveWorkspaceCreationPath(root, relative);
  if (!observed.ok) {
    return observed;
  }
  try {
    await lstat(observed.value.target);
    return toolFailure("conflict");
  } catch (cause: unknown) {
    if (!isMissingWorkspacePath(cause)) {
      return err(mapWorkspaceIoError(cause));
    }
  }
  const checked = await resolveWorkspaceCreationPath(root, relative);
  if (
    !checked.ok ||
    !sameCanonicalPath(checked.value.canonical, observed.value.canonical) ||
    !sameCanonicalPath(checked.value.target, observed.value.target) ||
    !sameWorkspaceIdentity(checked.value.identity, observed.value.identity)
  ) {
    return toolFailure("conflict");
  }
  return ok(
    Object.freeze({
      content: application.replacement,
      digest: digest(application.replacement),
      hunkCount: application.hunkCount,
      parentIdentity: observed.value.identity,
      relative: workspacePolicyPath(root, observed.value.target),
    }),
  );
}

async function readObservedFile(
  root: string,
  relative: string,
): Promise<Result<ObservedFileSnapshot, ToolHandlerError>> {
  const resolved = await resolveExistingWorkspacePath(root, relative, "file");
  if (!resolved.ok) {
    return resolved;
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let result: Result<ObservedFileSnapshot, ToolHandlerError>;
  try {
    handle = await open(resolved.value.canonical, "r");
    const status = await handle.stat({ bigint: true });
    const handleIdentity = Object.freeze({
      device: status.dev,
      inode: status.ino,
    });
    if (
      !status.isFile() ||
      !sameWorkspaceIdentity(handleIdentity, resolved.value.identity)
    ) {
      result = toolFailure("conflict");
    } else if (status.size > BigInt(BUILTIN_TOOL_LIMITS.fileUtf8Bytes)) {
      result = toolFailure("limit");
    } else {
      const bytes = await readFileHandleBounded(handle);
      if (!bytes.ok) {
        result = bytes;
      } else {
        const decoded = decodeUtf8Text(bytes.value, true);
        const checked = await resolveExistingWorkspacePath(
          root,
          relative,
          "file",
        );
        const finalStatus = await handle.stat({ bigint: true });
        const finalIdentity = Object.freeze({
          device: finalStatus.dev,
          inode: finalStatus.ino,
        });
        if (
          !decoded.ok ||
          decoded.value.length > BUILTIN_TOOL_LIMITS.fileCodeUnits ||
          !checked.ok ||
          !sameCanonicalPath(
            checked.value.canonical,
            resolved.value.canonical,
          ) ||
          !sameWorkspaceIdentity(
            checked.value.identity,
            resolved.value.identity,
          ) ||
          !sameWorkspaceIdentity(finalIdentity, resolved.value.identity)
        ) {
          result = toolFailure(
            decoded.ok &&
                decoded.value.length > BUILTIN_TOOL_LIMITS.fileCodeUnits
              ? "limit"
              : decoded.ok
                ? "conflict"
                : "unsupported",
          );
        } else {
          result = ok(
            Object.freeze({
              content: decoded.value,
              digest: digest(decoded.value),
              identity: resolved.value.identity,
              relative: workspacePolicyPath(root, resolved.value.canonical),
            }),
          );
        }
      }
    }
  } catch (cause: unknown) {
    result = err(mapWorkspaceIoError(cause));
  }
  if (handle !== undefined) {
    try {
      await handle.close();
    } catch (cause: unknown) {
      if (result.ok) {
        result = err(mapWorkspaceIoError(cause));
      }
    }
  }
  return result;
}

function replaceInvocation(
  committer: WorkspaceMutationCommitter,
  root: string,
  snapshot: ReplaceEffectSnapshot,
): ToolHandler {
  return async (_input, cancellation) => {
    const committed = await committer.commit(
      Object.freeze({
        expectedContent: snapshot.content,
        identity: snapshot.identity,
        kind: "replace" as const,
        relativePath: snapshot.relative,
        replacement: snapshot.replacement,
        root,
      }),
      cancellation,
    );
    return committed.ok
      ? toolSuccess({ effect: "updated", hunks: snapshot.hunkCount })
      : err(committed.error);
  };
}

/** Plans one structured create-or-update patch and binds one native commit. */
export function applyPatchPlanner(
  root: string,
  committer: WorkspaceMutationCommitter,
): ToolPlanner {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const relative = text(input, "path");
    const hunks = patchHunks(input);
    const validated = validateTextPatchHunks(hunks);
    if (!validated.ok) {
      return patchFailure(validated.error);
    }
    const observed = await readObservedFile(root, relative);
    if (!observed.ok && observed.error.kind !== "notFound") {
      return observed;
    }

    if (!observed.ok) {
      const applied = createTextPatch(hunks);
      if (!applied.ok) {
        return patchFailure(applied.error);
      }
      const snapshot = await observeCreate(root, relative, applied.value);
      if (!snapshot.ok) {
        return snapshot;
      }
      const preview = patchMutationPreview({
        addedLines: applied.value.addedLines,
        effect: "create",
        hunks,
        path: snapshot.value.relative,
        removedLines: applied.value.removedLines,
        resultingDigest: snapshot.value.digest,
      });
      if (preview === undefined) {
        return toolFailure("limit");
      }
      const planned = ToolEffectPlan.create(
        preview,
        createInvocation(committer, root, snapshot.value),
      );
      return planned.ok ? ok(planned.value) : toolFailure("limit");
    }

    const applied = applyTextPatch(observed.value.content, hunks);
    if (!applied.ok) {
      return patchFailure(applied.error);
    }
    const snapshot = Object.freeze({
      ...observed.value,
      hunkCount: applied.value.hunkCount,
      replacement: applied.value.replacement,
      replacementDigest: digest(applied.value.replacement),
    });
    const preview = patchMutationPreview({
      addedLines: applied.value.addedLines,
      effect: "update",
      hunks,
      observedDigest: snapshot.digest,
      path: snapshot.relative,
      removedLines: applied.value.removedLines,
      resultingDigest: snapshot.replacementDigest,
    });
    if (preview === undefined) {
      return toolFailure("limit");
    }
    const planned = ToolEffectPlan.create(
      preview,
      replaceInvocation(committer, root, snapshot),
    );
    return planned.ok ? ok(planned.value) : toolFailure("limit");
  };
}
