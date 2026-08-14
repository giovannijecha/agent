export const EVALUATION_FAILURE_LIMITS = Object.freeze({
  entries: 64,
  idCodeUnits: 64,
  occurrences: 10_000,
  pathBytes: 256,
  pathSegments: 16,
  pathsPerGradeSet: 32,
  registryBytes: 32_768,
});

const ARTIFACTS = Object.freeze([
  "accepted-alternative",
  "different",
  "exact",
]);
const CATEGORIES = Object.freeze([
  "approval",
  "comprehension",
  "context",
  "planning",
  "provider",
  "quality",
  "runtime",
  "security",
  "tool",
  "tui",
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
const OUTCOMES = Object.freeze(["failure", "partial", "success"]);
const PRIORITIES = Object.freeze(["p0", "p1", "p2", "p3"]);
const STATUSES = Object.freeze(["actionable", "observing", "resolved"]);
const ENTRY_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const TASK_ID = /^[a-z][a-z0-9-]{0,47}$/u;
const SAFE_PATH = /^[A-Za-z0-9._/-]+$/u;
const WINDOWS_DEVICE_NAME =
  /^(?:aux|con|nul|prn|com[1-9]|lpt[1-9])(?:\.|$)/u;
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
const RESOLUTION_PREFIXES = Object.freeze([
  "docs/decisions/",
  "packages/",
  "tools/test/",
]);

export class EvaluationFailureRegistryError extends Error {
  constructor(code) {
    super("evaluation failure registry " + code);
    this.name = "EvaluationFailureRegistryError";
    this.code = code;
  }
}

function fail(code) {
  throw new EvaluationFailureRegistryError(code);
}

/**
 * Parses one bounded canonical registry source without exposing rejected
 * content.
 */
export function parseEvaluationFailureRegistry(source) {
  if (
    !(source instanceof Uint8Array) ||
    source.byteLength < 1 ||
    source.byteLength > EVALUATION_FAILURE_LIMITS.registryBytes
  ) {
    fail("invalidRegistry");
  }
  let registry;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(source);
    registry = JSON.parse(text);
  } catch {
    fail("invalidRegistry");
  }
  const canonical = new TextEncoder().encode(
    JSON.stringify(registry, null, 2) + "\n",
  );
  if (
    source.byteLength !== canonical.byteLength ||
    canonical.some((byte, index) => byte !== source.at(index))
  ) {
    fail("invalidRegistry");
  }
  return registry;
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

function safeRelativePath(value, code) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !SAFE_PATH.test(value) ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    new TextEncoder().encode(value).length >
      EVALUATION_FAILURE_LIMITS.pathBytes
  ) {
    fail(code);
  }
  const segments = value.split("/");
  if (
    segments.length > EVALUATION_FAILURE_LIMITS.pathSegments ||
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

function validatePathSet(value) {
  if (
    !Array.isArray(value) ||
    value.length > EVALUATION_FAILURE_LIMITS.pathsPerGradeSet
  ) {
    fail("invalidEvidence");
  }
  const paths = value.map((entry) =>
    safeRelativePath(entry, "invalidEvidence"),
  );
  if (
    JSON.stringify(paths) !== JSON.stringify(sorted(paths)) ||
    new Set(paths.map((entry) => entry.toLowerCase())).size !== paths.length
  ) {
    fail("invalidEvidence");
  }
  return paths;
}

function validateEvidence(value) {
  exactKeys(
    value,
    [
      "artifact",
      "changed",
      "missing",
      "outcome",
      "primaryConstraint",
      "unexpected",
    ],
    "invalidEvidence",
  );
  if (
    !ARTIFACTS.includes(value.artifact) ||
    !OUTCOMES.includes(value.outcome) ||
    !CONSTRAINTS.includes(value.primaryConstraint)
  ) {
    fail("invalidEvidence");
  }
  const changed = validatePathSet(value.changed);
  const missing = validatePathSet(value.missing);
  const unexpected = validatePathSet(value.unexpected);
  const allPaths = [...changed, ...missing, ...unexpected];
  if (new Set(allPaths.map((entry) => entry.toLowerCase())).size !== allPaths.length) {
    fail("invalidEvidence");
  }
  const exact = allPaths.length === 0;
  if (
    (value.artifact === "exact") !== exact ||
    value.outcome === "success" ||
    value.primaryConstraint === "none"
  ) {
    fail("invalidEvidence");
  }
}

function validateResolution(entry, repositoryPaths) {
  if (entry.status !== "resolved") {
    if (entry.resolution !== null) {
      fail("invalidLifecycle");
    }
    return;
  }
  const resolution = safeRelativePath(entry.resolution, "invalidLifecycle");
  if (
    !RESOLUTION_PREFIXES.some((prefix) => resolution.startsWith(prefix)) ||
    !repositoryPaths.has(resolution)
  ) {
    fail("invalidLifecycle");
  }
}

function validateEntry(value, taskIds, repositoryPaths) {
  exactKeys(
    value,
    [
      "category",
      "evidence",
      "id",
      "occurrences",
      "priority",
      "resolution",
      "status",
      "taskId",
    ],
    "invalidEntry",
  );
  if (
    typeof value.id !== "string" ||
    value.id.length > EVALUATION_FAILURE_LIMITS.idCodeUnits ||
    !ENTRY_ID.test(value.id) ||
    WINDOWS_DEVICE_NAME.test(value.id) ||
    typeof value.taskId !== "string" ||
    !TASK_ID.test(value.taskId) ||
    !taskIds.has(value.taskId) ||
    !CATEGORIES.includes(value.category) ||
    !PRIORITIES.includes(value.priority) ||
    !STATUSES.includes(value.status) ||
    !Number.isSafeInteger(value.occurrences) ||
    value.occurrences < 1 ||
    value.occurrences > EVALUATION_FAILURE_LIMITS.occurrences
  ) {
    fail("invalidEntry");
  }
  validateEvidence(value.evidence);
  if (value.occurrences === 1 && value.status !== "observing") {
    fail("invalidLifecycle");
  }
  validateResolution(value, repositoryPaths);
  return value.id;
}

/** Validates the closed versioned failure evidence registry. */
export function validateEvaluationFailureRegistry(registry, context) {
  exactKeys(
    context,
    ["repositoryPaths", "sourceBytes", "taskIds"],
    "invalidContext",
  );
  if (
    !Array.isArray(context.repositoryPaths) ||
    !Number.isSafeInteger(context.sourceBytes) ||
    context.sourceBytes < 1 ||
    context.sourceBytes > EVALUATION_FAILURE_LIMITS.registryBytes ||
    !Array.isArray(context.taskIds)
  ) {
    fail("invalidContext");
  }
  const repositoryPaths = new Set(context.repositoryPaths);
  const taskIds = new Set(context.taskIds);
  if (
    repositoryPaths.size !== context.repositoryPaths.length ||
    taskIds.size !== context.taskIds.length ||
    [...repositoryPaths].some((ownedPath) => typeof ownedPath !== "string") ||
    [...taskIds].some(
      (taskId) =>
        typeof taskId !== "string" ||
        !TASK_ID.test(taskId) ||
        WINDOWS_DEVICE_NAME.test(taskId),
    )
  ) {
    fail("invalidContext");
  }
  exactKeys(registry, ["entries", "schemaVersion"], "invalidRegistry");
  if (
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.entries) ||
    registry.entries.length > EVALUATION_FAILURE_LIMITS.entries
  ) {
    fail("invalidRegistry");
  }
  const identifiers = registry.entries.map((entry) =>
    validateEntry(entry, taskIds, repositoryPaths),
  );
  if (
    new Set(identifiers).size !== identifiers.length ||
    JSON.stringify(identifiers) !== JSON.stringify(sorted(identifiers))
  ) {
    fail("invalidRegistry");
  }
  return Object.freeze({
    actionable: registry.entries.filter((entry) => entry.status === "actionable").length,
    entries: registry.entries.length,
    observing: registry.entries.filter((entry) => entry.status === "observing").length,
    resolved: registry.entries.filter((entry) => entry.status === "resolved").length,
    schemaVersion: 1,
  });
}
