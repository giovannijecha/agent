import {
  createHash,
} from "node:crypto";
import {
  request as nodeHttpsRequest,
  type ClientRequest,
  type IncomingMessage,
  type RequestOptions,
} from "node:https";

import { err, ok, type Result } from "@agent/core";

import type { OpenAICredential } from "./credential-broker-protocol.js";
import { NodeTimerClock } from "./node-timer-clock.js";
import type { ScheduledTimer, TimerClock } from "./timer-clock.js";
import { decodeUtf8Text } from "./utf8-text.js";

export const OPENAI_DEVICE_AUTH_LIMITS = Object.freeze({
  authorizationCodeBytes: 4_096,
  bodyChunkBytes: 65_536,
  ceremonyMilliseconds: 900_000,
  deviceBodyBytes: 8_192,
  deviceExpirationBytes: 256,
  deviceIdentityBytes: 4_096,
  headerBytes: 16_384,
  inactivityMilliseconds: 30_000,
  pollBodyBytes: 16_384,
  tokenBodyBytes: 131_072,
  tokenBytes: 32_768,
  userCodeBytes: 256,
});

export const OPENAI_AUTH_ORIGIN = "https://auth.openai.com";
export const OPENAI_DEVICE_CODE_PATH =
  "/api/accounts/deviceauth/usercode";
export const OPENAI_DEVICE_POLL_PATH =
  "/api/accounts/deviceauth/token";
export const OPENAI_DEVICE_VERIFICATION_URL =
  "https://auth.openai.com/codex/device";
export const OPENAI_TOKEN_PATH = "/oauth/token";

const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_DEVICE_REDIRECT =
  "https://auth.openai.com/deviceauth/callback";
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const HEX = "0123456789ABCDEF";

export type OpenAIDeviceAuthErrorKind =
  | "cancelled"
  | "connectivity"
  | "denied"
  | "expired"
  | "limit"
  | "output"
  | "protocol"
  | "rejected"
  | "timeout";

export type OpenAIDeviceAuthError = Readonly<{
  kind: OpenAIDeviceAuthErrorKind;
}>;

export type OpenAIDeviceChallenge = Readonly<{
  userCode: string;
  verificationUrl: typeof OPENAI_DEVICE_VERIFICATION_URL;
}>;

export interface OpenAIDeviceAuthCancellation {
  cancelled(): boolean;
  onCancel(listener: () => void): void;
  offCancel(listener: () => void): void;
}

export type OpenAIDeviceChallengePresenter = (
  challenge: OpenAIDeviceChallenge,
) => Promise<boolean>;

export interface OpenAIDeviceAuthPort {
  authenticate(
    cancellation: OpenAIDeviceAuthCancellation,
    present: OpenAIDeviceChallengePresenter,
  ): Promise<Result<OpenAICredential, OpenAIDeviceAuthError>>;
}

type HttpsResponse = IncomingMessage;
type HttpsRequest = ClientRequest;
type RequestHttps = OpenAIHttpsClient["request"];

export interface OpenAIHttpsClient {
  request(
    options: RequestOptions,
    onResponse: (response: HttpsResponse) => void,
  ): HttpsRequest;
}

const NODE_HTTPS_CLIENT: OpenAIHttpsClient = Object.freeze({
  request: nodeHttpsRequest,
});

type HttpSuccess = Readonly<{
  body?: Uint8Array;
  status: number;
}>;

type DeviceIdentity = Readonly<{
  deviceIdentity: string;
  intervalMilliseconds: number;
  userCode: string;
}>;

type AuthorizationGrant = Readonly<{
  authorizationCode: string;
  verifier: string;
}>;

function failure(kind: OpenAIDeviceAuthErrorKind): OpenAIDeviceAuthError {
  return Object.freeze({ kind });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(canonical);
}

function visibleAscii(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= maximum &&
    /^[\x21-\x7e]+$/u.test(value)
  );
}

function contentType(response: HttpsResponse): string | undefined {
  const value = response.headers["content-type"];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1) return value.at(0);
  return undefined;
}

function validJsonContentType(value: string | undefined): boolean {
  return value !== undefined &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(value);
}

type JsonScan = Readonly<{
  duplicate: boolean;
  next: number;
}>;

function skipJsonWhitespace(source: string, offset: number): number {
  let next = offset;
  while (/^[\u0009\u000a\u000d\u0020]$/u.test(source.at(next) ?? "")) {
    next += 1;
  }
  return next;
}

