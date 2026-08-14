import { createHash } from "node:crypto";
import { lstat, open, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  err,
  ok,
  type Result,
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
import {
  createMutationPreview,
  replaceMutationPreview,
} from "./workspace-mutation-preview.js";
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
  parent: string;
  parentIdentity: WorkspaceObjectIdentity;
  relative: string;
  target: string;
}>;

type ObservedFileSnapshot = Readonly<{
  content: string;
  digest: string;
  identity: WorkspaceObjectIdentity;
  relative: string;
  target: string;
}>;

type ReplaceEffectSnapshot = ObservedFileSnapshot & Readonly<{
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

function digest(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content.charAt(index) === "\n") {
      line += 1;
    }
  }
  return line;
}

async function writeFileHandleComplete(
  handle: Awaited<ReturnType<typeof open>>,
  content: string,
): Promise<Result<void, ToolHandlerError>> {
  const bytes = encodeUtf8(content);
  let offset = 0;
  while (offset < bytes.length) {
    const written = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (
      !Number.isSafeInteger(written.bytesWritten) ||
      written.bytesWritten < 1 ||
      written.bytesWritten > bytes.length - offset
    ) {
      return toolFailure("io");
    }
    offset += written.bytesWritten;
  }
  await handle.truncate(bytes.length);
  return ok(undefined);
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

function encodeUtf8(content: string): Uint8Array {
  const bytes = new Uint8Array(content.length * 3);
  let offset = 0;
  for (const character of content) {
    let point = character.codePointAt(0) ?? 0xfffd;
    if (point >= 0xd800 && point <= 0xdfff) {
      point = 0xfffd;
    }
    if (point <= 0x7f) {
      bytes.set([point], offset);
      offset += 1;
    } else if (point <= 0x7ff) {
      bytes.set([0xc0 | (point >> 6), 0x80 | (point & 0x3f)], offset);
      offset += 2;
    } else if (point <= 0xffff) {
      bytes.set(
        [
          0xe0 | (point >> 12),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        ],
        offset,
      );
      offset += 3;
    } else {
      bytes.set(
        [
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        ],
        offset,
      );
      offset += 4;
    }
  }
  return bytes.slice(0, offset);
}

function sameCanonicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}

function createInvocation(
  root: string,
  snapshot: CreateEffectSnapshot,
): ToolHandler {
  return async (_input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const current = await resolveWorkspaceCreationPath(
      root,
      snapshot.relative,
    );
    if (
      !current.ok ||
      !sameCanonicalPath(current.value.canonical, snapshot.parent) ||
      !sameCanonicalPath(current.value.target, snapshot.target) ||
      !sameWorkspaceIdentity(current.value.identity, snapshot.parentIdentity)
    ) {
      return toolFailure("conflict");
    }
    try {
      await lstat(current.value.target);
      return toolFailure("conflict");
    } catch (cause: unknown) {
      if (!isMissingWorkspacePath(cause)) {
        return toolFailure("conflict");
      }
    }
    const checked = await resolveWorkspaceCreationPath(root, snapshot.relative);
    if (
      !checked.ok ||
      !sameCanonicalPath(checked.value.canonical, snapshot.parent) ||
      !sameCanonicalPath(checked.value.target, snapshot.target) ||
      !sameWorkspaceIdentity(checked.value.identity, snapshot.parentIdentity)
    ) {
      return toolFailure("conflict");
    }
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    try {
      await writeFile(snapshot.target, snapshot.content, {
        encoding: "utf8",
        flag: "wx",
      });
      return toolSuccess({ created: true });
    } catch (cause: unknown) {
      return err(mapWorkspaceIoError(cause));
    }
  };
}

