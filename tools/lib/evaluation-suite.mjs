import {
  lstatSync,
  mkdirSync,
  opendirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const EVALUATION_LIMITS = Object.freeze({
  count: 16,
  elapsedMilliseconds: 86_400_000,
  fileBytes: 65_536,
  filesPerSnapshot: 32,
  metricCount: 10_000,
  pathBytes: 256,
  pathSegments: 16,
  recordBytes: 8_192,
  runIdCodeUnits: 48,
  snapshotBytes: 262_144,
  taskBytes: 4_096,
  treeDirectories: 512,
});

const TASK_ID_MAX_CODE_UNITS = 48;
const CORPUS_PREFIX_PATH_BYTES = 6 + TASK_ID_MAX_CODE_UNITS + 10;
const CORPUS_PREFIX_PATH_SEGMENTS = 3;

const CORPUS_TREE_LIMITS = Object.freeze({
  directories: 2 + EVALUATION_LIMITS.count *
    (1 + 2 * EVALUATION_LIMITS.treeDirectories),
  fileBytes: EVALUATION_LIMITS.fileBytes,
  files: 1 + EVALUATION_LIMITS.count *
    (1 + 2 * EVALUATION_LIMITS.filesPerSnapshot),
  pathBytes: EVALUATION_LIMITS.pathBytes + CORPUS_PREFIX_PATH_BYTES,
  pathSegments: EVALUATION_LIMITS.pathSegments +
    CORPUS_PREFIX_PATH_SEGMENTS,
  totalBytes: EVALUATION_LIMITS.taskBytes + EVALUATION_LIMITS.count *
    (EVALUATION_LIMITS.taskBytes + 2 * EVALUATION_LIMITS.snapshotBytes),
});
const SNAPSHOT_TREE_LIMITS = Object.freeze({
  directories: EVALUATION_LIMITS.treeDirectories,
  fileBytes: EVALUATION_LIMITS.fileBytes,
  files: EVALUATION_LIMITS.filesPerSnapshot,
  pathBytes: EVALUATION_LIMITS.pathBytes,
  pathSegments: EVALUATION_LIMITS.pathSegments,
  totalBytes: EVALUATION_LIMITS.snapshotBytes,
});

const CATEGORIES = Object.freeze(["bug-fix", "documentation", "refactor"]);
const PROJECT_KINDS = Object.freeze([
  "c",
  "documentation",
  "javascript",
  "typescript",
  "web",
]);
const OUTCOMES = Object.freeze(["failure", "partial", "success"]);
const ARTIFACTS = Object.freeze([
  "accepted-alternative",
  "different",
  "exact",
]);
const CONSTRAINTS = Object.freeze([
  "approval",
  "model",
  "none",
  "operator",
  "provider",
  "runtime",
  "task",
  "tool",
  "tui",
]);
const METRIC_KEYS = Object.freeze([
  "approvals",
  "elapsedMilliseconds",
  "manualCorrections",
  "repeatedReads",
  "riskyActions",
  "toolCalls",
  "turns",
]);
const TASK_SECTIONS = Object.freeze(["Goal", "Constraints", "Completion"]);
const TASK_ID = /^[a-z][a-z0-9-]{0,47}$/u;
const RUN_ID = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/u;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/u;
const WINDOWS_DEVICE_NAME =
  /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/u;
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const SECRET_EXTENSIONS = Object.freeze([
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);
const SECRET_NAMES = Object.freeze([
  ".git-credentials",
  ".netrc",
  ".npmrc",
  "_netrc",
  "credentials",
  "credentials.json",
  "id_ed25519",
  "id_rsa",
]);
const SECRET_SEGMENTS = Object.freeze([
  ".aws",
  ".azure",
  ".env",
  ".git",
  ".gnupg",
  ".kube",
  ".ssh",
]);

export class EvaluationSuiteError extends Error {
  constructor(code) {
    super("evaluation " + code);
    this.name = "EvaluationSuiteError";
    this.code = code;
  }
}

function fail(code) {
  throw new EvaluationSuiteError(code);
}

function contain(operation) {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EvaluationSuiteError) {
      throw error;
    }
    fail("io");
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, code) {
  if (!isRecord(value)) {
    fail(code);
  }
  const actual = Object.keys(value).sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  const canonical = [...expected].sort((left, right) =>
    left.localeCompare(right, "en"),
  );
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(code);
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function unique(values, code) {
  if (new Set(values).size !== values.length) {
    fail(code);
  }
}

function strictText(bytes, maximumBytes, code) {
  if (!(bytes instanceof Uint8Array) || bytes.length > maximumBytes) {
    fail(code);
  }
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
  if (
    text.length === 0 ||
    text.startsWith("\uFEFF") ||
    text.includes("\r") ||
    !text.endsWith("\n") ||
    UNSAFE_TEXT.test(text) ||
    /[ \t]+$/mu.test(text)
  ) {
    fail(code);
  }
  return text;
}

function readRegularFile(file, maximumBytes, code) {
  const state = lstatSync(file, { throwIfNoEntry: false });
  if (
    state === undefined ||
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.size > maximumBytes
  ) {
    fail(code);
  }
  const bytes = readFileSync(file);
  if (bytes.length > maximumBytes) {
    fail(code);
  }
  return bytes;
}

function safeRelativePath(value, maximumBytes, maximumSegments, code) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !SAFE_PATH.test(value) ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    new TextEncoder().encode(value).length > maximumBytes
  ) {
    fail(code);
  }
  const normalized = path.posix.normalize(value);
  const segments = value.split("/");
  if (
    normalized !== value ||
    segments.length > maximumSegments ||
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    fail(code);
  }
  const lowered = segments.map((segment) => segment.toLowerCase());
  const finalName = lowered.at(-1) ?? "";
  if (
    lowered.some(
      (segment) =>
        SECRET_SEGMENTS.includes(segment) ||
        SECRET_NAMES.includes(segment) ||
        segment.startsWith(".env.") ||
        WINDOWS_DEVICE_NAME.test(segment) ||
        segment.endsWith("."),
    ) ||
    SECRET_EXTENSIONS.some((extension) => finalName.endsWith(extension))
  ) {
    fail(code);
  }
  return value;
}

