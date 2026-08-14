import path from "node:path";

import { err, ok, type Result } from "@agent/core";

import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";
import { encodeUtf8Text } from "./utf8-text.js";
import type {
  WorkspaceMutationCommit,
  WorkspaceMutationCommitResult,
} from "./workspace-mutation-committer.js";

const HEADER_BYTES = 12;
const FIXED_PAYLOAD_BYTES = 32;
const PROTOCOL_VERSION = 1;
const CREATE_KIND = 1;
const REPLACE_KIND = 2;
const REQUEST_MAGIC = Object.freeze([0x41, 0x47, 0x4d, 0x43]);
const RESPONSE_MAGIC = Object.freeze([0x41, 0x47, 0x4d, 0x52]);
const MAXIMUM_U64 = (1n << 64n) - 1n;

export const PLATFORM_WORKSPACE_MUTATION_LIMITS = Object.freeze({
  contentUtf8Bytes: BUILTIN_TOOL_LIMITS.fileUtf8Bytes,
  frameBytes:
    HEADER_BYTES +
    FIXED_PAYLOAD_BYTES +
    BUILTIN_TOOL_LIMITS.pathUtf8Bytes * 2 +
    BUILTIN_TOOL_LIMITS.fileUtf8Bytes * 2,
  pathUtf8Bytes: BUILTIN_TOOL_LIMITS.pathUtf8Bytes,
  responseBytes: HEADER_BYTES,
});

export type PlatformWorkspaceMutationProtocolError = Readonly<{
  kind: "invalidFrame" | "invalidRequest" | "invalidText" | "limit";
}>;

export type PlatformWorkspaceMutationResponse =
  | Readonly<{ kind: "failure"; error: "conflict" | "io" | "limit" | "permission" | "unsupported" }>
  | Readonly<{ kind: "success"; result: WorkspaceMutationCommitResult }>;

function failure(
  kind: PlatformWorkspaceMutationProtocolError["kind"],
): PlatformWorkspaceMutationProtocolError {
  return Object.freeze({ kind });
}

function validIdentity(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= MAXIMUM_U64;
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
  const components = value.split("/");
  return components.every(
    (component) =>
      component.length > 0 && component !== "." && component !== "..",
  );
}

function append(
  output: Uint8Array,
  offset: number,
  value: Uint8Array,
): number {
  output.set(value, offset);
  return offset + value.length;
}

/** Encodes one exact approved native mutation request. */
export function encodePlatformWorkspaceMutation(
  value: unknown,
): Result<Uint8Array, PlatformWorkspaceMutationProtocolError> {
  try {
    if (value === null || typeof value !== "object") {
      return err(failure("invalidRequest"));
    }
    const request = value as Partial<WorkspaceMutationCommit>;
    if (
      (request.kind !== "create" && request.kind !== "replace") ||
      typeof request.root !== "string" ||
      !path.isAbsolute(request.root) ||
      /\p{Cc}/u.test(request.root) ||
      typeof request.relativePath !== "string" ||
      !validRelativePath(request.relativePath) ||
      request.identity === undefined ||
      !validIdentity(request.identity.device) ||
      !validIdentity(request.identity.inode)
    ) {
      return err(failure("invalidRequest"));
    }
    const root = encodeUtf8Text(request.root, true);
    const relativePath = encodeUtf8Text(request.relativePath, true);
    const expected = encodeUtf8Text(
      request.kind === "replace" ? request.expectedContent : "",
      true,
    );
    const replacement = encodeUtf8Text(
      request.kind === "replace"
        ? request.replacement
        : "content" in request
          ? request.content
          : undefined,
      true,
    );
    if (!root.ok || !relativePath.ok || !expected.ok || !replacement.ok) {
      return err(failure("invalidText"));
    }
    if (
      root.value.length === 0 ||
      root.value.length > PLATFORM_WORKSPACE_MUTATION_LIMITS.pathUtf8Bytes ||
      relativePath.value.length === 0 ||
      relativePath.value.length > PLATFORM_WORKSPACE_MUTATION_LIMITS.pathUtf8Bytes ||
      expected.value.length > PLATFORM_WORKSPACE_MUTATION_LIMITS.contentUtf8Bytes ||
      replacement.value.length > PLATFORM_WORKSPACE_MUTATION_LIMITS.contentUtf8Bytes
    ) {
      return err(failure("limit"));
    }
    const payloadLength =
      FIXED_PAYLOAD_BYTES +
      root.value.length +
      relativePath.value.length +
      expected.value.length +
      replacement.value.length;
    const frame = new Uint8Array(HEADER_BYTES + payloadLength);
    frame.set(REQUEST_MAGIC, 0);
    frame.set([
      PROTOCOL_VERSION,
      request.kind === "create" ? CREATE_KIND : REPLACE_KIND,
      0,
      0,
    ], 4);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    view.setUint32(8, payloadLength, true);
    view.setBigUint64(12, request.identity.device, true);
    view.setBigUint64(20, request.identity.inode, true);
    view.setUint32(28, root.value.length, true);
    view.setUint32(32, relativePath.value.length, true);
    view.setUint32(36, expected.value.length, true);
    view.setUint32(40, replacement.value.length, true);
    let offset = HEADER_BYTES + FIXED_PAYLOAD_BYTES;
    offset = append(frame, offset, root.value);
    offset = append(frame, offset, relativePath.value);
    offset = append(frame, offset, expected.value);
    append(frame, offset, replacement.value);
    return ok(frame);
  } catch (_cause: unknown) {
    return err(failure("invalidRequest"));
  }
}

/** Decodes one fixed content-free native mutation settlement. */
export function decodePlatformWorkspaceMutationResponse(
  value: unknown,
): Result<PlatformWorkspaceMutationResponse, PlatformWorkspaceMutationProtocolError> {
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
      ? Object.freeze({ kind: "success" as const, result: "created" as const })
      : status === 2
        ? Object.freeze({ kind: "success" as const, result: "replaced" as const })
        : status === 3
          ? Object.freeze({ kind: "failure" as const, error: "conflict" as const })
          : status === 4
            ? Object.freeze({ kind: "failure" as const, error: "permission" as const })
            : status === 5
              ? Object.freeze({ kind: "failure" as const, error: "unsupported" as const })
              : status === 6
                ? Object.freeze({ kind: "failure" as const, error: "limit" as const })
                : status === 7
                  ? Object.freeze({ kind: "failure" as const, error: "io" as const })
                  : undefined;
    return response === undefined
      ? err(failure("invalidFrame"))
      : ok(response);
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
}
