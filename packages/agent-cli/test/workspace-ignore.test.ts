import assert from "node:assert/strict";
import test from "node:test";

import {
  WORKSPACE_IGNORE_LIMITS,
  WorkspaceIgnore,
  WorkspaceIgnoreError,
} from "../dist/workspace-ignore.js";

function matcher(
  source: string,
  matchCase: "asciiInsensitive" | "sensitive" = "sensitive",
): WorkspaceIgnore {
  const created = WorkspaceIgnore.create(source, matchCase);
  assert.ok(created.ok);
  return created.value;
}

function denied(value: WorkspaceIgnore, relative: unknown): boolean {
  const result = value.denies(relative);
  assert.ok(result.ok);
  return result.value;
}

test("matches the closed deny-only grammar and descendant semantics", () => {
  const value = matcher([
    "# workspace privacy",
    "cache/",
    "src/*.generated.ts",
    "**/private",
    "build/**/secrets.*",
    "exact.txt",
  ].join("\n"));

  for (const relative of [
    "cache",
    "cache/item.txt",
    "src/view.generated.ts",
    "private",
    "nested/private/key.txt",
    "build/secrets.txt",
    "build/deep/secrets.pem",
    "build/deep/secrets.pem/child",
    "exact.txt",
    "exact.txt/child",
  ]) {
    assert.equal(denied(value, relative), true, relative);
  }
  for (const relative of [
    ".",
    "cacheable/item.txt",
    "src/nested/view.generated.ts",
    "src/view.generated.js",
    "nested/public/key.txt",
    "build/deep/public.txt",
    "exact.txt.bak",
  ]) {
    assert.equal(denied(value, relative), false, relative);
  }
});

test("uses exact Unicode matching on Linux and ASCII-only folding on Windows", () => {
  const sensitive = matcher("Docs/*.KEY\nÄrea/Secret", "sensitive");
  const insensitive = matcher(
    "Docs/*.KEY\nÄrea/Secret",
    "asciiInsensitive",
  );

  assert.equal(denied(sensitive, "Docs/file.KEY"), true);
  assert.equal(denied(sensitive, "docs/file.key"), false);
  assert.equal(denied(insensitive, "docs/file.key"), true);
  assert.equal(denied(insensitive, "ärea/secret"), false);
  assert.equal(denied(insensitive, "Ärea/secret"), true);
});

test("rejects every pattern form outside the owned grammar", () => {
  const invalidPatterns = [
    " pattern",
    "pattern ",
    "/absolute",
    "C:/absolute",
    "!negation",
    "directory\\file",
    "directory//file",
    "directory/./file",
    "directory/../file",
    "directory/**/nested/**",
    "directory/pre**post",
    "directory/\u0000file",
    "directory/\u200bfile",
  ];
  for (const source of invalidPatterns) {
    const created = WorkspaceIgnore.create(source, "sensitive");
    assert.ok(!created.ok, JSON.stringify(source));
    assert.equal(created.error.kind, "invalidPattern", JSON.stringify(source));
  }

  const duplicate = WorkspaceIgnore.create("Docs\ndocs", "asciiInsensitive");
  assert.ok(!duplicate.ok);
  assert.equal(duplicate.error.kind, "invalidPattern");
  const invalidCase = WorkspaceIgnore.create("valid", "unknown");
  assert.ok(!invalidCase.ok);
  assert.equal(invalidCase.error.kind, "invalidCase");
  const invalidSource = WorkspaceIgnore.create({ source: "secret" }, "sensitive");
  assert.ok(!invalidSource.ok);
  assert.equal(invalidSource.error.kind, "invalidSource");
  const invalidScalar = WorkspaceIgnore.create("\ud800", "sensitive");
  assert.ok(!invalidScalar.ok);
  assert.equal(invalidScalar.error.kind, "invalidSource");
});

test("enforces exact source, line, rule, and segment bounds", () => {
  const fullComments = Array.from({ length: 63 }, () => "#" + "a".repeat(255));
  fullComments.push("#" + "b".repeat(192));
  const exactSource = fullComments.join("\n");
  assert.equal(exactSource.length, WORKSPACE_IGNORE_LIMITS.codeUnits);
  assert.ok(WorkspaceIgnore.create(exactSource, "sensitive").ok);

  const oversizedSource = WorkspaceIgnore.create(
    exactSource + "x",
    "sensitive",
  );
  assert.ok(!oversizedSource.ok);
  assert.equal(oversizedSource.error.kind, "limit");

  const exactLine = "x".repeat(WORKSPACE_IGNORE_LIMITS.lineCodeUnits);
  assert.ok(WorkspaceIgnore.create(exactLine, "sensitive").ok);
  const oversizedLine = WorkspaceIgnore.create(
    "#" + "x".repeat(WORKSPACE_IGNORE_LIMITS.lineCodeUnits),
    "sensitive",
  );
  assert.ok(!oversizedLine.ok);
  assert.equal(oversizedLine.error.kind, "limit");

  const exactRules = Array.from(
    { length: WORKSPACE_IGNORE_LIMITS.rules },
    (_value, index) => "rule-" + String(index),
  ).join("\n");
  assert.ok(WorkspaceIgnore.create(exactRules, "sensitive").ok);
  const oversizedRules = WorkspaceIgnore.create(
    exactRules + "\nrule-overflow",
    "sensitive",
  );
  assert.ok(!oversizedRules.ok);
  assert.equal(oversizedRules.error.kind, "limit");

  const exactSegments = Array.from(
    { length: WORKSPACE_IGNORE_LIMITS.segments },
    () => "s",
  ).join("/");
  assert.ok(WorkspaceIgnore.create(exactSegments, "sensitive").ok);
  const oversizedSegments = WorkspaceIgnore.create(
    exactSegments + "/s",
    "sensitive",
  );
  assert.ok(!oversizedSegments.ok);
  assert.equal(oversizedSegments.error.kind, "limit");
});

test("fails closed for malformed targets and exposes content-free errors", () => {
  const value = matcher("private/**");
  const invalidTargets: unknown[] = [
    "",
    "/private",
    "private/",
    "private\\file",
    "private//file",
    "private/./file",
    "private/../file",
    "private/\u0000file",
    "\ud800",
    17,
  ];
  for (const relative of invalidTargets) {
    const result = value.denies(relative);
    assert.ok(!result.ok);
    assert.equal(result.error.kind, "invalidTarget");
  }
  const oversized = value.denies(
    "x".repeat(WORKSPACE_IGNORE_LIMITS.targetCodeUnits + 1),
  );
  assert.ok(!oversized.ok);
  assert.equal(oversized.error.kind, "invalidTarget");

  const forged = Object.create(WorkspaceIgnore.prototype) as WorkspaceIgnore;
  const forgedResult = forged.denies("private/file");
  assert.ok(!forgedResult.ok);
  assert.equal(forgedResult.error.kind, "invalidTarget");

  const error = new WorkspaceIgnoreError("invalidPattern");
  assert.equal(Object.isFrozen(error), true);
  assert.deepEqual(Object.keys(error), []);
});
