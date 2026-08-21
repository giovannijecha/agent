import { err, ok, type Result } from "@agent/core";

import { decodeUtf8Text, encodeUtf8Text } from "./utf8-text.js";

export const CREDENTIAL_BROKER_LIMITS = Object.freeze({
  frameBytes: 65_824,
  keyCodeUnits: 8_192,
  keyUtf8Bytes: 32_768,
  openAIPayloadBytes: 65_812,
  openAIAccountBytes: 256,
  openAITokenBytes: 32_768,
});

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;
const OPENAI_ENVELOPE_BYTES = 20;

const HEADER_BYTES = 12;
const PROTOCOL_VERSION = 1;
const REQUEST_MAGIC = Object.freeze([0x41, 0x47, 0x43, 0x52]);
const RESPONSE_MAGIC = Object.freeze([0x41, 0x47, 0x43, 0x53]);

export type CredentialBrokerRequest =
  | Readonly<{ environmentPresent: boolean; kind: "snapshot" }>
  | Readonly<{ environmentPresent: boolean; kind: "openMutation" }>
  | Readonly<{ key: string; kind: "register" | "replace" }>
  | Readonly<{ kind: "remove" | "cancel" }>
  | Readonly<{ kind: "openAISnapshot" | "openAIMutation" }>
  | Readonly<{
      credential: OpenAICredential;
      kind: "registerOpenAI" | "replaceOpenAI";
    }>
  | Readonly<{ kind: "removeOpenAI" | "cancelOpenAI" }>;

export type OpenAICredential = Readonly<{
  accessToken: string;
  accountId: string;
  expiresAt: number;
  refreshToken: string;
}>;

export type CredentialBrokerResponse =
  | Readonly<{ key: string; kind: "credential" }>
  | Readonly<{
      credential: OpenAICredential;
      kind: "openAICredential";
    }>
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
  cancelOpenAI: 12,
  cancel: 6,
  openAIMutation: 8,
  openAISnapshot: 7,
  openMutation: 2,
  registerOpenAI: 9,
  register: 3,
  removeOpenAI: 11,
  remove: 5,
  replaceOpenAI: 10,
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
  "openAICredential",
] as const);

function requestKind(kind: CredentialBrokerRequest["kind"]): number {
  if (kind === "snapshot") return REQUEST_KINDS.snapshot;
  if (kind === "openMutation") return REQUEST_KINDS.openMutation;
  if (kind === "register") return REQUEST_KINDS.register;
  if (kind === "replace") return REQUEST_KINDS.replace;
  if (kind === "remove") return REQUEST_KINDS.remove;
  if (kind === "cancel") return REQUEST_KINDS.cancel;
  if (kind === "openAISnapshot") return REQUEST_KINDS.openAISnapshot;
  if (kind === "openAIMutation") return REQUEST_KINDS.openAIMutation;
  if (kind === "registerOpenAI") return REQUEST_KINDS.registerOpenAI;
  if (kind === "replaceOpenAI") return REQUEST_KINDS.replaceOpenAI;
  if (kind === "removeOpenAI") return REQUEST_KINDS.removeOpenAI;
  return REQUEST_KINDS.cancelOpenAI;
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

function visibleAscii(value: string, maximum: number): Uint8Array | undefined {
  if (value.length < 1 || value.length > maximum) return undefined;
  const encoded = encodeUtf8Text(value);
  if (!encoded.ok) return undefined;
  const bytes = encoded.value;
  if (bytes.length !== value.length) return undefined;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes.at(index);
    if (byte === undefined || byte < 0x21 || byte > 0x7e) return undefined;
  }
  return bytes;
}

function decodeVisibleAscii(
  bytes: Uint8Array,
  maximum: number,
): string | undefined {
  if (bytes.length < 1 || bytes.length > maximum) return undefined;
  let value = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes.at(index);
    if (byte === undefined || byte < 0x21 || byte > 0x7e) return undefined;
    value += String.fromCharCode(byte);
  }
  return value;
}

