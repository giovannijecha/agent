import path from "node:path";

import { err, ok, type Result } from "@agent/core";

import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";
import { encodeUtf8Text } from "./utf8-text.js";
import type { WorkspaceNamespaceCommitResult } from "./workspace-namespace-committer.js";
import { WORKSPACE_NAMESPACE_LIMITS } from "./workspace-namespace-preview.js";

const HEADER_BYTES = 12;
const FIXED_PAYLOAD_BYTES = 64;
const PROTOCOL_VERSION = 1;
const CREATE_DIRECTORY_KIND = 1;
const MOVE_KIND = 2;
const REMOVE_KIND = 3;
const FILE_KIND = 1;
const DIRECTORY_KIND = 2;
const REQUEST_MAGIC = Object.freeze([0x41, 0x47, 0x4e, 0x43]);
const RESPONSE_MAGIC = Object.freeze([0x41, 0x47, 0x4e, 0x52]);
const MAXIMUM_U64 = (1n << 64n) - 1n;
const ZERO_IDENTITY = Object.freeze({ device: 0n, inode: 0n });

export const PLATFORM_WORKSPACE_NAMESPACE_LIMITS = Object.freeze({
  frameBytes:
    HEADER_BYTES +
    FIXED_PAYLOAD_BYTES +
    BUILTIN_TOOL_LIMITS.pathUtf8Bytes +
    WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes * 2,
  pathUtf8Bytes: WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes,
  responseBytes: HEADER_BYTES,
  rootUtf8Bytes: BUILTIN_TOOL_LIMITS.pathUtf8Bytes,
});

export type PlatformWorkspaceNamespaceProtocolError = Readonly<{
  kind: "invalidFrame" | "invalidRequest" | "invalidText" | "limit";
}>;

export type PlatformWorkspaceNamespaceResponse =
  | Readonly<{
      kind: "failure";
      error: "conflict" | "io" | "limit" | "permission" | "unsupported";
    }>
  | Readonly<{ kind: "success"; result: WorkspaceNamespaceCommitResult }>;

type Identity = Readonly<{ device: bigint; inode: bigint }>;

function failure(
  kind: PlatformWorkspaceNamespaceProtocolError["kind"],
): PlatformWorkspaceNamespaceProtocolError {
  return Object.freeze({ kind });
}

function validIdentity(value: unknown): value is Identity {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Identity>;
  return (
    typeof candidate.device === "bigint" &&
    candidate.device >= 0n &&
    candidate.device <= MAXIMUM_U64 &&
    typeof candidate.inode === "bigint" &&
    candidate.inode >= 0n &&
    candidate.inode <= MAXIMUM_U64
  );
}

function validRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /\p{Cc}/u.test(value)
  ) {
    return false;
  }
  return value.split("/").every(
    (component) =>
      component.length > 0 && component !== "." && component !== "..",
  );
}

function append(output: Uint8Array, offset: number, value: Uint8Array): number {
  output.set(value, offset);
  return offset + value.length;
}

