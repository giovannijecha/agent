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

/** Projects one closed, content-free failed-turn classification for display. */
export function projectTurnFailure<E>(
  failure: TurnFailure<E>,
  checkpointed: boolean,
): TurnFailurePresentation {
  const code = failureCode(failure);
  const openFailure = code.startsWith("model/open");
  return Object.freeze({
    checkpointedMarker:
      "[turn failed (" + code + ") after completed tool activity]",
    code,
    notice: checkpointed
      ? "The turn failed (" +
        code +
        ");" +
        (openFailure
          ? " the provider did not open a usable response stream;"
          : "") +
        " completed tool activity remains in conversation."
      : "The turn failed (" +
        code +
        ");" +
        (openFailure
          ? " the provider did not open a usable response stream; no tools ran and"
          : "") +
        " no conversation changes were committed.",
  });
}