function encodeOpenAICredential(
  credential: OpenAICredential,
): Uint8Array | undefined {
  if (
    credential === null || typeof credential !== "object" ||
    typeof credential.accessToken !== "string" ||
    typeof credential.refreshToken !== "string" ||
    typeof credential.accountId !== "string" ||
    typeof credential.expiresAt !== "number" ||
    !Number.isSafeInteger(credential.expiresAt) ||
    credential.expiresAt < 1 || credential.expiresAt > MAX_SAFE_INTEGER
  ) {
    return undefined;
  }
  const access = visibleAscii(
    credential.accessToken,
    CREDENTIAL_BROKER_LIMITS.openAITokenBytes,
  );
  const refresh = visibleAscii(
    credential.refreshToken,
    CREDENTIAL_BROKER_LIMITS.openAITokenBytes,
  );
  const account = visibleAscii(
    credential.accountId,
    CREDENTIAL_BROKER_LIMITS.openAIAccountBytes,
  );
  if (access === undefined || refresh === undefined || account === undefined) {
    return undefined;
  }
  const payload = new Uint8Array(
    OPENAI_ENVELOPE_BYTES + access.length + refresh.length + account.length,
  );
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  view.setUint32(0, access.length, true);
  view.setUint32(4, refresh.length, true);
  view.setUint32(8, account.length, true);
  view.setBigUint64(12, BigInt(credential.expiresAt), true);
  payload.set(access, OPENAI_ENVELOPE_BYTES);
  payload.set(refresh, OPENAI_ENVELOPE_BYTES + access.length);
  payload.set(account, OPENAI_ENVELOPE_BYTES + access.length + refresh.length);
  return payload;
}

function decodeOpenAICredential(
  payload: Uint8Array,
): OpenAICredential | undefined {
  if (
    payload.length < OPENAI_ENVELOPE_BYTES + 3 ||
    payload.length > CREDENTIAL_BROKER_LIMITS.openAIPayloadBytes
  ) {
    return undefined;
  }
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const accessLength = view.getUint32(0, true);
  const refreshLength = view.getUint32(4, true);
  const accountLength = view.getUint32(8, true);
  const expiresAt = Number(view.getBigUint64(12, true));
  const expected = OPENAI_ENVELOPE_BYTES + accessLength + refreshLength +
    accountLength;
  if (expected !== payload.length || !Number.isSafeInteger(expiresAt)) {
    return undefined;
  }
  const accessStart = OPENAI_ENVELOPE_BYTES;
  const refreshStart = accessStart + accessLength;
  const accountStart = refreshStart + refreshLength;
  const access = payload.slice(accessStart, refreshStart);
  const refresh = payload.slice(refreshStart, accountStart);
  const account = payload.slice(accountStart);
  const accessToken = decodeVisibleAscii(
    access,
    CREDENTIAL_BROKER_LIMITS.openAITokenBytes,
  );
  const refreshToken = decodeVisibleAscii(
    refresh,
    CREDENTIAL_BROKER_LIMITS.openAITokenBytes,
  );
  const accountId = decodeVisibleAscii(
    account,
    CREDENTIAL_BROKER_LIMITS.openAIAccountBytes,
  );
  if (
    accessToken === undefined || refreshToken === undefined ||
    accountId === undefined ||
    expiresAt < 1 || expiresAt > MAX_SAFE_INTEGER
  ) {
    return undefined;
  }
  return Object.freeze({ accessToken, accountId, expiresAt, refreshToken });
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
    if (
      request.kind === "registerOpenAI" || request.kind === "replaceOpenAI"
    ) {
      const encoded = encodeOpenAICredential(request.credential);
      return encoded === undefined
        ? err(failure("invalidKey"))
        : ok(frame(requestKind(request.kind), encoded));
    }
    if (
      request.kind === "openAISnapshot" ||
      request.kind === "openAIMutation" ||
      request.kind === "removeOpenAI" || request.kind === "cancelOpenAI"
    ) {
      return ok(frame(requestKind(request.kind), new Uint8Array()));
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
    if (payloadLength > CREDENTIAL_BROKER_LIMITS.openAIPayloadBytes) {
      return err(failure("limit"));
    }
    if (value.length !== HEADER_BYTES + payloadLength) {
      return err(failure("invalidFrame"));
    }
    const kind = value.at(5);
    if (kind === 2) {
      if (payloadLength > CREDENTIAL_BROKER_LIMITS.keyUtf8Bytes) {
        return err(failure("limit"));
      }
      const decoded = decodeUtf8Text(value.slice(HEADER_BYTES), true);
      if (!decoded.ok || !validKey(decoded.value, value.slice(HEADER_BYTES))) {
        return err(failure("invalidKey"));
      }
      return ok(Object.freeze({ key: decoded.value, kind: "credential" as const }));
    }
    if (kind === 13) {
      const credential = decodeOpenAICredential(value.slice(HEADER_BYTES));
      return credential === undefined
        ? err(failure("invalidKey"))
        : ok(Object.freeze({
            credential,
            kind: "openAICredential" as const,
          }));
    }
    const name = kind === undefined ? undefined : RESPONSE_KINDS.at(kind - 1);
    if (
      name === undefined || name === "credential" ||
      name === "openAICredential" || payloadLength !== 0
    ) {
      return err(failure("invalidFrame"));
    }
    return ok(Object.freeze({ kind: name }));
  } catch (_cause: unknown) {
    return err(failure("invalidFrame"));
  }
}
