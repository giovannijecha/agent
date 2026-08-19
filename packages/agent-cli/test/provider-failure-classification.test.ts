import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderFailure,
  type ProviderFailureFamily,
} from "../dist/provider-failure-classification.js";

const REASONS = [
  ["statusRequest", "request"],
  ["statusRejected", "rejected"],
  ["statusLimit", "limit"],
  ["statusConnectivity", "connectivity"],
  ["statusTimeout", "timeout"],
  ["statusProtocol", "protocol"],
  ["transportConnection", "connectivity"],
  ["transportTimeout", "timeout"],
  ["request", "request"],
  ["limit", "limit"],
  ["transportLimit", "limit"],
  ["cancelled", "cancelled"],
  ["transportCancelled", "cancelled"],
  ["closed", "lifecycle"],
  ["concurrentRead", "lifecycle"],
  ["transportClosed", "lifecycle"],
  ["transportConcurrentRead", "lifecycle"],
  ["contentType", "protocol"],
  ["encoding", "protocol"],
  ["finishReason", "protocol"],
  ["protocol", "protocol"],
  ["transportProtocol", "protocol"],
] as const satisfies readonly (readonly [string, ProviderFailureFamily])[];

test("maps the admitted provider into one shared failure vocabulary", () => {
  for (const [reason, expected] of REASONS) {
    assert.equal(
      classifyProviderFailure(
        Object.freeze({
          cleanupFailed: false,
          kind: "ollamaCloud" as const,
          operation: "open" as const,
          reason,
        }),
        "open",
      ),
      expected,
    );
  }
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
