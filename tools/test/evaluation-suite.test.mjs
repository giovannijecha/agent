import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  EVALUATION_FAILURE_LIMITS,
} from "../lib/evaluation-failure-registry.mjs";
import {
  EVALUATION_CORPUS_TREE_LIMITS,
  EVALUATION_LIMITS,
  EvaluationSuiteError,
  gradeEvaluationRun,
  listEvaluationTasks,
  loadEvaluationSuite,
  prepareEvaluationRun,
  validateEvaluationRecord,
  validateEvaluationSuite,
} from "../lib/evaluation-suite.mjs";
import { projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/evaluation-policy.json"), "utf8"),
);

function collect(directory, relative = "") {
  const files = new Map();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative.length === 0
      ? entry.name
      : relative + "/" + entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [ownedPath, bytes] of collect(absolute, childRelative)) {
        files.set(ownedPath, bytes);
      }
    } else if (entry.isFile()) {
      files.set(childRelative, readFileSync(absolute));
    }
  }
  return files;
}

function canonicalContext() {
  const files = collect(path.join(projectRoot, "evaluations"));
  return {
    files,
    ownedPaths: [...files.keys()].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectCode(code) {
  return (error) =>
    error instanceof EvaluationSuiteError &&
    error.code === code &&
    error.message === "evaluation " + code;
}

test("reserves complete corpus-tree capacity for the failure registry", () => {
  assert.equal(
    EVALUATION_CORPUS_TREE_LIMITS.directories,
    3 + EVALUATION_LIMITS.count *
      (1 + 2 * EVALUATION_LIMITS.treeDirectories),
  );
  assert.equal(
    EVALUATION_CORPUS_TREE_LIMITS.files,
    2 + EVALUATION_LIMITS.count *
      (1 + 2 * EVALUATION_LIMITS.filesPerSnapshot),
  );
  assert.equal(
    EVALUATION_CORPUS_TREE_LIMITS.totalBytes,
    EVALUATION_LIMITS.taskBytes +
      EVALUATION_FAILURE_LIMITS.registryBytes + EVALUATION_LIMITS.count *
        (EVALUATION_LIMITS.taskBytes + 2 * EVALUATION_LIMITS.snapshotBytes),
  );
  assert.equal(Object.isFrozen(EVALUATION_CORPUS_TREE_LIMITS), true);
});

test("treats the failure registry as inventory-only corpus evidence", () => {
  const corpus = canonicalContext();
  assert.equal(corpus.files.delete("failures/registry.json"), true);
  assert.doesNotThrow(() => validateEvaluationSuite(policy, corpus));
});

function temporaryRepository(t) {
  const root = mkdtempSync(path.join(tmpdir(), "agent-evaluation-"));
  mkdirSync(path.join(root, "tools"), { recursive: true });
  cpSync(path.join(projectRoot, "evaluations"), path.join(root, "evaluations"), {
    recursive: true,
  });
  cpSync(
    path.join(projectRoot, "tools/evaluation-policy.json"),
    path.join(root, "tools/evaluation-policy.json"),
  );
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function writeRecord(root, taskId, runId, overrides = {}) {
  const record = {
    artifact: "exact",
    metrics: {
      approvals: 0,
      elapsedMilliseconds: 1,
      manualCorrections: 0,
      repeatedReads: 0,
      riskyActions: 0,
      toolCalls: 1,
      turns: 1,
    },
    outcome: "success",
    primaryConstraint: "none",
    runId,
    schemaVersion: 1,
    taskId,
    ...overrides,
  };
  writeFileSync(
    path.join(root, "state/evaluations", taskId, runId, "record.json"),
    JSON.stringify(record, null, 2) + "\n",
  );
}

test("accepts the canonical bounded corpus", () => {
  const suite = validateEvaluationSuite(policy, canonicalContext());
  assert.deepEqual(
    suite.tasks.map((task) => [task.id, task.projectKind]),
    [
      ["c-count-positive", "c"],
      ["documentation-check-command", "documentation"],
      ["javascript-collapse-whitespace", "javascript"],
      ["typescript-inclusive-range", "typescript"],
      ["web-extract-script", "web"],
    ],
  );
  assert.deepEqual(
    listEvaluationTasks(projectRoot).map((task) => task.id),
    suite.tasks.map((task) => task.id),
  );
});

test("keeps failure registry contents outside evaluator task operations", (t) => {
  const root = temporaryRepository(t);
  const registry = path.join(root, "evaluations/failures/registry.json");
  const taskId = "c-count-positive";
  const runId = "inventory-only";
  writeFileSync(registry, Buffer.alloc(EVALUATION_LIMITS.fileBytes + 1, 65));

  assert.deepEqual(
    listEvaluationTasks(root).map((task) => task.id),
    policy.tasks.map((task) => task.id),
  );
  const prepared = prepareEvaluationRun(root, taskId, runId);
  rmSync(prepared.workspace, { recursive: true });
  cpSync(
    path.join(root, "evaluations/tasks", taskId, "expected"),
    prepared.workspace,
    { recursive: true },
  );
  assert.equal(gradeEvaluationRun(root, taskId, runId).exact, true);
  writeRecord(root, taskId, runId);
  assert.deepEqual(validateEvaluationRecord(root, taskId, runId), {
    artifact: "exact",
    outcome: "success",
    valid: true,
  });

  rmSync(registry);
  mkdirSync(registry);
  writeFileSync(path.join(registry, "unreadable.txt"), "ignored metadata\n");
  assert.deepEqual(
    listEvaluationTasks(root).map((task) => task.id),
    policy.tasks.map((task) => task.id),
  );
});

test("rejects manifest key drift, duplicate tasks, and noncanonical order", () => {
  const withUnknown = clone(policy);
  withUnknown.extra = true;
  assert.throws(
    () => validateEvaluationSuite(withUnknown, canonicalContext()),
    expectCode("invalidPolicy"),
  );

  const duplicate = clone(policy);
  duplicate.tasks.push(clone(duplicate.tasks.at(0)));
  assert.throws(
    () => validateEvaluationSuite(duplicate, canonicalContext()),
    expectCode("invalidPolicy"),
  );

  const reversed = clone(policy);
  reversed.tasks.reverse();
  assert.throws(
    () => validateEvaluationSuite(reversed, canonicalContext()),
    expectCode("invalidPolicy"),
  );
});

test("rejects unregistered, unsafe, malformed, and identical corpus states", () => {
  const unregistered = canonicalContext();
  unregistered.files.set("unregistered.txt", Buffer.from("bounded\n"));
  unregistered.ownedPaths.push("unregistered.txt");
  assert.throws(
    () => validateEvaluationSuite(policy, unregistered),
    expectCode("invalidCorpus"),
  );

  const missingRegistry = canonicalContext();
  missingRegistry.files.delete("failures/registry.json");
  missingRegistry.ownedPaths = missingRegistry.ownedPaths.filter(
    (ownedPath) => ownedPath !== "failures/registry.json",
  );
  assert.throws(
    () => validateEvaluationSuite(policy, missingRegistry),
    expectCode("invalidCorpus"),
  );

  const unsafe = canonicalContext();
  const unsafePath = "tasks/c-count-positive/input/.env";
  unsafe.files.set(unsafePath, Buffer.from("secret material\n"));
  unsafe.ownedPaths.push(unsafePath);
  assert.throws(
    () => validateEvaluationSuite(policy, unsafe),
    expectCode("invalidCorpus"),
  );

  const malformed = canonicalContext();
  malformed.files.set("README.md", Buffer.from("private fixture text \n"));
  let diagnostic;
  try {
    validateEvaluationSuite(policy, malformed);
  } catch (error) {
    diagnostic = error;
  }
  assert.equal(expectCode("invalidCorpus")(diagnostic), true);
  assert.equal(diagnostic.message.includes("private fixture text"), false);

  const identical = canonicalContext();
  identical.files.set(
    "tasks/c-count-positive/input/main.c",
    identical.files.get("tasks/c-count-positive/expected/main.c"),
  );
  assert.throws(
    () => validateEvaluationSuite(policy, identical),
    expectCode("invalidCorpus"),
  );
});

test("enforces task, snapshot, and path bounds", () => {
  const oversizedTask = canonicalContext();
  oversizedTask.files.set(
    "tasks/c-count-positive/TASK.md",
    Buffer.alloc(EVALUATION_LIMITS.taskBytes + 1, 65),
  );
  assert.throws(
    () => validateEvaluationSuite(policy, oversizedTask),
    expectCode("invalidCorpus"),
  );

  const oversizedFile = canonicalContext();
  oversizedFile.files.set(
    "tasks/c-count-positive/input/main.c",
    Buffer.alloc(EVALUATION_LIMITS.fileBytes + 1, 65),
  );
  assert.throws(
    () => validateEvaluationSuite(policy, oversizedFile),
    expectCode("invalidCorpus"),
  );

  const longPath = canonicalContext();
  const ownedPath = "tasks/c-count-positive/input/" + "a".repeat(260) + ".c";
  longPath.files.set(ownedPath, Buffer.from("bounded\n"));
  longPath.ownedPaths.push(ownedPath);
  assert.throws(
    () => validateEvaluationSuite(policy, longPath),
    expectCode("invalidCorpus"),
  );

  const tooManyFiles = canonicalContext();
  for (let index = 0; index < EVALUATION_LIMITS.filesPerSnapshot; index += 1) {
    const ownedPath =
      "tasks/c-count-positive/input/extra-" + String(index) + ".c";
    tooManyFiles.files.set(ownedPath, Buffer.from("bounded\n"));
    tooManyFiles.ownedPaths.push(ownedPath);
  }
  assert.throws(
    () => validateEvaluationSuite(policy, tooManyFiles),
    expectCode("invalidCorpus"),
  );

  const oversizedSnapshot = canonicalContext();
  for (let index = 0; index < 5; index += 1) {
    const ownedPath =
      "tasks/c-count-positive/input/large-" + String(index) + ".c";
    const bytes = Buffer.concat([
      Buffer.alloc(EVALUATION_LIMITS.fileBytes - 1, 65),
      Buffer.from("\n"),
    ]);
    oversizedSnapshot.files.set(ownedPath, bytes);
    oversizedSnapshot.ownedPaths.push(ownedPath);
  }
  assert.throws(
    () => validateEvaluationSuite(policy, oversizedSnapshot),
    expectCode("invalidCorpus"),
  );
});

test("rejects nonportable and case-colliding fixture paths", () => {
  const deviceTask = clone(policy);
  deviceTask.tasks.at(0).id = "con";
  assert.throws(
    () => validateEvaluationSuite(deviceTask, canonicalContext()),
    expectCode("invalidPolicy"),
  );

  for (const relative of ["NUL.txt", "id_rsa", "source."]) {
    const context = canonicalContext();
    const ownedPath = "tasks/c-count-positive/input/" + relative;
    context.files.set(ownedPath, Buffer.from("bounded\n"));
    context.ownedPaths.push(ownedPath);
    assert.throws(
      () => validateEvaluationSuite(policy, context),
      expectCode("invalidCorpus"),
    );
  }

  const collision = canonicalContext();
  const collisionPath = "tasks/c-count-positive/input/MAIN.c";
  collision.files.set(collisionPath, Buffer.from("bounded\n"));
  collision.ownedPaths.push(collisionPath);
  assert.throws(
    () => validateEvaluationSuite(policy, collision),
    expectCode("invalidCorpus"),
  );
});

test("loads snapshot-relative paths at the exact portable boundary", (t) => {
  const root = temporaryRepository(t);
  const relative = [
    ...Array.from({ length: 15 }, (_value, index) => "d" + String(index)),
    "f.c",
  ].join("/");
  for (const snapshotName of ["input", "expected"]) {
    const target = path.join(
      root,
      "evaluations/tasks/c-count-positive",
      snapshotName,
      ...relative.split("/"),
    );
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "bounded\n");
  }
  const suite = loadEvaluationSuite(root);
  const task = suite.tasks.find((candidate) =>
    candidate.id === "c-count-positive"
  );
  assert.equal(task?.input.some((entry) => entry.path === relative), true);
  assert.equal(task?.expected.some((entry) => entry.path === relative), true);
});

test("prepares only the input snapshot and refuses reuse", (t) => {
  const root = temporaryRepository(t);
  const prepared = prepareEvaluationRun(
    root,
    "javascript-collapse-whitespace",
    "run-01",
  );
  assert.equal(
    readFileSync(path.join(prepared.workspace, "src/slug.js"), "utf8"),
    readFileSync(
      path.join(root, "evaluations/tasks/javascript-collapse-whitespace/input/src/slug.js"),
      "utf8",
    ),
  );
  assert.equal(
    readFileSync(prepared.record, "utf8").includes('"outcome": "pending"'),
    true,
  );
  assert.equal(
    collect(path.dirname(prepared.workspace)).has("expected/src/slug.js"),
    false,
  );
  assert.throws(
    () => prepareEvaluationRun(root, "javascript-collapse-whitespace", "run-01"),
    expectCode("runExists"),
  );
});

test("rejects Windows device names as portable run identifiers", (t) => {
  const root = temporaryRepository(t);
  for (const runId of ["con", "nul", "com1", "lpt1"]) {
    assert.throws(
      () => prepareEvaluationRun(root, "c-count-positive", runId),
      expectCode("invalidRun"),
    );
  }
  assert.equal(
    prepareEvaluationRun(root, "c-count-positive", "con-run").workspace,
    path.join(root, "state/evaluations/c-count-positive/con-run/workspace"),
  );
});

test("rejects a non-directory state boundary before preparation", (t) => {
  const root = temporaryRepository(t);
  writeFileSync(path.join(root, "state"), "not a directory\n");
  assert.throws(
    () => prepareEvaluationRun(root, "c-count-positive", "run-01"),
    expectCode("unsafeRun"),
  );
});

test("bounds workspace traversal before grading", (t) => {
  const root = temporaryRepository(t);
  const taskId = "c-count-positive";
  const prepared = prepareEvaluationRun(root, taskId, "directories");
  for (let index = 0; index < EVALUATION_LIMITS.treeDirectories; index += 1) {
    mkdirSync(path.join(prepared.workspace, "empty-" + String(index)));
  }
  assert.throws(
    () => gradeEvaluationRun(root, taskId, "directories"),
    expectCode("unsafeRun"),
  );
});

test("grades changed, missing, unexpected, and exact workspace trees", (t) => {
  const root = temporaryRepository(t);
  const taskId = "javascript-collapse-whitespace";
  const changed = prepareEvaluationRun(root, taskId, "changed");
  assert.deepEqual(gradeEvaluationRun(root, taskId, "changed"), {
    changed: ["src/slug.js"],
    exact: false,
    missing: [],
    runId: "changed",
    taskId,
    unexpected: [],
  });
  unlinkSync(path.join(changed.workspace, "src/slug.js"));
  writeFileSync(path.join(changed.workspace, "extra.txt"), "extra\n");
  assert.deepEqual(gradeEvaluationRun(root, taskId, "changed"), {
    changed: [],
    exact: false,
    missing: ["src/slug.js"],
    runId: "changed",
    taskId,
    unexpected: ["extra.txt"],
  });

  const exact = prepareEvaluationRun(root, taskId, "exact");
  rmSync(exact.workspace, { recursive: true });
  cpSync(
    path.join(root, "evaluations/tasks", taskId, "expected"),
    exact.workspace,
    { recursive: true },
  );
  assert.equal(gradeEvaluationRun(root, taskId, "exact").exact, true);
});

test("grades an empty candidate workspace as an ordinary failed artifact", (t) => {
  const root = temporaryRepository(t);
  const taskId = "c-count-positive";
  const runId = "empty";
  const prepared = prepareEvaluationRun(root, taskId, runId);
  rmSync(prepared.workspace, { recursive: true });
  mkdirSync(prepared.workspace);
  assert.deepEqual(gradeEvaluationRun(root, taskId, runId), {
    changed: [],
    exact: false,
    missing: ["main.c"],
    runId,
    taskId,
    unexpected: [],
  });
  writeRecord(root, taskId, runId, {
    artifact: "different",
    outcome: "failure",
    primaryConstraint: "model",
  });
  assert.deepEqual(validateEvaluationRecord(root, taskId, runId), {
    artifact: "different",
    outcome: "failure",
    valid: true,
  });
});

test("binds closed completed records to the current grade", (t) => {
  const root = temporaryRepository(t);
  const taskId = "c-count-positive";
  const prepared = prepareEvaluationRun(root, taskId, "record");
  rmSync(prepared.workspace, { recursive: true });
  cpSync(
    path.join(root, "evaluations/tasks", taskId, "expected"),
    prepared.workspace,
    { recursive: true },
  );
  writeRecord(root, taskId, "record");
  assert.deepEqual(validateEvaluationRecord(root, taskId, "record"), {
    artifact: "exact",
    outcome: "success",
    valid: true,
  });

  writeRecord(root, taskId, "record", {
    metrics: {
      approvals: 0,
      elapsedMilliseconds: EVALUATION_LIMITS.elapsedMilliseconds + 1,
      manualCorrections: 0,
      repeatedReads: 0,
      riskyActions: 0,
      toolCalls: 1,
      turns: 1,
    },
  });
  assert.throws(
    () => validateEvaluationRecord(root, taskId, "record"),
    expectCode("invalidRecord"),
  );

  writeRecord(root, taskId, "record", {
    artifact: "different",
    outcome: "success",
  });
  assert.throws(
    () => validateEvaluationRecord(root, taskId, "record"),
    expectCode("invalidRecord"),
  );

  writeRecord(root, taskId, "record", { note: "not admitted" });
  assert.throws(
    () => validateEvaluationRecord(root, taskId, "record"),
    expectCode("invalidRecord"),
  );

  writeFileSync(
    path.join(root, "state/evaluations", taskId, "record", "record.json"),
    "A".repeat(EVALUATION_LIMITS.recordBytes + 1),
  );
  assert.throws(
    () => validateEvaluationRecord(root, taskId, "record"),
    expectCode("invalidRecord"),
  );
});

test("accepts an explicitly reviewed alternative without inferring it", (t) => {
  const root = temporaryRepository(t);
  const taskId = "c-count-positive";
  prepareEvaluationRun(root, taskId, "alternative");
  writeRecord(root, taskId, "alternative", {
    artifact: "accepted-alternative",
  });
  assert.equal(gradeEvaluationRun(root, taskId, "alternative").exact, false);
  assert.deepEqual(validateEvaluationRecord(root, taskId, "alternative"), {
    artifact: "accepted-alternative",
    outcome: "success",
    valid: true,
  });
});

test("the CLI lists only canonical identifiers", () => {
  const result = spawnSync(process.execPath, ["tools/evaluate.mjs", "list"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    policy.tasks.map((task) => task.id).join("\n") + "\n",
  );
  assert.equal(result.stderr, "");
});
