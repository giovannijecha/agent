import {
  err,
  ok,
  type Result,
  scalarUtf8ByteLength,
} from "@agent/core";

import { PROCESS_RUNNER_LIMITS } from "./process-runner.js";
import { decodeUtf8Text } from "./utf8-text.js";

export const PROCESS_BROKER_LIMITS = Object.freeze({
  arguments: PROCESS_RUNNER_LIMITS.arguments,
  environmentEntries: PROCESS_RUNNER_LIMITS.environmentEntries,
  frameBytes: 65_536,
  stringBytes: PROCESS_RUNNER_LIMITS.textUtf8Bytes,
});

const HEADER_BYTES = 12;
const PROTOCOL_VERSION = 2;
const COMMAND_MAGIC = Object.freeze([0x41, 0x47, 0x50, 0x43]);
const STATUS_MAGIC = Object.freeze([0x41, 0x47, 0x50, 0x53]);

export type ProcessBrokerProtocolError = Readonly<{
  kind: "invalidFrame" | "invalidRequest" | "invalidText" | "limit";
}>;

export type ProcessBrokerLaunch = Readonly<{
  arguments: readonly string[];
  environment: readonly string[];
  processLimit: number;
  program: string;
  timeoutMilliseconds: number;
  workingDirectory: string;
}>;

export type ProcessBrokerStatus =
  | Readonly<{ kind: "started"; processId: bigint }>
  | Readonly<{
      exitCode: number;
      exitCodeKnown: boolean;
      kind: "finished";
      outcome: "cancelled" | "exited" | "timedOut";
    }>
  | Readonly<{ failure: number; kind: "failure" }>;

function failure(
  kind: ProcessBrokerProtocolError["kind"],
): ProcessBrokerProtocolError {
  return Object.freeze({ kind });
}