function readDirectoryEntries(directory, maximumEntries, code) {
  const handle = opendirSync(directory);
  const entries = [];
  try {
    for (;;) {
      const entry = handle.readSync();
      if (entry === null) {
        break;
      }
      if (entries.length >= maximumEntries) {
        fail(code);
      }
      entries.push(entry);
    }
  } finally {
    handle.closeSync();
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function readTree(directory, rootPrefix, code, limits) {
  const rootState = lstatSync(directory, { throwIfNoEntry: false });
  if (rootState === undefined || !rootState.isDirectory() || rootState.isSymbolicLink()) {
    fail(code);
  }
  const files = new Map();
  let directoryCount = 0;
  let totalBytes = 0;

  function visit(current, relative) {
    directoryCount += 1;
    if (directoryCount > limits.directories) {
      fail(code);
    }
    const entries = readDirectoryEntries(
      current,
      limits.files + limits.directories,
      code,
    );
    for (const entry of entries) {
      const childRelative = relative.length === 0
        ? entry.name
        : relative + "/" + entry.name;
      const ownedPath = rootPrefix.length === 0
        ? childRelative
        : rootPrefix + "/" + childRelative;
      safeRelativePath(
        ownedPath,
        limits.pathBytes,
        limits.pathSegments,
        code,
      );
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        fail(code);
      }
      if (entry.isDirectory()) {
        visit(absolute, childRelative);
      } else if (entry.isFile()) {
        if (files.size >= limits.files || files.has(ownedPath)) {
          fail(code);
        }
        const bytes = readRegularFile(absolute, limits.fileBytes, code);
        totalBytes += bytes.length;
        if (totalBytes > limits.totalBytes) {
          fail(code);
        }
        files.set(ownedPath, bytes);
      } else {
        fail(code);
      }
    }
  }

  visit(directory, "");
  return files;
}

function snapshot(prefix, files, options) {
  const { allowEmpty, code } = options;
  const marker = prefix + "/";
  const entries = [];
  let totalBytes = 0;
  for (const [ownedPath, bytes] of files) {
    if (!ownedPath.startsWith(marker)) {
      continue;
    }
    const relative = ownedPath.slice(marker.length);
    safeRelativePath(
      relative,
      EVALUATION_LIMITS.pathBytes,
      EVALUATION_LIMITS.pathSegments,
      code,
    );
    const text = strictText(bytes, EVALUATION_LIMITS.fileBytes, code);
    totalBytes += bytes.length;
    entries.push(Object.freeze({
      bytes: bytes.length,
      path: relative,
      text,
    }));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
  unique(entries.map((entry) => entry.path.toLowerCase()), code);
  if (
    (!allowEmpty && entries.length === 0) ||
    entries.length > EVALUATION_LIMITS.filesPerSnapshot ||
    totalBytes > EVALUATION_LIMITS.snapshotBytes
  ) {
    fail(code);
  }
  return Object.freeze(entries);
}

function sameSnapshot(left, right) {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right.at(index);
    return candidate !== undefined &&
      entry.path === candidate.path &&
      entry.text === candidate.text;
  });
}

