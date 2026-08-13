import path from "node:path";

import { err, ok, type Result } from "@agent/core";

import { decodeUtf8Text } from "./utf8-text.js";

export const PLATFORM_WORKSPACE_ROOTS_LIMITS = Object.freeze({
  frameBytes: 8_212,
  pathCodeUnits: 4_096,
  pathUtf8Bytes: 4_096,
  payloadBytes: 8_200,
});

const HEADER_BYTES = 12;
const PROTOCOL_VERSION = 1;
const ROOTS_KIND = 1;
const ROOTS_MAGIC = Object.freeze([0x41, 0x47, 0x57, 0x52]);

export type PlatformWorkspaceRoots = Readonly<{
  homeDirectory: string;
  temporaryDirectory: string;
}>;

export type PlatformWorkspaceRootsProtocolError = Readonly<{
  kind: "invalidFrame" | "invalidRoot" | "invalidText" | "limit";
}>;

function failure(
  kind: PlatformWorkspaceRootsProtocolError["kind"],
): PlatformWorkspaceRootsProtocolError {
  return Object.freeze({ kind });
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function readRoot(
  payload: Uint8Array,
  offset: number,
): Result<Readonly<{ nextOffset: number; value: string }>, PlatformWorkspaceRootsProtocolError> {
  if (payload.length - offset < 4) {
    return err(failure("invalidFrame"));
  }
  const length = readU32(payload, offset);
  const start = offset + 4;
  if (
    length === 0 ||
    length > PLATFORM_WORKSPACE_ROOTS_LIMITS.pathUtf8Bytes ||
    length > payload.length - start
  ) {
    return err(failure(length > PLATFORM_WORKSPACE_ROOTS_LIMITS.pathUtf8Bytes ? "limit" : "invalidFrame"));
  }
  const decoded = decodeUtf8Text(payload.slice(start, start + length), true);
  if (!decoded.ok) {
    return err(failure("invalidText"));
  }
  const value = decoded.value;
  if (
    value.length > PLATFORM_WORKSPACE_ROOTS_LIMITS.pathCodeUnits ||
    /\p{Cc}/u.test(value) ||
    !path.isAbsolute(value)
  ) {
    return err(failure("invalidRoot"));
  }
  return ok(Object.freeze({ nextOffset: start + length, value }));
}

/** Decodes the native resolver's one complete, exact roots frame. */
export function decodePlatformWorkspaceRoots(
  value: unknown,
): Result<PlatformWorkspaceRoots, PlatformWorkspaceRootsProtocolError> {
  try {
    if (!(value instanceof Uint8Array)) {
      return err(failure("invalidFrame"));
    }
    if (value.length > PLATFORM_WORKSPACE_ROOTS_LIMITS.frameBytes) {
      return err(failure("limit"));
    }
    if (
      value.length < HEADER_BYTES ||
      ROOTS_MAGIC.some((byte, index) => value.at(index) !== byte) ||
      value.at(4) !== PROTOCOL_VERSION ||
      value.at(5) !== ROOTS_KIND ||
      value.at(6) !== 0 ||
      value.at(7) !== 0
    ) {
      return err(failure("invalidFrame"));
    }
    const payloadLength = readU32(value, 8);
    if (payloadLength > PLATFORM_WORKSPACE_ROOTS_LIMITS.payloadBytes) {
      return err(failure("limit"));
    }
    if (value.length !== HEADER_BYTES + payloadLength) {
      return err(failure("invalidFrame"));
    }
    const payload = value.slice(HEADER_BYTES);
    const home = readRoot(payload, 0);
    if (!home.ok) {
      return home;
    }
    const temporary = readRoot(payload, home.value.nextOffset);
    if (!temporary.ok) {
      return temporary;
    }
    if (
      temporary.value.nextOffset !== payload.length ||
      path.relative(home.value.value, temporary.value.value) === ""
    ) {
      return err(failure("invalidRoot"));
    }
    return ok(
      Object.freeze({
        homeDirectory: home.value.value,
        temporaryDirectory: temporary.value.value,
      }),
    );
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
}