function scanJsonString(source: string, offset: number): number | undefined {
  if (source.at(offset) !== "\"") return undefined;
  let escaped = false;
  for (let next = offset + 1; next < source.length; next += 1) {
    const character = source.at(next);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") return next + 1;
  }
  return undefined;
}

function scanJsonValue(source: string, offset: number): JsonScan | undefined {
  const start = skipJsonWhitespace(source, offset);
  const character = source.at(start);
  if (character === "{") return scanJsonObject(source, start);
  if (character === "[") return scanJsonArray(source, start);
  if (character === "\"") {
    const next = scanJsonString(source, start);
    return next === undefined ? undefined : Object.freeze({ duplicate: false, next });
  }
  let next = start;
  while (next < source.length) {
    const candidate = source.at(next);
    if (
      candidate === "," || candidate === "]" || candidate === "}" ||
      /^[\u0009\u000a\u000d\u0020]$/u.test(candidate ?? "")
    ) {
      break;
    }
    next += 1;
  }
  return next === start
    ? undefined
    : Object.freeze({ duplicate: false, next });
}

function scanJsonObject(source: string, offset: number): JsonScan | undefined {
  const keys = new Set<string>();
  let next = skipJsonWhitespace(source, offset + 1);
  if (source.at(next) === "}") {
    return Object.freeze({ duplicate: false, next: next + 1 });
  }
  while (next < source.length) {
    const keyEnd = scanJsonString(source, next);
    if (keyEnd === undefined) return undefined;
    let key: unknown;
    try {
      key = JSON.parse(source.slice(next, keyEnd)) as unknown;
    } catch (_cause: unknown) {
      return undefined;
    }
    if (typeof key !== "string" || keys.has(key)) {
      return Object.freeze({ duplicate: true, next: source.length });
    }
    keys.add(key);
    next = skipJsonWhitespace(source, keyEnd);
    if (source.at(next) !== ":") return undefined;
    const value = scanJsonValue(source, next + 1);
    if (value === undefined || value.duplicate) return value;
    next = skipJsonWhitespace(source, value.next);
    const separator = source.at(next);
    if (separator === "}") {
      return Object.freeze({ duplicate: false, next: next + 1 });
    }
    if (separator !== ",") return undefined;
    next = skipJsonWhitespace(source, next + 1);
  }
  return undefined;
}

function scanJsonArray(source: string, offset: number): JsonScan | undefined {
  let next = skipJsonWhitespace(source, offset + 1);
  if (source.at(next) === "]") {
    return Object.freeze({ duplicate: false, next: next + 1 });
  }
  while (next < source.length) {
    const value = scanJsonValue(source, next);
    if (value === undefined || value.duplicate) return value;
    next = skipJsonWhitespace(source, value.next);
    const separator = source.at(next);
    if (separator === "]") {
      return Object.freeze({ duplicate: false, next: next + 1 });
    }
    if (separator !== ",") return undefined;
    next = skipJsonWhitespace(source, next + 1);
  }
  return undefined;
}

function hasDuplicateJsonKeys(source: string): boolean {
  try {
    const scanned = scanJsonValue(source, 0);
    return scanned === undefined || scanned.duplicate ||
      skipJsonWhitespace(source, scanned.next) !== source.length;
  } catch (_cause: unknown) {
    return true;
  }
}

function parseJsonBody(
  body: Uint8Array | undefined,
): Result<Record<string, unknown>, OpenAIDeviceAuthError> {
  if (body === undefined || body.length === 0) {
    return err(failure("protocol"));
  }
  const decoded = decodeUtf8Text(body, true);
  body.fill(0);
  if (!decoded.ok) return err(failure("protocol"));
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.value) as unknown;
  } catch (_cause: unknown) {
    return err(failure("protocol"));
  }
  if (hasDuplicateJsonKeys(decoded.value)) return err(failure("protocol"));
  return isRecord(parsed) ? ok(parsed) : err(failure("protocol"));
}