function taskBrief(text, title) {
  if (!text.startsWith("# " + title + "\n\n")) {
    fail("invalidCorpus");
  }
  const headings = [...text.matchAll(/^## ([^\r\n]+)$/gmu)].map(
    (match) => match.at(1),
  );
  if (JSON.stringify(headings) !== JSON.stringify(TASK_SECTIONS)) {
    fail("invalidCorpus");
  }
  for (const section of TASK_SECTIONS) {
    const marker = "## " + section + "\n\n";
    const start = text.indexOf(marker);
    const next = text.indexOf("\n## ", start + marker.length);
    const body = text.slice(
      start + marker.length,
      next < 0 ? text.length : next + 1,
    ).trim();
    if (body.length < 20) {
      fail("invalidCorpus");
    }
  }
}

function validateTask(value, files) {
  exactKeys(value, ["category", "id", "projectKind", "title"], "invalidPolicy");
  if (
    typeof value.id !== "string" ||
    !TASK_ID.test(value.id) ||
    WINDOWS_DEVICE_NAME.test(value.id) ||
    !CATEGORIES.includes(value.category) ||
    !PROJECT_KINDS.includes(value.projectKind) ||
    typeof value.title !== "string" ||
    value.title.length < 12 ||
    value.title.length > 80 ||
    value.title !== value.title.trim() ||
    /[^A-Za-z0-9 ,'-]/u.test(value.title)
  ) {
    fail("invalidPolicy");
  }
  const base = "tasks/" + value.id;
  const briefPath = base + "/TASK.md";
  const briefBytes = files.get(briefPath);
  if (briefBytes === undefined) {
    fail("invalidCorpus");
  }
  const brief = strictText(
    briefBytes,
    EVALUATION_LIMITS.taskBytes,
    "invalidCorpus",
  );
  taskBrief(brief, value.title);
  const input = snapshot(base + "/input", files, {
    allowEmpty: false,
    code: "invalidCorpus",
  });
  const expected = snapshot(base + "/expected", files, {
    allowEmpty: false,
    code: "invalidCorpus",
  });
  if (sameSnapshot(input, expected)) {
    fail("invalidCorpus");
  }
  return Object.freeze({
    category: value.category,
    expected,
    id: value.id,
    input,
    projectKind: value.projectKind,
    task: brief,
    title: value.title,
  });
}

/** Validates one immutable manifest and complete evaluation file inventory. */
export function validateEvaluationSuite(policy, context) {
  return contain(() => {
    exactKeys(context, ["files", "ownedPaths"], "invalidCorpus");
    if (!(context.files instanceof Map) || !Array.isArray(context.ownedPaths)) {
      fail("invalidCorpus");
    }
    exactKeys(policy, ["schemaVersion", "tasks"], "invalidPolicy");
    if (
      policy.schemaVersion !== 1 ||
      !Array.isArray(policy.tasks) ||
      policy.tasks.length === 0 ||
      policy.tasks.length > EVALUATION_LIMITS.count
    ) {
      fail("invalidPolicy");
    }
    const tasks = policy.tasks.map((task) => validateTask(task, context.files));
    const ids = tasks.map((task) => task.id);
    unique(ids, "invalidPolicy");
    if (JSON.stringify(ids) !== JSON.stringify(sorted(ids))) {
      fail("invalidPolicy");
    }
    const expectedPaths = ["README.md"];
    const readmeBytes = context.files.get("README.md");
    if (readmeBytes === undefined) {
      fail("invalidCorpus");
    }
    strictText(readmeBytes, EVALUATION_LIMITS.taskBytes, "invalidCorpus");
    for (const task of tasks) {
      const base = "tasks/" + task.id;
      expectedPaths.push(base + "/TASK.md");
      expectedPaths.push(...task.input.map((entry) => base + "/input/" + entry.path));
      expectedPaths.push(...task.expected.map(
        (entry) => base + "/expected/" + entry.path,
      ));
    }
    const actualPaths = sorted(context.ownedPaths);
    if (JSON.stringify(sorted(expectedPaths)) !== JSON.stringify(actualPaths)) {
      fail("invalidCorpus");
    }
    return Object.freeze({ schemaVersion: 1, tasks: Object.freeze(tasks) });
  });
}

/** Loads and validates the canonical evaluation suite from one repository. */
export function loadEvaluationSuite(repositoryRoot) {
  return contain(() => {
    const root = path.resolve(repositoryRoot);
    const policyText = strictText(
      readRegularFile(
        path.join(root, "tools/evaluation-policy.json"),
        EVALUATION_LIMITS.recordBytes,
        "invalidPolicy",
      ),
      EVALUATION_LIMITS.recordBytes,
      "invalidPolicy",
    );
    let policy;
    try {
      policy = JSON.parse(policyText);
    } catch {
      fail("invalidPolicy");
    }
    const files = readTree(
      path.join(root, "evaluations"),
      "",
      "invalidCorpus",
      CORPUS_TREE_LIMITS,
    );
    return validateEvaluationSuite(policy, {
      files,
      ownedPaths: sorted([...files.keys()]),
    });
  });
}

function taskById(suite, taskId) {
  if (typeof taskId !== "string" || !TASK_ID.test(taskId)) {
    fail("invalidTask");
  }
  const task = suite.tasks.find((candidate) => candidate.id === taskId);
  if (task === undefined) {
    fail("invalidTask");
  }
  return task;
}

function validRunId(runId) {
  if (
    typeof runId !== "string" ||
    runId.length > EVALUATION_LIMITS.runIdCodeUnits ||
    !RUN_ID.test(runId) ||
    WINDOWS_DEVICE_NAME.test(runId)
  ) {
    fail("invalidRun");
  }
  return runId;
}

function statePaths(repositoryRoot, taskId, runId) {
  const stateRoot = path.join(path.resolve(repositoryRoot), "state", "evaluations");
  const taskRoot = path.join(stateRoot, taskId);
  return Object.freeze({
    final: path.join(taskRoot, runId),
    record: path.join(taskRoot, runId, "record.json"),
    staging: path.join(taskRoot, runId + ".preparing"),
    stateRoot,
    taskRoot,
    workspace: path.join(taskRoot, runId, "workspace"),
  });
}

function metricTemplate() {
  return {
    approvals: null,
    elapsedMilliseconds: null,
    manualCorrections: null,
    repeatedReads: null,
    riskyActions: null,
    toolCalls: null,
    turns: null,
  };
}

function recordTemplate(taskId, runId) {
  return {
    artifact: "pending",
    metrics: metricTemplate(),
    outcome: "pending",
    primaryConstraint: "pending",
    runId,
    schemaVersion: 1,
    taskId,
  };
}

function ensureOwnedDirectory(parent, name) {
  const parentState = lstatSync(parent, { throwIfNoEntry: false });
  if (
    parentState === undefined ||
    !parentState.isDirectory() ||
    parentState.isSymbolicLink()
  ) {
    fail("unsafeRun");
  }
  const directory = path.join(parent, name);
  const state = lstatSync(directory, { throwIfNoEntry: false });
  if (state === undefined) {
    mkdirSync(directory);
    return directory;
  }
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail("unsafeRun");
  }
  return directory;
}

/** Creates one isolated run without exposing the expected snapshot. */
export function prepareEvaluationRun(repositoryRoot, taskId, runId) {
  return contain(() => {
    const suite = loadEvaluationSuite(repositoryRoot);
    const task = taskById(suite, taskId);
    validRunId(runId);
    const paths = statePaths(repositoryRoot, task.id, runId);
    const root = path.resolve(repositoryRoot);
    const stateRoot = ensureOwnedDirectory(root, "state");
    const evaluationsRoot = ensureOwnedDirectory(stateRoot, "evaluations");
    const taskRoot = ensureOwnedDirectory(evaluationsRoot, task.id);
    if (evaluationsRoot !== paths.stateRoot || taskRoot !== paths.taskRoot) {
      fail("unsafeRun");
    }
    if (
      lstatSync(paths.final, { throwIfNoEntry: false }) !== undefined ||
      lstatSync(paths.staging, { throwIfNoEntry: false }) !== undefined
    ) {
      fail("runExists");
    }
    let stagingCreated = false;
    try {
      mkdirSync(paths.staging);
      stagingCreated = true;
      const workspace = path.join(paths.staging, "workspace");
      mkdirSync(workspace);
      for (const entry of task.input) {
        const target = path.join(workspace, ...entry.path.split("/"));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, entry.text, { encoding: "utf8", flag: "wx" });
      }
      writeFileSync(
        path.join(paths.staging, "record.json"),
        JSON.stringify(recordTemplate(task.id, runId), null, 2) + "\n",
        { encoding: "utf8", flag: "wx" },
      );
      renameSync(paths.staging, paths.final);
      stagingCreated = false;
    } catch (error) {
      if (stagingCreated) {
        try {
          rmSync(paths.staging, { force: false, recursive: true });
        } catch {
          fail("cleanup");
        }
      }
      if (error instanceof EvaluationSuiteError) {
        throw error;
      }
      fail("prepareFailed");
    }
    return Object.freeze({
      record: paths.record,
      task: task.task,
      workspace: paths.workspace,
    });
  });
}