export function encodeProcessText(
  value: string,
): Result<Uint8Array, ProcessBrokerProtocolError> {
  const byteLength = scalarUtf8ByteLength(value, true);
  if (byteLength === undefined) {
    return err(failure("invalidText"));
  }
  if (byteLength > PROCESS_BROKER_LIMITS.stringBytes) {
    return err(failure("limit"));
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const scalar of value) {
    const point = scalar.codePointAt(0);
    if (point === undefined) {
      return err(failure("invalidText"));
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
  return ok(bytes);
}

export function decodeProcessText(
  bytes: Uint8Array,
): Result<string, ProcessBrokerProtocolError> {
  const decoded = decodeUtf8Text(bytes);
  return decoded.ok ? decoded : err(failure("invalidText"));
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value,
    true,
  );
}

function frame(kind: number, payload: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(HEADER_BYTES + payload.length);
  encoded.set(COMMAND_MAGIC, 0);
  encoded.set([PROTOCOL_VERSION, kind, 0, 0], 4);
  writeU32(encoded, 8, payload.length);
  encoded.set(payload, HEADER_BYTES);
  return encoded;
}

function sizedText(bytes: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(4 + bytes.length);
  writeU32(encoded, 0, bytes.length);
  encoded.set(bytes, 4);
  return encoded;
}

function concatenate(parts: readonly Uint8Array[], length: number): Uint8Array {
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function environmentName(entry: unknown): string | undefined {
  if (typeof entry !== "string") {
    return undefined;
  }
  const separator = entry.indexOf("=");
  const name = separator < 1 ? "" : entry.slice(0, separator);
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) ? name : undefined;
}

export function encodeProcessLaunch(
  request: ProcessBrokerLaunch,
): Result<Uint8Array, ProcessBrokerProtocolError> {
  try {
    if (
      !Number.isSafeInteger(request.timeoutMilliseconds) ||
      request.timeoutMilliseconds < 1 ||
      request.timeoutMilliseconds > 600_000 ||
      !Number.isSafeInteger(request.processLimit) ||
      request.processLimit < 1 ||
      request.processLimit > 64 ||
      !Array.isArray(request.arguments) ||
      request.arguments.length > PROCESS_BROKER_LIMITS.arguments ||
      !Array.isArray(request.environment) ||
      request.environment.length > PROCESS_BROKER_LIMITS.environmentEntries
    ) {
      return err(failure("invalidRequest"));
    }
    const environmentNames = new Set<string>();
    for (const entry of request.environment) {
      const name = environmentName(entry);
      if (name === undefined || environmentNames.has(name)) {
        return err(failure("invalidRequest"));
      }
      environmentNames.add(name);
    }
    const strings = [
      request.program,
      request.workingDirectory,
      ...request.environment,
      ...request.arguments,
    ];
    const encodedStrings: Uint8Array[] = [];
    for (const value of strings) {
      if (typeof value !== "string") {
        return err(failure("invalidRequest"));
      }
      const encoded = encodeProcessText(value);
      if (!encoded.ok || (encoded.value.length === 0 && encodedStrings.length < 2)) {
        return encoded.ok ? err(failure("invalidRequest")) : encoded;
      }
      encodedStrings.push(sizedText(encoded.value));
    }
    const fixed = new Uint8Array(8);
    writeU32(fixed, 0, request.timeoutMilliseconds);
    writeU32(fixed, 4, request.processLimit);
    const environmentCount = new Uint8Array(4);
    writeU32(environmentCount, 0, request.environment.length);
    const argumentCount = new Uint8Array(4);
    writeU32(argumentCount, 0, request.arguments.length);
    const environmentEnd = 2 + request.environment.length;
    const parts = [
      fixed,
      encodedStrings.at(0)!,
      encodedStrings.at(1)!,
      environmentCount,
      ...encodedStrings.slice(2, environmentEnd),
      argumentCount,
      ...encodedStrings.slice(environmentEnd),
    ];
    const length = parts.reduce((total, part) => total + part.length, 0);
    return length <= PROCESS_BROKER_LIMITS.frameBytes
      ? ok(frame(1, concatenate(parts, length)))
      : err(failure("limit"));
  } catch (_cause: unknown) {
    return err(failure("invalidRequest"));
  }
}

export function encodeProcessCancel(): Uint8Array {
  return frame(2, new Uint8Array());
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function parseStatus(
  kind: number,
  payload: Uint8Array,
): Result<ProcessBrokerStatus, ProcessBrokerProtocolError> {
  if (kind === 1 && payload.length === 8) {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    return ok(Object.freeze({ kind: "started" as const, processId: view.getBigUint64(0, true) }));
  }
  if (kind === 2 && payload.length === 8) {
    const outcome = payload.at(0);
    const known = payload.at(1);
    if (
      (outcome !== 1 && outcome !== 2 && outcome !== 3) ||
      (known !== 0 && known !== 1) ||
      payload.at(2) !== 0 ||
      payload.at(3) !== 0
    ) {
      return err(failure("invalidFrame"));
    }
    const exitCode = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    ).getInt32(4, true);
    return ok(
      Object.freeze({
        exitCode,
        exitCodeKnown: known === 1,
        kind: "finished" as const,
        outcome: outcome === 1 ? "exited" as const : outcome === 2 ? "cancelled" as const : "timedOut" as const,
      }),
    );
  }
  return kind === 3 && payload.length === 4
    ? ok(Object.freeze({ failure: readU32(payload, 0), kind: "failure" as const }))
    : err(failure("invalidFrame"));
}

export class ProcessBrokerStatusDecoder {
  #buffer = new Uint8Array();

  push(
    chunk: Uint8Array,
  ): Result<readonly ProcessBrokerStatus[], ProcessBrokerProtocolError> {
    try {
      if (!(chunk instanceof Uint8Array)) {
        return err(failure("invalidFrame"));
      }
      const joined = new Uint8Array(this.#buffer.length + chunk.length);
      joined.set(this.#buffer, 0);
      joined.set(chunk, this.#buffer.length);
      if (joined.length > PROCESS_BROKER_LIMITS.frameBytes + HEADER_BYTES) {
        return err(failure("limit"));
      }
      const statuses: ProcessBrokerStatus[] = [];
      let offset = 0;
      while (joined.length - offset >= HEADER_BYTES) {
        if (
          STATUS_MAGIC.some((byte, index) => joined.at(offset + index) !== byte) ||
          joined.at(offset + 4) !== PROTOCOL_VERSION ||
          joined.at(offset + 6) !== 0 ||
          joined.at(offset + 7) !== 0
        ) {
          return err(failure("invalidFrame"));
        }
        const length = readU32(joined, offset + 8);
        if (length > PROCESS_BROKER_LIMITS.frameBytes) {
          return err(failure("limit"));
        }
        const frameLength = HEADER_BYTES + length;
        if (joined.length - offset < frameLength) {
          break;
        }
        const parsed = parseStatus(
          joined.at(offset + 5) ?? -1,
          joined.slice(offset + HEADER_BYTES, offset + frameLength),
        );
        if (!parsed.ok) {
          return parsed;
        }
        statuses.push(parsed.value);
        offset += frameLength;
      }
      this.#buffer = joined.slice(offset);
      return ok(Object.freeze(statuses));
    } catch (_cause: unknown) {
      return err(failure("invalidFrame"));
    }
  }

  finish(): Result<void, ProcessBrokerProtocolError> {
    return this.#buffer.length === 0
      ? ok(undefined)
      : err(failure("invalidFrame"));
  }
}