function decodeDeviceIdentity(
  body: Uint8Array | undefined,
): Result<DeviceIdentity, OpenAIDeviceAuthError> {
  const parsed = parseJsonBody(body);
  if (!parsed.ok) return parsed;
  const exactResponse = exactKeys(
    parsed.value,
    ["device_auth_id", "interval", "user_code"],
  ) || exactKeys(
    parsed.value,
    ["device_auth_id", "expires_at", "interval", "user_code"],
  );
  if (
    !exactResponse ||
    !visibleAscii(
      parsed.value.device_auth_id,
      OPENAI_DEVICE_AUTH_LIMITS.deviceIdentityBytes,
    ) ||
    !visibleAscii(
      parsed.value.user_code,
      OPENAI_DEVICE_AUTH_LIMITS.userCodeBytes,
    ) ||
    (parsed.value.expires_at !== undefined && !visibleAscii(
      parsed.value.expires_at,
      OPENAI_DEVICE_AUTH_LIMITS.deviceExpirationBytes,
    )) ||
    typeof parsed.value.interval !== "string" ||
    !/^[1-9][0-9]?$/u.test(parsed.value.interval)
  ) {
    return err(failure("protocol"));
  }
  const seconds = Number.parseInt(parsed.value.interval, 10);
  if (seconds < 1 || seconds > 30) return err(failure("protocol"));
  return ok(Object.freeze({
    deviceIdentity: parsed.value.device_auth_id,
    intervalMilliseconds: seconds * 1_000,
    userCode: parsed.value.user_code,
  }));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes.at(offset);
    if (first === undefined) return "";
    const second = bytes.at(offset + 1);
    const third = bytes.at(offset + 2);
    output += BASE64URL_ALPHABET.at(first >> 2) ?? "";
    output += BASE64URL_ALPHABET.at(
      ((first & 3) << 4) | ((second ?? 0) >> 4),
    ) ?? "";
    if (second !== undefined) {
      output += BASE64URL_ALPHABET.at(
        ((second & 15) << 2) | ((third ?? 0) >> 6),
      ) ?? "";
    }
    if (third !== undefined) {
      output += BASE64URL_ALPHABET.at(third & 63) ?? "";
    }
  }
  return output;
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  if (
    value.length === 0 || value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    return undefined;
  }
  const bytes: number[] = [];
  let bits = 0;
  let accumulator = 0;
  for (const character of value) {
    const decoded = BASE64URL_ALPHABET.indexOf(character);
    if (decoded < 0) return undefined;
    accumulator = accumulator * 64 + decoded;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const divisor = 2 ** bits;
      bytes.push(Math.floor(accumulator / divisor));
      accumulator %= divisor;
    }
  }
  if (accumulator !== 0) return undefined;
  const result = Uint8Array.from(bytes);
  if (base64UrlEncode(result) !== value) {
    result.fill(0);
    return undefined;
  }
  return result;
}

function decodeJwtClaims(
  token: string,
): Result<Record<string, unknown>, OpenAIDeviceAuthError> {
  const segments = token.split(".");
  if (segments.length !== 3) return err(failure("protocol"));
  const header = segments.at(0);
  const payload = segments.at(1);
  const signature = segments.at(2);
  if (header === undefined || payload === undefined || signature === undefined) {
    return err(failure("protocol"));
  }
  const headerBytes = base64UrlDecode(header);
  const payloadBytes = base64UrlDecode(payload);
  const signatureBytes = base64UrlDecode(signature);
  headerBytes?.fill(0);
  signatureBytes?.fill(0);
  if (headerBytes === undefined || payloadBytes === undefined || signatureBytes === undefined) {
    payloadBytes?.fill(0);
    return err(failure("protocol"));
  }
  const decoded = decodeUtf8Text(payloadBytes, true);
  payloadBytes.fill(0);
  if (!decoded.ok) return err(failure("protocol"));
  if (hasDuplicateJsonKeys(decoded.value)) return err(failure("protocol"));
  let claims: unknown;
  try {
    claims = JSON.parse(decoded.value) as unknown;
  } catch (_cause: unknown) {
    return err(failure("protocol"));
  }
  return isRecord(claims) ? ok(claims) : err(failure("protocol"));
}

function accountClaim(
  claims: Record<string, unknown>,
): Result<string | undefined, OpenAIDeviceAuthError> {
  const namespace = claims["https://api.openai.com/auth"];
  if (namespace === undefined) return ok(undefined);
  if (!isRecord(namespace)) return err(failure("protocol"));
  const account = namespace.chatgpt_account_id;
  return visibleAscii(account, 256)
    ? ok(account)
    : err(failure("protocol"));
}