function workspaceSnapshot(directory) {
  const files = readTree(
    directory,
    "",
    "unsafeRun",
    SNAPSHOT_TREE_LIMITS,
  );
  return snapshot(
    "workspace",
    new Map(
      [...files].map(([ownedPath, bytes]) => ["workspace/" + ownedPath, bytes]),
    ),
    { allowEmpty: true, code: "unsafeRun" },
  );
}

function compareSnapshots(taskId, runId, expected, actual) {
  const expectedByPath = new Map(expected.map((entry) => [entry.path, entry]));
  const actualByPath = new Map(actual.map((entry) => [entry.path, entry]));
  const missing = [];
  const unexpected = [];
  const changed = [];
  for (const entry of expected) {
    const candidate = actualByPath.get(entry.path);
    if (candidate === undefined) {
      missing.push(entry.path);
    } else if (candidate.text !== entry.text) {
      changed.push(entry.path);
    }
  }
  for (const entry of actual) {
    if (!expectedByPath.has(entry.path)) {
      unexpected.push(entry.path);
    }
  }
  return Object.freeze({
    changed: Object.freeze(changed),
    exact: missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    missing: Object.freeze(missing),
    runId,
    taskId,
    unexpected: Object.freeze(unexpected),
  });
}

/** Grades one prepared workspace without executing or exposing its contents. */
export function gradeEvaluationRun(repositoryRoot, taskId, runId) {
  return contain(() => {
    const suite = loadEvaluationSuite(repositoryRoot);
    const task = taskById(suite, taskId);
    validRunId(runId);
    const paths = statePaths(repositoryRoot, task.id, runId);
    const finalState = lstatSync(paths.final, { throwIfNoEntry: false });
    if (
      finalState === undefined ||
      !finalState.isDirectory() ||
      finalState.isSymbolicLink()
    ) {
      fail("invalidRun");
    }
    return compareSnapshots(
      task.id,
      runId,
      task.expected,
      workspaceSnapshot(paths.workspace),
    );
  });
}

