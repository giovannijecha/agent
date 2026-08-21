import { err, ok, type Result } from "@agent/core";

import type {
  OpenAITransportError,
  OpenAITransportErrorKind,
} from "./transport.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTransportErrorKind(value: unknown): value is OpenAITransportErrorKind {
  return value === "cancelled" || value === "closed" ||
    value === "concurrentRead" || value === "connection" || value === "limit" ||
    value === "protocol" || value === "timeout";
}

/** Snapshots one untrusted transport result without rereading accessor-backed fields. */
export function snapshotTransportResult<T>(
  value: unknown,
): Result<T, OpenAITransportError> | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const resultOk = value.ok;
    if (resultOk === true) {
      const resultValue = value.value;
      return ok(resultValue as T);
    }
    if (resultOk !== false) return undefined;
    const resultError = value.error;
    if (!isRecord(resultError)) return undefined;
    const cleanupFailed = resultError.cleanupFailed;
    const kind = resultError.kind;
    return typeof cleanupFailed === "boolean" && isTransportErrorKind(kind)
      ? err(Object.freeze({ cleanupFailed, kind }))
      : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}
