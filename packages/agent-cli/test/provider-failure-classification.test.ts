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
  ["statusProtocol", { family: "protocol" }],
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
  ["contentType", { family: "protocol" }],
  ["encoding", { family: "protocol" }],
  ["finishReason", { family: "protocol" }],
  ["protocol", { family: "protocol" }],
  ["protocolEnvelope", { family: "protocol" }],
  ["protocolFraming", { family: "protocol" }],
  ["protocolMessage", { family: "protocol" }],
  ["protocolToolCall", { family: "protocol" }],
  ["protocolTerminal", { family: "protocol" }],
  ["transportProtocol", { family: "protocol" }],
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

test("adds protocol phases only after a response stream is admitted", () => {
  const phases = [
    ["contentType", "transport"],
    ["transportProtocol", "transport"],
    ["encoding", "framing"],
    ["protocolFraming", "framing"],
    ["protocolEnvelope", "envelope"],
    ["protocolMessage", "message"],
    ["protocolToolCall", "tool-call"],
    ["finishReason", "finish"],
    ["protocolTerminal", "terminal"],
  ] as const;
  for (const [reason, protocolPhase] of phases) {
    const classified = classifyProviderFailure(
      Object.freeze({
        cleanupFailed: false,
        kind: "ollamaCloud" as const,
        operation: "read" as const,
        reason,
      }),
      "read",
    );
    assert.deepEqual(classified, { family: "protocol", protocolPhase });
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