/** Encodes one exact approved native namespace request. */
export function encodePlatformWorkspaceNamespace(
  value: unknown,
): Result<Uint8Array, PlatformWorkspaceNamespaceProtocolError> {
  try {
    if (value === null || typeof value !== "object") {
      return err(failure("invalidRequest"));
    }
    const request = value as Readonly<Record<string, unknown>>;
    const kind = request.kind;
    const rootPath = request.root;
    const relativePathText = request.relativePath;
    if (
      (kind !== "create_directory" && kind !== "move" && kind !== "remove") ||
      typeof rootPath !== "string" ||
      !path.isAbsolute(rootPath) ||
      /\p{Cc}/u.test(rootPath) ||
      typeof relativePathText !== "string" ||
      !validRelativePath(relativePathText)
    ) {
      return err(failure("invalidRequest"));
    }

    let identity: Identity = ZERO_IDENTITY;
    let sourceParentIdentity: Identity;
    let destinationParentIdentity: Identity = ZERO_IDENTITY;
    let destinationPath = "";
    let entryKind = 0;
    if (kind === "create_directory") {
      if (!validIdentity(request.parentIdentity)) {
        return err(failure("invalidRequest"));
      }
      sourceParentIdentity = request.parentIdentity;
    } else {
      if (
        !validIdentity(request.identity) ||
        (request.entryKind !== "file" && request.entryKind !== "directory")
      ) {
        return err(failure("invalidRequest"));
      }
      identity = request.identity;
      entryKind = request.entryKind === "file" ? FILE_KIND : DIRECTORY_KIND;
      if (kind === "move") {
        if (
          !validIdentity(request.sourceParentIdentity) ||
          !validIdentity(request.destinationParentIdentity) ||
          typeof request.destinationPath !== "string" ||
          !validRelativePath(request.destinationPath)
        ) {
          return err(failure("invalidRequest"));
        }
        sourceParentIdentity = request.sourceParentIdentity;
        destinationParentIdentity = request.destinationParentIdentity;
        destinationPath = request.destinationPath;
      } else {
        if (!validIdentity(request.parentIdentity)) {
          return err(failure("invalidRequest"));
        }
        sourceParentIdentity = request.parentIdentity;
      }
    }

    const root = encodeUtf8Text(rootPath, true);
    const relativePath = encodeUtf8Text(relativePathText, true);
    const destination = encodeUtf8Text(destinationPath, true);
    if (!root.ok || !relativePath.ok || !destination.ok) {
      return err(failure("invalidText"));
    }
    if (
      root.value.length === 0 ||
      root.value.length > PLATFORM_WORKSPACE_NAMESPACE_LIMITS.rootUtf8Bytes ||
      relativePath.value.length === 0 ||
      relativePath.value.length > PLATFORM_WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes ||
      destination.value.length > PLATFORM_WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes
    ) {
      return err(failure("limit"));
    }

    const payloadLength =
      FIXED_PAYLOAD_BYTES +
      root.value.length +
      relativePath.value.length +
      destination.value.length;
    const frame = new Uint8Array(HEADER_BYTES + payloadLength);
    frame.set(REQUEST_MAGIC, 0);
    frame.set([
      PROTOCOL_VERSION,
      kind === "create_directory"
        ? CREATE_DIRECTORY_KIND
        : kind === "move"
          ? MOVE_KIND
          : REMOVE_KIND,
      entryKind,
      0,
    ], 4);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    view.setUint32(8, payloadLength, true);
    view.setBigUint64(12, identity.device, true);
    view.setBigUint64(20, identity.inode, true);
    view.setBigUint64(28, sourceParentIdentity.device, true);
    view.setBigUint64(36, sourceParentIdentity.inode, true);
    view.setBigUint64(44, destinationParentIdentity.device, true);
    view.setBigUint64(52, destinationParentIdentity.inode, true);
    view.setUint32(60, root.value.length, true);
    view.setUint32(64, relativePath.value.length, true);
    view.setUint32(68, destination.value.length, true);
    view.setUint32(72, 0, true);
    let offset = HEADER_BYTES + FIXED_PAYLOAD_BYTES;
    offset = append(frame, offset, root.value);
    offset = append(frame, offset, relativePath.value);
    append(frame, offset, destination.value);
    return ok(frame);
  } catch (_cause: unknown) {
    return err(failure("invalidRequest"));
  }
}

/** Decodes one fixed content-free native namespace settlement. */
export function decodePlatformWorkspaceNamespaceResponse(
  value: unknown,
): Result<PlatformWorkspaceNamespaceResponse, PlatformWorkspaceNamespaceProtocolError> {
  try {
    if (
      !(value instanceof Uint8Array) ||
      value.length !== HEADER_BYTES ||
      RESPONSE_MAGIC.some((byte, index) => value.at(index) !== byte) ||
      value.at(4) !== PROTOCOL_VERSION ||
      value.at(6) !== 0 ||
      value.at(7) !== 0 ||
      new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(
        8,
        true,
      ) !== 0
    ) {
      return err(failure("invalidFrame"));
    }
    const status = value.at(5);
    const response = status === 1
      ? Object.freeze({
          kind: "success" as const,
          result: "directory_created" as const,
        })
      : status === 2
        ? Object.freeze({ kind: "success" as const, result: "moved" as const })
        : status === 3
          ? Object.freeze({ kind: "success" as const, result: "removed" as const })
          : status === 4
            ? Object.freeze({ kind: "failure" as const, error: "conflict" as const })
            : status === 5
              ? Object.freeze({ kind: "failure" as const, error: "permission" as const })
              : status === 6
                ? Object.freeze({ kind: "failure" as const, error: "unsupported" as const })
                : status === 7
                  ? Object.freeze({ kind: "failure" as const, error: "limit" as const })
                  : status === 8
                    ? Object.freeze({ kind: "failure" as const, error: "io" as const })
                    : undefined;
    return response === undefined
      ? err(failure("invalidFrame"))
      : ok(response);
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
}
