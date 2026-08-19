import assert from "node:assert/strict";
import test from "node:test";

import type { TurnFailure } from "@agent/runtime";

import { projectTurnFailure } from "../dist/turn-failure-presentation.js";

const CASES = [
  [{ kind: "model", operation: "open", error: "private" }, "model/open"],
  [{ kind: "model", operation: "read", error: "private" }, "model/read"],
  [{ kind: "invalidModelResult", operation: "open" }, "model/open/invalid-result"],
  [{ kind: "invalidModelResult", operation: "read" }, "model/read/invalid-result"],
  [{ kind: "unexpected", operation: "open" }, "model/open/unexpected"],
  [{ kind: "unexpected", operation: "read" }, "model/read/unexpected"],
  [{ kind: "invalidModelStream" }, "model/open/invalid-stream"],
  [{ kind: "invalidModelEvent" }, "model/read/invalid-event"],
  [
    { kind: "invalidToolCall", reason: "unknownTool" },
    "tool/invalid-call/name",
  ],
  [
    { kind: "invalidToolCall", reason: "invalidInput" },
    "tool/invalid-call/input",
  ],
  [
    { kind: "invalidToolCall", reason: "invalidCall" },
    "tool/invalid-call/identity",
  ],
  [{ kind: "toolEngine" }, "tool/engine"],
  [{ kind: "toolLimit" }, "tool/limit"],
  [{ kind: "toolUnavailable" }, "tool/unavailable"],
  [{ kind: "emptyDelta" }, "model/empty-delta"],
  [{ kind: "emptyResponse" }, "model/empty-response"],
  [{ kind: "eventLimit" }, "model/event-limit"],
  [{ kind: "responseTooLong" }, "model/response-limit"],
] as const satisfies readonly (readonly [TurnFailure<string>, string])[];

test("maps every admitted turn failure to one content-free closed code", () => {
  for (const [failure, expectedCode] of CASES) {
    const projected = projectTurnFailure(failure, true);
    assert.equal(projected.code, expectedCode);
    assert.equal(
      projected.checkpointedMarker,
      "[turn failed (" + expectedCode + ") after completed tool activity]",
    );
    assert.equal(projected.notice.includes(expectedCode), true);
    assert.equal(projected.notice.includes("private"), false);
    assert.equal(Object.isFrozen(projected), true);
  }
});

test("distinguishes retained tool truth from an uncommitted failed turn", () => {
  assert.equal(
    projectTurnFailure({ kind: "toolLimit" }, true).notice,
    "The turn failed (tool/limit); completed tool activity remains in conversation.",
  );
  assert.equal(
    projectTurnFailure({ kind: "toolLimit" }, false).notice,
    "The turn failed (tool/limit); no conversation changes were committed.",
  );
});

test("explains a classified provider-open failure without exposing its identity", () => {
  const projected = projectTurnFailure(
    {
      error: Object.freeze({
        cleanupFailed: false,
        kind: "ollamaCloud" as const,
        operation: "open" as const,
        reason: "statusRejected" as const,
      }),
      kind: "model",
      operation: "open",
    },
    false,
  );
  assert.equal(projected.code, "model/open/rejected");
  assert.equal(
    projected.notice,
    "The turn failed (model/open/rejected); the provider rejected account or model access; verify plan, credit, authorization, and model availability; no tools ran and no conversation changes were committed.",
  );
  assert.equal(projected.notice.includes("Ollama Cloud"), false);
  assert.equal(projected.notice.includes("status"), false);

  const checkpointed = projectTurnFailure(
    {
      error: Object.freeze({
        cleanupFailed: false,
        kind: "ollamaCloud" as const,
        operation: "open" as const,
        reason: "statusRejected" as const,
      }),
      kind: "model",
      operation: "open",
    },
    true,
  );
  assert.equal(
    checkpointed.notice,
    "The turn failed (model/open/rejected); the provider rejected account or model access; verify plan, credit, authorization, and model availability; completed tool activity remains in conversation.",
  );
});

test("retains completed tool truth in a classified continuation failure", () => {
  const projected = projectTurnFailure(
    {
      error: Object.freeze({
        cleanupFailed: false,
        kind: "ollamaCloud" as const,
        operation: "open" as const,
        reason: "transportTimeout" as const,
      }),
      kind: "model",
      operation: "open",
    },
    true,
  );
  assert.equal(projected.code, "model/open/timeout");
  assert.equal(
    projected.notice,
    "The turn failed (model/open/timeout); the provider did not open a usable response stream; completed tool activity remains in conversation.",
  );
});

test("maps an unknown hostile variant to one content-free residual code", () => {
  const projected = projectTurnFailure(
    Object.freeze({ kind: "hostile", secret: "PRIVATE_SECRET" }) as never,
    true,
  );
  assert.equal(projected.code, "runtime/failure");
  assert.equal(projected.notice.includes("PRIVATE_SECRET"), false);
});
