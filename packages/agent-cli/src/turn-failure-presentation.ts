import type { TurnFailure } from "@agent/runtime";

import { classifyProviderFailure } from "./provider-failure-classification.js";

export type TurnFailurePresentation = Readonly<{
  checkpointedMarker: string;
  code: string;
  notice: string;
}>;

function failureCode<E>(failure: TurnFailure<E>): string {
  const kind = failure.kind;
  if (kind === "model") {
    const family = classifyProviderFailure(failure.error, failure.operation);
    return (
      "model/" + failure.operation +
      (family === undefined ? "" : "/" + family)
    );
  }
  if (kind === "invalidModelResult") {
    return "model/" + failure.operation + "/invalid-result";
  }
  if (kind === "unexpected") {
    return "model/" + failure.operation + "/unexpected";
  }
  if (kind === "invalidModelStream") {
    return "model/open/invalid-stream";
  }
  if (kind === "invalidModelEvent") {
    return "model/read/invalid-event";
  }
  if (kind === "invalidToolCall") {
    if (failure.reason === "unknownTool") {
      return "tool/invalid-call/name";
    }
    if (failure.reason === "invalidInput") {
      return "tool/invalid-call/input";
    }
    if (failure.reason === "invalidCall") {
      return "tool/invalid-call/identity";
    }
    return "tool/invalid-call";
  }
  if (kind === "toolEngine") {
    return "tool/engine";
  }
  if (kind === "toolLimit") {
    return "tool/limit";
  }
  if (kind === "toolUnavailable") {
    return "tool/unavailable";
  }
  if (kind === "emptyDelta") {
    return "model/empty-delta";
  }
  if (kind === "emptyResponse") {
    return "model/empty-response";
  }
  if (kind === "eventLimit") {
    return "model/event-limit";
  }
  if (kind === "responseTooLong") {
    return "model/response-limit";
  }
  return "runtime/failure";
}

const FIXED_TURN_FAILURE_CODES = Object.freeze([
  "model/empty-delta",
  "model/empty-response",
  "model/event-limit",
  "model/open/invalid-result",
  "model/open/invalid-stream",
  "model/open/unexpected",
  "model/read/invalid-event",
  "model/read/invalid-result",
  "model/read/unexpected",
  "model/response-limit",
  "runtime/failure",
  "tool/engine",
  "tool/invalid-call",
  "tool/invalid-call/identity",
  "tool/invalid-call/input",
  "tool/invalid-call/name",
  "tool/limit",
  "tool/unavailable",
]);

const PROVIDER_FAILURE_FAMILIES = Object.freeze([
  "cancelled",
  "connectivity",
  "lifecycle",
  "limit",
  "protocol",
  "rejected",
  "request",
  "timeout",
]);

/** Validates the closed content-free failure vocabulary retained by a journal. */
export function isTurnFailureCode(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  if (FIXED_TURN_FAILURE_CODES.includes(value)) {
    return true;
  }
  if (value === "model/open" || value === "model/read") {
    return true;
  }
  const family = value.startsWith("model/open/")
    ? value.slice("model/open/".length)
    : value.startsWith("model/read/")
      ? value.slice("model/read/".length)
      : undefined;
  return family !== undefined && PROVIDER_FAILURE_FAMILIES.includes(family);
}

/** Rebuilds the exact bounded transcript marker from a validated code. */
export function checkpointedFailureMarker(code: string): string | undefined {
  return isTurnFailureCode(code)
    ? "[turn failed (" + code + ") after completed tool activity]"
    : undefined;
}

function openFailureDetail(code: string): string {
  if (code === "model/open/rejected") {
    return " the provider rejected account or model access; verify plan, credit, authorization, and model availability;";
  }
  return code.startsWith("model/open")
    ? " the provider did not open a usable response stream;"
    : "";
}

/** Projects one closed, content-free failed-turn classification for display. */
export function projectTurnFailure<E>(
  failure: TurnFailure<E>,
  checkpointed: boolean,
): TurnFailurePresentation {
  const code = failureCode(failure);
  const openFailure = code.startsWith("model/open");
  const detail = openFailureDetail(code);
  return Object.freeze({
    checkpointedMarker:
      "[turn failed (" + code + ") after completed tool activity]",
    code,
    notice: checkpointed
      ? "The turn failed (" +
        code +
        ");" +
        detail +
        " completed tool activity remains in conversation."
      : "The turn failed (" +
        code +
        ");" +
        detail +
        (openFailure ? " no tools ran and" : "") +
        " no conversation changes were committed.",
  });
}