function decodeCredential(
  body: Uint8Array | undefined,
): Result<OpenAICredential, OpenAIDeviceAuthError> {
  const parsed = parseJsonBody(body);
  if (!parsed.ok) return parsed;
  const idToken = parsed.value.id_token;
  const accessToken = parsed.value.access_token;
  const refreshToken = parsed.value.refresh_token;
  if (
    !visibleAscii(idToken, OPENAI_DEVICE_AUTH_LIMITS.tokenBytes) ||
    !visibleAscii(accessToken, OPENAI_DEVICE_AUTH_LIMITS.tokenBytes) ||
    !visibleAscii(refreshToken, OPENAI_DEVICE_AUTH_LIMITS.tokenBytes)
  ) {
    return err(failure("protocol"));
  }
  const identityClaims = decodeJwtClaims(idToken);
  const accessClaims = decodeJwtClaims(accessToken);
  if (!identityClaims.ok || !accessClaims.ok) return err(failure("protocol"));
  const identityAccount = accountClaim(identityClaims.value);
  const accessAccount = accountClaim(accessClaims.value);
  if (!identityAccount.ok || identityAccount.value === undefined || !accessAccount.ok) {
    return err(failure("protocol"));
  }
  if (
    accessAccount.value !== undefined &&
    accessAccount.value !== identityAccount.value
  ) {
    return err(failure("protocol"));
  }
  const expiration = accessClaims.value.exp;
  if (
    typeof expiration !== "number" || !Number.isSafeInteger(expiration) ||
    expiration < 1 || expiration <= Math.floor(Date.now() / 1_000)
  ) {
    return err(failure("expired"));
  }
  return ok(Object.freeze({
    accessToken,
    accountId: identityAccount.value,
    expiresAt: expiration,
    refreshToken,
  }));
}

function decodeAuthorizationGrant(
  body: Uint8Array | undefined,
): Result<AuthorizationGrant, OpenAIDeviceAuthError> {
  const parsed = parseJsonBody(body);
  if (!parsed.ok) return parsed;
  const exactResponse = exactKeys(parsed.value, [
    "authorization_code",
    "code_verifier",
  ]) || exactKeys(parsed.value, [
    "authorization_code",
    "code_challenge",
    "code_verifier",
  ]);
  if (
    !exactResponse ||
    !visibleAscii(
      parsed.value.authorization_code,
      OPENAI_DEVICE_AUTH_LIMITS.authorizationCodeBytes,
    ) ||
    typeof parsed.value.code_verifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/u.test(parsed.value.code_verifier) ||
    (parsed.value.code_challenge !== undefined && (
      typeof parsed.value.code_challenge !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/u.test(parsed.value.code_challenge)
    ))
  ) {
    return err(failure("protocol"));
  }
  if (parsed.value.code_challenge !== undefined) {
    const digest = createHash("sha256")
      .update(parsed.value.code_verifier, "utf8")
      .digest();
    const challenge = base64UrlEncode(digest);
    digest.fill(0);
    if (challenge !== parsed.value.code_challenge) {
      return err(failure("protocol"));
    }
  }
  return ok(Object.freeze({
    authorizationCode: parsed.value.authorization_code,
    verifier: parsed.value.code_verifier,
  }));
}

function percentEncode(value: string): string {
  const parts: string[] = [];
  for (const character of value) {
    const byte = character.codePointAt(0);
    if (byte === undefined || byte > 0x7f) return "";
    if (
      (byte >= 0x41 && byte <= 0x5a) ||
      (byte >= 0x61 && byte <= 0x7a) ||
      (byte >= 0x30 && byte <= 0x39) || byte === 0x2d || byte === 0x2e ||
      byte === 0x5f || byte === 0x7e
    ) {
      parts.push(String.fromCodePoint(byte));
    } else {
      parts.push(
        "%" + (HEX.at(byte >> 4) ?? "") + (HEX.at(byte & 15) ?? ""),
      );
    }
  }
  return parts.join("");
}

function tokenBody(grant: AuthorizationGrant): string {
  return "grant_type=authorization_code" +
    "&code=" + percentEncode(grant.authorizationCode) +
    "&redirect_uri=" + percentEncode(OPENAI_DEVICE_REDIRECT) +
    "&client_id=" + percentEncode(OPENAI_CLIENT_ID) +
    "&code_verifier=" + percentEncode(grant.verifier);
}