function boundedMetric(value, key) {
  const maximum = key === "elapsedMilliseconds"
    ? EVALUATION_LIMITS.elapsedMilliseconds
    : EVALUATION_LIMITS.metricCount;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    fail("invalidRecord");
  }
}

function validateCompletedRecord(record, grade, taskId, runId) {
  exactKeys(
    record,
    [
      "artifact",
      "metrics",
      "outcome",
      "primaryConstraint",
      "runId",
      "schemaVersion",
      "taskId",
    ],
    "invalidRecord",
  );
  exactKeys(record.metrics, METRIC_KEYS, "invalidRecord");
  if (
    record.schemaVersion !== 1 ||
    record.taskId !== taskId ||
    record.runId !== runId ||
    !OUTCOMES.includes(record.outcome) ||
    !ARTIFACTS.includes(record.artifact) ||
    !CONSTRAINTS.includes(record.primaryConstraint)
  ) {
    fail("invalidRecord");
  }
  for (const key of METRIC_KEYS) {
    boundedMetric(record.metrics[key], key);
  }
  if (
    (grade.exact && record.artifact !== "exact") ||
    (!grade.exact && record.artifact === "exact") ||
    (record.outcome === "success" &&
      record.artifact !== "exact" &&
      record.artifact !== "accepted-alternative") ||
    (record.outcome === "success" && record.primaryConstraint !== "none") ||
    (record.outcome !== "success" && record.primaryConstraint === "none")
  ) {
    fail("invalidRecord");
  }
  return Object.freeze({ artifact: record.artifact, outcome: record.outcome, valid: true });
}

/** Validates a completed content-free run record against the current grade. */
export function validateEvaluationRecord(repositoryRoot, taskId, runId) {
  return contain(() => {
    const grade = gradeEvaluationRun(repositoryRoot, taskId, runId);
    const paths = statePaths(repositoryRoot, taskId, runId);
    const text = strictText(
      readRegularFile(
        paths.record,
        EVALUATION_LIMITS.recordBytes,
        "invalidRecord",
      ),
      EVALUATION_LIMITS.recordBytes,
      "invalidRecord",
    );
    let record;
    try {
      record = JSON.parse(text);
    } catch {
      fail("invalidRecord");
    }
    return validateCompletedRecord(record, grade, taskId, runId);
  });
}

/** Lists the immutable registered task descriptors. */
export function listEvaluationTasks(repositoryRoot) {
  return Object.freeze(
    loadEvaluationSuite(repositoryRoot).tasks.map((task) =>
      Object.freeze({ id: task.id, title: task.title }),
    ),
  );
}
