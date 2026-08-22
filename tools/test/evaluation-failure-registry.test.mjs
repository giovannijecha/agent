import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EVALUATION_FAILURE_LIMITS,
  EvaluationFailureRegistryError,
  parseEvaluationFailureRegistry,
  validateEvaluationFailureRegistry,
} from "../lib/evaluation-failure-registry.mjs";
import { loadEvaluationSuite } from "../lib/evaluation-suite.mjs";
import { projectRoot } from "../lib/project.mjs";

const registryBytes = readFileSync(
  path.join(projectRoot, "evaluations/failures/registry.json"),
);
const registry = JSON.parse(registryBytes.toString("utf8"));
const exampleRegistry = {
  entries: [
    {
      category: "planning",
      evidence: {
        artifact: "different",
        changed: [],
        missing: [],
        outcome: "partial",
        primaryConstraint: "model",
        unexpected: ["src/sum-range.js"],
      },
      id: "synthetic-inclusive-range-extra-source",
      occurrences: 1,
      priority: "p2",
      resolution: null,
      status: "observing",
      taskId: "typescript-inclusive-range",
    },
  ],
  schemaVersion: 1,
};
const evaluationSuite = loadEvaluationSuite(projectRoot);
const resolutionPath =
  "tools/test/synthetic-inclusive-range-extra-source.test.mjs";
const genericResolutionPath = "docs/ENGINEERING.md";

function context(overrides = {}) {
  return {
    repositoryPaths: [genericResolutionPath, resolutionPath],
    sourceBytes: registryBytes.length,
    taskExpectedPaths: evaluationSuite.tasks.map((task) => ({
      paths: task.expected.map((entry) => entry.path),
      taskId: task.id,
    })),
    ...overrides,
  };
}

function clone(value = exampleRegistry) {
  return structuredClone(value);
}

function expectCode(code) {
  return (error) =>
    error instanceof EvaluationFailureRegistryError &&
    error.code === code &&
    error.message === "evaluation failure registry " + code;
}

test("parses registry source without exposing rejected content", () => {
  assert.deepEqual(parseEvaluationFailureRegistry(registryBytes), registry);

  for (const source of [
    Buffer.from("PRIVATE_SECRET", "utf8"),
    Uint8Array.of(0xff),
    new Uint8Array(),
    new Uint8Array(EVALUATION_FAILURE_LIMITS.registryBytes + 1),
  ]) {
    assert.throws(
      () => parseEvaluationFailureRegistry(source),
      expectCode("invalidRegistry"),
    );
  }
});

test("rejects every noncanonical registry source representation", () => {
  const canonical = registryBytes.toString("utf8");
  const duplicateKey = canonical.replace(
    '  "schemaVersion": 1',
    '  "schemaVersion": 2,\n  "schemaVersion": 1',
  );
  for (const source of [
    Buffer.from(canonical.replaceAll("\n", "\r\n"), "utf8"),
    Buffer.from(canonical.slice(0, -1), "utf8"),
    Buffer.from(canonical.slice(0, -1) + " \n", "utf8"),
    Buffer.from(JSON.stringify(registry) + "\n", "utf8"),
    Buffer.from(duplicateKey, "utf8"),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), registryBytes]),
  ]) {
    assert.throws(
      () => parseEvaluationFailureRegistry(source),
      expectCode("invalidRegistry"),
    );
  }
});

test("translates canonical reconstruction depth failures", () => {
  const depth = 5_000;
  const source = Buffer.from("[".repeat(depth) + "]".repeat(depth), "utf8");

  assert.ok(source.byteLength <= EVALUATION_FAILURE_LIMITS.registryBytes);
  assert.doesNotThrow(() => JSON.parse(source.toString("utf8")));
  assert.throws(
    () => parseEvaluationFailureRegistry(source),
    expectCode("invalidRegistry"),
  );
});

test("accepts the canonical content-free failure registry", () => {
  assert.deepEqual(validateEvaluationFailureRegistry(registry, context()), {
    actionable: 0,
    entries: 0,
    observing: 0,
    resolved: 0,
    schemaVersion: 1,
  });

  assert.deepEqual(
    validateEvaluationFailureRegistry(exampleRegistry, context()),
    {
      actionable: 0,
      entries: 1,
      observing: 1,
      resolved: 0,
      schemaVersion: 1,
    },
  );
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

test("binds grade path classifications to the current expected snapshot", () => {
  for (const [gradeSet, pathValue] of [
    ["changed", "src/not-expected.ts"],
    ["missing", "src/not-expected.ts"],
    ["unexpected", "src/sum-range.ts"],
  ]) {
    const stale = clone();
    stale.entries.at(0).evidence[gradeSet] = [pathValue];
    assert.throws(
      () => validateEvaluationFailureRegistry(stale, context()),
      expectCode("invalidEvidence"),
      gradeSet,
    );
  }
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
  firstResolved.entries.at(0).resolution = resolutionPath;
  assert.throws(
    () => validateEvaluationFailureRegistry(firstResolved, context()),
    expectCode("invalidLifecycle"),
  );

  const prematureResolution = clone();
  prematureResolution.entries.at(0).resolution = resolutionPath;
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

  const genericResolution = clone();
  genericResolution.entries.at(0).occurrences = 2;
  genericResolution.entries.at(0).status = "resolved";
  genericResolution.entries.at(0).resolution = genericResolutionPath;
  assert.throws(
    () => validateEvaluationFailureRegistry(genericResolution, context()),
    expectCode("invalidLifecycle"),
  );

  const resolved = clone();
  resolved.entries.at(0).occurrences = 2;
  resolved.entries.at(0).status = "resolved";
  resolved.entries.at(0).resolution = resolutionPath;
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
        exampleRegistry,
        context({
          sourceBytes: EVALUATION_FAILURE_LIMITS.registryBytes + 1,
        }),
      ),
    expectCode("invalidContext"),
  );

  const duplicatePaths = context({
    repositoryPaths: [resolutionPath, resolutionPath],
  });
  assert.throws(
    () => validateEvaluationFailureRegistry(exampleRegistry, duplicatePaths),
    expectCode("invalidContext"),
  );

  const malformedTask = context({
    taskExpectedPaths: [{ paths: ["src/file.ts"], taskId: "unknown/task" }],
  });
  assert.throws(
    () => validateEvaluationFailureRegistry(exampleRegistry, malformedTask),
    expectCode("invalidContext"),
  );

  const malformedExpectedPaths = context({
    taskExpectedPaths: [
      { paths: ["z.ts", "a.ts"], taskId: "typescript-inclusive-range" },
    ],
  });
  assert.throws(
    () =>
      validateEvaluationFailureRegistry(
        exampleRegistry,
        malformedExpectedPaths,
      ),
    expectCode("invalidContext"),
  );
});
