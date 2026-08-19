import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderFailure,
  type ProviderFailureClassification,
  type ProviderFailureFamily,
} from "../dist/provider-failure-classification.js";

const REASONS = [
  ["statusRequest", { family: "request" }],
  ["statusRejected", { family: "rejected" }],
  ["statusLimit", { family: "limit" }],
  ["statusConnectivity", { family: "connectivity" }],
  ["statusTimeout", { family: "timeout" }],
  ["statusProtocol", { family: "protocol", protocolPhase: "transport" }],
  ["transportConnection", { family: "connectivity" }],
  ["transportTimeout", { family: "timeout" }],
  ["request", { family: "request" }],
  ["limit", { family: "limit" }],
  ["transportLimit", { family: "limit" }],
  ["cancelled", { family: "cancelled" }],
  ["transportCancelled", { family: "cancelled" }],
  ["closed", { family: "lifecycle" }],
  ["concurrentRead", { family: "lifecycle" }],
  ["transportClosed", { family: "lifecycle" }],
  ["transportConcurrentRead", { family: "lifecycle" }],
  ["contentType", { family: "protocol", protocolPhase: "transport" }],
  ["encoding", { family: "protocol", protocolPhase: "framing" }],
  ["finishReason", { family: "protocol", protocolPhase: "terminal" }],
  ["protocol", { family: "protocol" }],
  ["protocolEnvelope", { family: "protocol", protocolPhase: "envelope" }],
  ["protocolFraming", { family: "protocol", protocolPhase: "framing" }],
  ["protocolMessage", { family: "protocol", protocolPhase: "message" }],
  ["protocolToolCall", { family: "protocol", protocolPhase: "tool-call" }],
  ["protocolTerminal", { family: "protocol", protocolPhase: "terminal" }],
  ["transportProtocol", { family: "protocol", protocolPhase: "transport" }],
] as const satisfies readonly (readonly [
  string,
  Readonly<{
    family: ProviderFailureFamily;
    protocolPhase?: string;
  }>,
])[];

test("maps the admitted provider into one shared failure vocabulary", () => {
  for (const [reason, expected] of REASONS) {
    const classified = classifyProviderFailure(
        Object.freeze({
          cleanupFailed: false,
          kind: "ollamaCloud" as const,
          operation: "open" as const,
          reason,
        }),
        "open",
      );
    assert.deepEqual(classified, expected);
    assert.equal(Object.isFrozen(classified), true);
  }
});

test("returns the closed immutable classification shape", () => {
  const classified = classifyProviderFailure(
    Object.freeze({
      cleanupFailed: false,
      kind: "ollamaCloud" as const,
      operation: "read" as const,
      reason: "protocolToolCall" as const,
    }),
    "read",
  );
  assert.ok(classified !== undefined);
  assert.deepEqual(classified satisfies ProviderFailureClassification, {
    family: "protocol",
    protocolPhase: "tool-call",
  });
});

test("rejects unknown, malformed, and operation-mismatched values", () => {
  for (const value of [
    "private",
    Object.freeze({
      cleanupFailed: false,
      kind: "other",
      operation: "open",
      reason: "status",
    }),
    Object.freeze({
      cleanupFailed: "no",
      kind: "ollamaCloud",
      operation: "open",
      reason: "status",
    }),
    Object.freeze({
      cleanupFailed: false,
      kind: "ollamaCloud",
      operation: "read",
      reason: "status",
    }),
    Object.freeze({
      cleanupFailed: false,
      kind: "ollamaCloud",
      operation: "open",
      reason: "PRIVATE_SECRET",
    }),
  ]) {
    assert.equal(classifyProviderFailure(value, "open"), undefined);
  }
});
