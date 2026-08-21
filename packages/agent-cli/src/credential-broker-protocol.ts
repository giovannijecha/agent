import { err, ok, type Result } from "@agent/core";

import { decodeUtf8Text, encodeUtf8Text } from "./utf8-text.js";

export const CREDENTIAL_BROKER_LIMITS = Object.freeze({
  frameBytes: 32_780,
  keyCodeUnits: 8_192,
  keyUtf8Bytes: 32_768,
});

const HEADER_BYTES = 12;
const PROTOCOL_VERSION = 1;
const REQUEST_MAGIC = Object.freeze([0x41, 0x47, 0x43, 0x52]);
const RESPONSE_MAGIC = Object.freeze([0x41, 0x47, 0x43, 0x53]);

export type CredentialBrokerRequest =
  | Readonly<{ environmentPresent: boolean; kind: "snapshot" }>
  | Readonly<{ environmentPresent: boolean; kind: "openMutation" }>
  | Readonly<{ key: string; kind: "register" | "replace" }>
  | Readonly<{ kind: "remove" | "cancel" }>;

export type CredentialBrokerResponse =
  | Readonly<{ key: string; kind: "credential" }>
  | Readonly<{
      kind:
        | "absent"
        | "present"
        | "registered"
        | "replaced"
        | "removed"
        | "cancelled"
        | "busy"
        | "dualAuthority"
        | "invalidCredential"
        | "invalidState"
        | "store";
    }>;

export type CredentialBrokerProtocolError = Readonly<{
  kind: "invalidFrame" | "invalidKey" | "limit";
}>;

const REQUEST_KINDS = Object.freeze({
  cancel: 6,
  openMutation: 2,
  register: 3,
  remove: 5,
  replace: 4,
  snapshot: 1,
});

const RESPONSE_KINDS = Object.freeze([
  "absent",
  "credential",
  "present",
  "registered",
  "replaced",
  "removed",
  "cancelled",
  "busy",
  "dualAuthority",
  "invalidCredential",
  "invalidState",
  "store",
] as const);

function requestKind(kind: CredentialBrokerRequest["kind"]): number {
  if (kind === "snapshot") return REQUEST_KINDS.snapshot;
  if (kind === "openMutation") return REQUEST_KINDS.openMutation;
  if (kind === "register") return REQUEST_KINDS.register;
  if (kind === "replace") return REQUEST_KINDS.replace;
  if (kind === "remove") return REQUEST_KINDS.remove;
  return REQUEST_KINDS.cancel;
}

function failure(
  kind: CredentialBrokerProtocolError["kind"],
): CredentialBrokerProtocolError {
  return Object.freeze({ kind });
}

function validKey(value: string, bytes: Uint8Array): boolean {
  return value.length >= 1 &&
    value.length <= CREDENTIAL_BROKER_LIMITS.keyCodeUnits &&
    bytes.length >= 1 &&
    bytes.length <= CREDENTIAL_BROKER_LIMITS.keyUtf8Bytes &&
    !/\s|\p{Cc}/u.test(value);
}

function frame(kind: number, payload: Uint8Array): Uint8Array {
  const output = new Uint8Array(HEADER_BYTES + payload.length);
  output.set(REQUEST_MAGIC, 0);
  output.set([PROTOCOL_VERSION, kind, 0, 0], 4);
  new DataView(
    output.buffer,
    output.byteOffset,
    output.byteLength,
  ).setUint32(8, payload.length, true);
  output.set(payload, HEADER_BYTES);
  return output;
}

/** Encodes one exact private request without path or provider operands. */
export function encodeCredentialBrokerRequest(
  request: CredentialBrokerRequest,
): Result<Uint8Array, CredentialBrokerProtocolError> {
  try {
    if (request.kind === "snapshot" || request.kind === "openMutation") {
      if (typeof request.environmentPresent !== "boolean") {
        return err(failure("invalidFrame"));
      }
      return ok(frame(
        requestKind(request.kind),
        Uint8Array.from([request.environmentPresent ? 1 : 0]),
      ));
    }
    if (request.kind === "register" || request.kind === "replace") {
      const encoded = encodeUtf8Text(request.key, true);
      if (!encoded.ok || !validKey(request.key, encoded.value)) {
        return err(failure("invalidKey"));
      }
      return ok(frame(requestKind(request.kind), encoded.value));
    }
    if (request.kind === "remove" || request.kind === "cancel") {
      return ok(frame(requestKind(request.kind), new Uint8Array()));
    }
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
  return err(failure("invalidFrame"));
}

/** Decodes one complete broker response and validates any exposed key. */
export function decodeCredentialBrokerResponse(
  value: unknown,
): Result<CredentialBrokerResponse, CredentialBrokerProtocolError> {
  try {
    if (
      !(value instanceof Uint8Array) ||
      value.length < HEADER_BYTES ||
      value.length > CREDENTIAL_BROKER_LIMITS.frameBytes ||
      RESPONSE_MAGIC.some((byte, index) => value.at(index) !== byte) ||
      value.at(4) !== PROTOCOL_VERSION ||
      value.at(6) !== 0 ||
      value.at(7) !== 0
    ) {
      return err(failure(
        value instanceof Uint8Array &&
          value.length > CREDENTIAL_BROKER_LIMITS.frameBytes
          ? "limit"
          : "invalidFrame",
      ));
    }
    const payloadLength = new DataView(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).getUint32(8, true);
    if (payloadLength > CREDENTIAL_BROKER_LIMITS.keyUtf8Bytes) {
      return err(failure("limit"));
    }
    if (value.length !== HEADER_BYTES + payloadLength) {
      return err(failure("invalidFrame"));
    }
    const kind = value.at(5);
    if (kind === 2) {
      const decoded = decodeUtf8Text(value.slice(HEADER_BYTES), true);
      if (!decoded.ok || !validKey(decoded.value, value.slice(HEADER_BYTES))) {
        return err(failure("invalidKey"));
      }
      return ok(Object.freeze({ key: decoded.value, kind: "credential" as const }));
    }
    const name = kind === undefined ? undefined : RESPONSE_KINDS.at(kind - 1);
    if (name === undefined || name === "credential" || payloadLength !== 0) {
      return err(failure("invalidFrame"));
    }
    return ok(Object.freeze({ kind: name }));
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
}