async function observeCreate(
  root: string,
  relative: string,
  content: string,
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
      content,
      digest: digest(content),
      parent: observed.value.canonical,
      parentIdentity: observed.value.identity,
      relative: workspacePolicyPath(root, observed.value.target),
      target: observed.value.target,
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
    } else if (
      status.size > BigInt(BUILTIN_TOOL_LIMITS.fileUtf8Bytes)
    ) {
      result = toolFailure("limit");
    } else {
      const bytes = await readFileHandleBounded(handle);
      if (!bytes.ok) {
        result = bytes;
      } else {
        const decoded = decodeUtf8Text(bytes.value);
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
              target: resolved.value.canonical,
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
  root: string,
  snapshot: ReplaceEffectSnapshot,
): ToolHandler {
  return async (_input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const resolved = await resolveExistingWorkspacePath(
      root,
      snapshot.relative,
      "file",
    );
    if (
      !resolved.ok ||
      !sameCanonicalPath(resolved.value.canonical, snapshot.target) ||
      !sameWorkspaceIdentity(resolved.value.identity, snapshot.identity)
    ) {
      return toolFailure("conflict");
    }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let result: Result<ToolHandlerOutcome, ToolHandlerError>;
    try {
      handle = await open(resolved.value.canonical, "r+");
      const status = await handle.stat({ bigint: true });
      const handleIdentity = Object.freeze({
        device: status.dev,
        inode: status.ino,
      });
      const bytes = await readFileHandleBounded(handle);
      if (!bytes.ok) {
        result = bytes.error.kind === "limit"
          ? toolFailure("conflict")
          : bytes;
      } else {
        const decoded = decodeUtf8Text(bytes.value);
        const checked = await resolveExistingWorkspacePath(
          root,
          snapshot.relative,
          "file",
        );
        const finalStatus = await handle.stat({ bigint: true });
        const finalIdentity = Object.freeze({
          device: finalStatus.dev,
          inode: finalStatus.ino,
        });
        if (
          !status.isFile() ||
          !sameWorkspaceIdentity(handleIdentity, snapshot.identity) ||
          !decoded.ok ||
          decoded.value !== snapshot.content ||
          !checked.ok ||
          !sameCanonicalPath(checked.value.canonical, snapshot.target) ||
          !sameWorkspaceIdentity(checked.value.identity, snapshot.identity) ||
          !sameWorkspaceIdentity(finalIdentity, snapshot.identity)
        ) {
          result = toolFailure("conflict");
        } else if (cancellation.requested) {
          result = toolFailure("cancelled");
        } else {
          const written = await writeFileHandleComplete(
            handle,
            snapshot.replacement,
          );
          result = written.ok
            ? toolSuccess({ replacements: 1 })
            : written;
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
  };
}

/** Plans one bounded absent-target creation and binds invocation to its parent. */
export function createFilePlanner(root: string): ToolPlanner {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const observed = await observeCreate(
      root,
      text(input, "path"),
      text(input, "content"),
    );
    if (!observed.ok) {
      return observed;
    }
    const preview = createMutationPreview({
      content: observed.value.content,
      digest: observed.value.digest,
      path: observed.value.relative,
    });
    if (preview === undefined) {
      return toolFailure("limit");
    }
    const planned = ToolEffectPlan.create(
      preview,
      createInvocation(root, observed.value),
    );
    return planned.ok ? ok(planned.value) : toolFailure("limit");
  };
}

/** Plans one exact replacement and binds invocation to identity and content. */
export function replaceTextPlanner(root: string): ToolPlanner {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const oldText = text(input, "oldText");
    const newText = text(input, "newText");
    const observed = await readObservedFile(root, text(input, "path"));
    if (!observed.ok) {
      return observed;
    }
    const first = observed.value.content.indexOf(oldText);
    const second = first < 0
      ? -1
      : observed.value.content.indexOf(oldText, first + oldText.length);
    if (first < 0 || second >= 0) {
      return toolFailure("conflict");
    }
    const replacement =
      observed.value.content.slice(0, first) +
      newText +
      observed.value.content.slice(first + oldText.length);
    if (replacement.length > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
      return toolFailure("limit");
    }
    const snapshot = Object.freeze({
      ...observed.value,
      replacement,
      replacementDigest: digest(replacement),
    });
    const line = lineAt(observed.value.content, first);
    const preview = replaceMutationPreview({
      line,
      newText,
      observedDigest: snapshot.digest,
      oldText,
      path: snapshot.relative,
      resultingDigest: snapshot.replacementDigest,
    });
    if (preview === undefined) {
      return toolFailure("limit");
    }
    const planned = ToolEffectPlan.create(
      preview,
      replaceInvocation(root, snapshot),
    );
    return planned.ok ? ok(planned.value) : toolFailure("limit");
  };
}
