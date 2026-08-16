import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyProviderFailure,
  type ProviderFailureFamily,
} from "../dist/provider-failure-classification.js";

const REASONS = [
  ["status", "rejected"],
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

test("maps both admitted providers into one shared failure vocabulary", () => {
  for (const kind of ["openCodeGo", "openCodeZen"] as const) {
    for (const [reason, expected] of REASONS) {
      assert.equal(
        classifyProviderFailure(
          Object.freeze({
            cleanupFailed: false,
            kind,
            operation: "open" as const,
            reason,
          }),
          "open",
        ),
        expected,
      );
    }
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
      kind: "openCodeGo",
      operation: "open",
      reason: "status",
    }),
    Object.freeze({
      cleanupFailed: false,
      kind: "openCodeZen",
      operation: "read",
      reason: "status",
    }),
    Object.freeze({
      cleanupFailed: false,
      kind: "openCodeGo",
      operation: "open",
      reason: "PRIVATE_SECRET",
    }),
  ]) {
    assert.equal(classifyProviderFailure(value, "open"), undefined);
  }
});