function requestOptions(
  path: string,
  content: "application/json" | "application/x-www-form-urlencoded",
): RequestOptions {
  return Object.freeze({
    agent: false as const,
    headers: Object.freeze({
      accept: "application/json",
      "content-type": content,
      "user-agent": "agent/0.1.0",
    }),
    hostname: "auth.openai.com",
    maxHeaderSize: OPENAI_DEVICE_AUTH_LIMITS.headerBytes,
    method: "POST" as const,
    path,
    port: 443 as const,
    protocol: "https:" as const,
  });
}

function terminalStatus(
  status: number,
  phase: "device" | "poll" | "token",
): OpenAIDeviceAuthErrorKind {
  if (status === 408 || status === 504) return "timeout";
  if (status === 410) return "expired";
  if (status === 429) return "limit";
  if (status >= 500 && status <= 599) return "connectivity";
  if (phase === "poll" && (status === 400 || status === 401)) return "denied";
  return phase === "device" || phase === "token" ? "rejected" : "protocol";
}

class OpenAIAuthSession {
  readonly #cancellation: OpenAIDeviceAuthCancellation;
  readonly #clock: TimerClock;
  readonly #present: OpenAIDeviceChallengePresenter;
  readonly #requestHttps: RequestHttps;
  #activeAbort: ((kind: OpenAIDeviceAuthErrorKind) => void) | undefined;
  #deadline: ScheduledTimer | undefined;
  #stopReason: OpenAIDeviceAuthErrorKind | undefined;

  constructor(
    requestHttps: RequestHttps,
    clock: TimerClock,
    cancellation: OpenAIDeviceAuthCancellation,
    present: OpenAIDeviceChallengePresenter,
  ) {
    this.#requestHttps = requestHttps;
    this.#clock = clock;
    this.#cancellation = cancellation;
    this.#present = present;
  }

  #stop(kind: OpenAIDeviceAuthErrorKind): void {
    if (this.#stopReason !== undefined) return;
    this.#stopReason = kind;
    this.#activeAbort?.(kind);
  }

  readonly #onCancel = (): void => this.#stop("cancelled");

