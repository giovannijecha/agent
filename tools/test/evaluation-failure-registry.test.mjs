import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EVALUATION_FAILURE_LIMITS,
  EvaluationFailureRegistryError,
  validateEvaluationFailureRegistry,
} from "../lib/evaluation-failure-registry.mjs";
import { projectRoot } from "../lib/project.mjs";

const registryBytes = readFileSync(
  path.join(projectRoot, "evaluations/failures/registry.json"),
);
const registry = JSON.parse(registryBytes.toString("utf8"));
const evaluationPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/evaluation-policy.json"), "utf8"),
);
const decisionPath =
  "docs/decisions/0049-owned-evaluation-failure-registry.md";

function context(overrides = {}) {
  return {
    repositoryPaths: [decisionPath],
    sourceBytes: registryBytes.length,
    taskIds: evaluationPolicy.tasks.map((task) => task.id),
    ...overrides,
  };
}

function clone(value = registry) {
  return structuredClone(value);
}

function expectCode(code) {
  return (error) =>
    error instanceof EvaluationFailureRegistryError &&
    error.code === code &&
    error.message === "evaluation failure registry " + code;
}

test("accepts the canonical content-free failure registry", () => {
  assert.deepEqual(validateEvaluationFailureRegistry(registry, context()), {
    actionable: 0,
    entries: 1,
    observing: 1,
    resolved: 0,
    schemaVersion: 1,
  });

  const empty = clone();
  empty.entries = [];
  assert.deepEqual(validateEvaluationFailureRegistry(empty, context()), {
    actionable: 0,
    entries: 0,
    observing: 0,
    resolved: 0,
    schemaVersion: 1,
  });
});

test("rejects registry and entry shape or ordering drift", () => {
  const unknownRegistryKey = clone();
  unknownRegistryKey.note = "not admitted";
  assert.throws(
    () => validateEvaluationFailureRegistry(unknownRegistryKey, context()),
    expectCode("invalidRegistry"),
  );

  const unknownEntryKey = clone();
  unknownEntryKey.entries.at(0).note = "not admitted";
  assert.throws(
    () => validateEvaluationFailureRegistry(unknownEntryKey, context()),
    expectCode("invalidEntry"),
  );

  const duplicate = clone();
  duplicate.entries.push(clone().entries.at(0));
  assert.throws(
    () => validateEvaluationFailureRegistry(duplicate, context()),
    expectCode("invalidRegistry"),
  );

  const reversed = clone();
  const second = clone().entries.at(0);
  second.id = "a-prior-entry";
  reversed.entries.push(second);
  assert.throws(
    () => validateEvaluationFailureRegistry(reversed, context()),
    expectCode("invalidRegistry"),
  );
});

test("rejects unknown taxonomy, priority, task, and frequency", () => {
  for (const [key, value] of [
    ["category", "other"],
    ["priority", "p4"],
    ["status", "closed"],
    ["taskId", "unknown-task"],
    ["occurrences", 0],
    ["occurrences", EVALUATION_FAILURE_LIMITS.occurrences + 1],
  ]) {
    const changed = clone();
    changed.entries.at(0)[key] = value;
    assert.throws(
      () => validateEvaluationFailureRegistry(changed, context()),
      expectCode("invalidEntry"),
      key,
    );
  }
});

test("rejects inconsistent or non-negative evidence", () => {
  const exactWithDifference = clone();
  exactWithDifference.entries.at(0).evidence.artifact = "exact";
  assert.throws(
    () => validateEvaluationFailureRegistry(exactWithDifference, context()),
    expectCode("invalidEvidence"),
  );

  const nonExactWithoutDifference = clone();
  nonExactWithoutDifference.entries.at(0).evidence.unexpected = [];
  assert.throws(
    () => validateEvaluationFailureRegistry(nonExactWithoutDifference, context()),
    expectCode("invalidEvidence"),
  );

  const success = clone();
  success.entries.at(0).evidence.artifact = "accepted-alternative";
  success.entries.at(0).evidence.outcome = "success";
  success.entries.at(0).evidence.primaryConstraint = "none";
  assert.throws(
    () => validateEvaluationFailureRegistry(success, context()),
    expectCode("invalidEvidence"),
  );

  const unconstrainedFailure = clone();
  unconstrainedFailure.entries.at(0).evidence.primaryConstraint = "none";
  assert.throws(
    () => validateEvaluationFailureRegistry(unconstrainedFailure, context()),
    expectCode("invalidEvidence"),
  );
});

test("rejects unsafe, colliding, overlapping, or unordered evidence paths", () => {
  const cases = [
    ["unexpected", ["../outside.js"]],
    ["unexpected", [".env/token"]],
    ["unexpected", ["z.js", "a.js"]],
    ["unexpected", ["src/file.js", "src/FILE.js"]],
  ];
  for (const [key, value] of cases) {
    const changed = clone();
    changed.entries.at(0).evidence[key] = value;
    assert.throws(
      () => validateEvaluationFailureRegistry(changed, context()),
      expectCode("invalidEvidence"),
    );
  }

  const overlap = clone();
  overlap.entries.at(0).evidence.changed = ["src/sum-range.js"];
  assert.throws(
    () => validateEvaluationFailureRegistry(overlap, context()),
    expectCode("invalidEvidence"),
  );
});

test("binds lifecycle state to tracked resolution evidence", () => {
  const firstActionable = clone();
  firstActionable.entries.at(0).status = "actionable";
  assert.throws(
    () => validateEvaluationFailureRegistry(firstActionable, context()),
    expectCode("invalidLifecycle"),
  );

  const firstResolved = clone();
  firstResolved.entries.at(0).status = "resolved";
  firstResolved.entries.at(0).resolution = decisionPath;
  assert.throws(
    () => validateEvaluationFailureRegistry(firstResolved, context()),
    expectCode("invalidLifecycle"),
  );

  const prematureResolution = clone();
  prematureResolution.entries.at(0).resolution = decisionPath;
  assert.throws(
    () => validateEvaluationFailureRegistry(prematureResolution, context()),
    expectCode("invalidLifecycle"),
  );

  const missingResolution = clone();
  missingResolution.entries.at(0).occurrences = 2;
  missingResolution.entries.at(0).status = "resolved";
  missingResolution.entries.at(0).resolution =
    "tools/test/missing-regression.test.mjs";
  assert.throws(
    () => validateEvaluationFailureRegistry(missingResolution, context()),
    expectCode("invalidLifecycle"),
  );

  const resolved = clone();
  resolved.entries.at(0).occurrences = 2;
  resolved.entries.at(0).status = "resolved";
  resolved.entries.at(0).resolution = decisionPath;
  assert.deepEqual(validateEvaluationFailureRegistry(resolved, context()), {
    actionable: 0,
    entries: 1,
    observing: 0,
    resolved: 1,
    schemaVersion: 1,
  });
});

test("rejects oversized source and malformed context without leaking content", () => {
  assert.throws(
    () =>
      validateEvaluationFailureRegistry(
        registry,
        context({
          sourceBytes: EVALUATION_FAILURE_LIMITS.registryBytes + 1,
        }),
      ),
    expectCode("invalidContext"),
  );

  const duplicatePaths = context({
    repositoryPaths: [decisionPath, decisionPath],
  });
  assert.throws(
    () => validateEvaluationFailureRegistry(registry, duplicatePaths),
    expectCode("invalidContext"),
  );

  const malformedTask = context({ taskIds: ["unknown/task"] });
  assert.throws(
    () => validateEvaluationFailureRegistry(registry, malformedTask),
    expectCode("invalidContext"),
  );
});