  #startDeadline(): boolean {
    let scheduled: ScheduledTimer | undefined;
    let firedSynchronously = false;
    try {
      scheduled = this.#clock.schedule(
        OPENAI_DEVICE_AUTH_LIMITS.ceremonyMilliseconds,
        () => {
          if (this.#deadline === undefined) {
            firedSynchronously = true;
            return;
          }
          if (this.#deadline !== scheduled) return;
          this.#deadline = undefined;
          this.#stop("timeout");
        },
      );
    } catch (_cause: unknown) {
      this.#stop("timeout");
      return false;
    }
    if (firedSynchronously) {
      try {
        scheduled.cancel();
      } catch (_cause: unknown) {
        // A synchronously fired registration retains no deadline authority.
      }
      this.#stop("timeout");
      return false;
    }
    this.#deadline = scheduled;
    return true;
  }

  #closeDeadline(): void {
    const scheduled = this.#deadline;
    this.#deadline = undefined;
    try {
      scheduled?.cancel();
    } catch (_cause: unknown) {
      // Ownership is cleared before cancellation so a late callback is inert.
    }
  }

  #request(
    path: string,
    content: "application/json" | "application/x-www-form-urlencoded",
    body: string,
    maximumBodyBytes: number,
  ): Promise<Result<HttpSuccess, OpenAIDeviceAuthError>> {
    if (this.#stopReason !== undefined) {
      return Promise.resolve(err(failure(this.#stopReason)));
    }
    return new Promise((resolve) => {
      let settled = false;
      let activeRequest: HttpsRequest | undefined;
      let activeResponse: HttpsResponse | undefined;
      const chunks: Uint8Array[] = [];
      let bytes = 0;

      const clearChunks = (): void => {
        for (const chunk of chunks) chunk.fill(0);
        chunks.length = 0;
        bytes = 0;
      };

      const detach = (): void => {
        activeRequest?.off("error", onRequestError);
        if (activeResponse !== undefined) {
          activeResponse.off("aborted", onAborted);
          activeResponse.off("data", onData);
          activeResponse.off("end", onEnd);
          activeResponse.off("error", onResponseError);
        }
        if (this.#activeAbort === abort) this.#activeAbort = undefined;
      };
      const destroy = (): void => {
        const response = activeResponse;
        activeResponse = undefined;
        try {
          response?.destroy();
        } catch (_cause: unknown) {
          // The response no longer retains session authority.
        }
        const request = activeRequest;
        activeRequest = undefined;
        try {
          request?.destroy();
        } catch (_cause: unknown) {
          // The request no longer retains session authority.
        }
      };
      const settle = (
        result: Result<HttpSuccess, OpenAIDeviceAuthError>,
      ): void => {
        if (settled) return;
        settled = true;
        detach();
        resolve(result);
      };
      const fail = (kind: OpenAIDeviceAuthErrorKind): void => {
        if (settled) return;
        clearChunks();
        settle(err(failure(kind)));
        destroy();
      };
      const abort = (kind: OpenAIDeviceAuthErrorKind): void => fail(kind);
      const onAborted = (): void => fail("connectivity");
      const onRequestError = (_cause: unknown): void => fail("connectivity");
      const onResponseError = (_cause: unknown): void => fail("connectivity");
      const onData = (chunk: Uint8Array): void => {
        if (
          !(chunk instanceof Uint8Array) || chunk.length < 1 ||
          chunk.length > OPENAI_DEVICE_AUTH_LIMITS.bodyChunkBytes ||
          bytes + chunk.length > maximumBodyBytes
        ) {
          fail("limit");
          return;
        }
        bytes += chunk.length;
        chunks.push(Uint8Array.from(chunk));
      };
      const onEnd = (): void => {
        try {
          const captured = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) {
            captured.set(chunk, offset);
            offset += chunk.length;
          }
          clearChunks();
          settle(ok(Object.freeze({ body: captured, status: 200 })));
        } catch (_cause: unknown) {
          fail("limit");
        }
      };

      this.#activeAbort = abort;
      if (this.#stopReason !== undefined) {
        abort(this.#stopReason);
        return;
      }
      try {
        activeRequest = this.#requestHttps(
          requestOptions(path, content),
          (response) => {
            if (settled || this.#stopReason !== undefined) {
              response.destroy();
              return;
            }
            activeResponse = response;
            const status = response.statusCode;
            if (status === undefined) {
              fail("protocol");
              return;
            }
            if (status !== 200) {
              settle(ok(Object.freeze({ status })));
              destroy();
              return;
            }
            if (!validJsonContentType(contentType(response))) {
              fail("protocol");
              return;
            }
            response.on("aborted", onAborted);
            response.on("data", onData);
            response.on("end", onEnd);
            response.on("error", onResponseError);
            response.resume();
          },
        );
        if (settled || this.#stopReason !== undefined) {
          destroy();
          return;
        }
        activeRequest.on("error", onRequestError);
        activeRequest.setTimeout(
          OPENAI_DEVICE_AUTH_LIMITS.inactivityMilliseconds,
          () => fail("timeout"),
        );
        activeRequest.write(body);
        activeRequest.end();
      } catch (_cause: unknown) {
        fail("connectivity");
      }
    });
  }

  #wait(milliseconds: number): Promise<Result<void, OpenAIDeviceAuthError>> {
    if (this.#stopReason !== undefined) {
      return Promise.resolve(err(failure(this.#stopReason)));
    }
    return new Promise((resolve) => {
      let settled = false;
      let scheduled: ScheduledTimer | undefined;
      const finish = (result: Result<void, OpenAIDeviceAuthError>): void => {
        if (settled) return;
        settled = true;
        if (this.#activeAbort === abort) this.#activeAbort = undefined;
        resolve(result);
      };
      const abort = (kind: OpenAIDeviceAuthErrorKind): void => {
        try {
          scheduled?.cancel();
        } catch (_cause: unknown) {
          // The stopped ceremony remains authoritative.
        }
        finish(err(failure(kind)));
      };
      this.#activeAbort = abort;
      try {
        scheduled = this.#clock.schedule(milliseconds, () => finish(ok(undefined)));
      } catch (_cause: unknown) {
        abort("timeout");
        return;
      }
      if (settled) {
        try {
          scheduled.cancel();
        } catch (_cause: unknown) {
          // A synchronously completed delay retains no authority.
        }
      } else if (this.#stopReason !== undefined) {
        abort(this.#stopReason);
      }
    });
  }

  async #authenticate(): Promise<
    Result<OpenAICredential, OpenAIDeviceAuthError>
  > {
    const device = await this.#request(
      OPENAI_DEVICE_CODE_PATH,
      "application/json",
      JSON.stringify(Object.freeze({ client_id: OPENAI_CLIENT_ID })),
      OPENAI_DEVICE_AUTH_LIMITS.deviceBodyBytes,
    );
    if (!device.ok) return device;
    if (device.value.status !== 200) {
      return err(failure(terminalStatus(device.value.status, "device")));
    }
    const identity = decodeDeviceIdentity(device.value.body);
    if (!identity.ok) return identity;
    let presented = false;
    try {
      presented = await this.#present(Object.freeze({
        userCode: identity.value.userCode,
        verificationUrl: OPENAI_DEVICE_VERIFICATION_URL,
      }));
    } catch (_cause: unknown) {
      return err(failure("output"));
    }
    if (!presented) return err(failure("output"));

    let grant: Result<AuthorizationGrant, OpenAIDeviceAuthError> | undefined;
    while (grant === undefined) {
      if (this.#stopReason !== undefined) {
        return err(failure(this.#stopReason));
      }
      const polled = await this.#request(
        OPENAI_DEVICE_POLL_PATH,
        "application/json",
        JSON.stringify(Object.freeze({
          device_auth_id: identity.value.deviceIdentity,
          user_code: identity.value.userCode,
        })),
        OPENAI_DEVICE_AUTH_LIMITS.pollBodyBytes,
      );
      if (!polled.ok) return polled;
      if (polled.value.status === 200) {
        grant = decodeAuthorizationGrant(polled.value.body);
        continue;
      }
      if (polled.value.status !== 403 && polled.value.status !== 404) {
        return err(failure(terminalStatus(polled.value.status, "poll")));
      }
      const waited = await this.#wait(identity.value.intervalMilliseconds);
      if (!waited.ok) return waited;
    }
    if (!grant.ok) return grant;

    const exchanged = await this.#request(
      OPENAI_TOKEN_PATH,
      "application/x-www-form-urlencoded",
      tokenBody(grant.value),
      OPENAI_DEVICE_AUTH_LIMITS.tokenBodyBytes,
    );
    if (!exchanged.ok) return exchanged;
    if (exchanged.value.status !== 200) {
      return err(failure(terminalStatus(exchanged.value.status, "token")));
    }
    const credential = decodeCredential(exchanged.value.body);
    if (!credential.ok) return credential;
    return this.#stopReason === undefined
      ? credential
      : err(failure(this.#stopReason));
  }

  async run(): Promise<Result<OpenAICredential, OpenAIDeviceAuthError>> {
    try {
      if (this.#cancellation.cancelled()) return err(failure("cancelled"));
      this.#cancellation.onCancel(this.#onCancel);
      if (this.#cancellation.cancelled()) this.#stop("cancelled");
      if (this.#stopReason !== undefined || !this.#startDeadline()) {
        return err(failure(this.#stopReason ?? "timeout"));
      }
      return await this.#authenticate();
    } catch (_cause: unknown) {
      return err(failure(this.#stopReason ?? "protocol"));
    } finally {
      this.#activeAbort = undefined;
      this.#closeDeadline();
      try {
        this.#cancellation.offCancel(this.#onCancel);
      } catch (_cause: unknown) {
        // The caller's terminal cleanup remains the final input authority.
      }
    }
  }
}

/** Fixed-origin bounded OpenAI device authentication for the external CLI. */
export class NodeOpenAIDeviceAuth implements OpenAIDeviceAuthPort {
  readonly #clock: TimerClock;
  readonly #requestHttps: RequestHttps;

  constructor(
    client: OpenAIHttpsClient = NODE_HTTPS_CLIENT,
    clock: TimerClock = new NodeTimerClock(),
  ) {
    this.#clock = clock;
    this.#requestHttps = client.request.bind(client) as RequestHttps;
  }

  authenticate(
    cancellation: OpenAIDeviceAuthCancellation,
    present: OpenAIDeviceChallengePresenter,
  ): Promise<Result<OpenAICredential, OpenAIDeviceAuthError>> {
    return new OpenAIAuthSession(
      this.#requestHttps,
      this.#clock,
      cancellation,
      present,
    ).run();
  }
}
