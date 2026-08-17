import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DocumentationPolicyError,
  validateDocumentationPolicy,
} from "../lib/documentation-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/documentation-policy.json"), "utf8"),
);

function collectFiles(directory = projectRoot) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === ".test-dist" ||
      entry.name === ".native-build"
    ) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute));
    } else if (entry.isFile()) {
      files.push(path.relative(projectRoot, absolute).split(path.sep).join("/"));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function currentContext() {
  const ownedPaths = collectFiles();
  const decisionPaths = ownedPaths.filter((file) =>
    /^docs\/decisions\/[0-9]{4}-[a-z0-9-]+\.md$/u.test(file),
  );
  const needed = new Set([
    policy.index,
    policy.decisionIndex,
    policy.migrationLedger,
    policy.repositoryInstructions.path,
    ...policy.repositoryInstructions.requiredRoutes,
    ...policy.livingDocuments.map((entry) => entry.path),
    ...policy.documentStructures.map((entry) => entry.path),
    ...decisionPaths,
  ]);
  return {
    files: Object.fromEntries(
      [...needed].map((file) => [
        file,
        readFileSync(path.join(projectRoot, file), "utf8"),
      ]),
    ),
    decisionPaths,
    ownedPaths,
  };
}

test("accepts the canonical documentation information architecture", () => {
  assert.doesNotThrow(() => validateDocumentationPolicy(policy, currentContext()));
});

test("rejects canonical document structure drift", () => {
  for (const [file, before, after] of [
    [
      "CONTRIBUTING.md",
      "## Prepare a maintainer change",
      "## Submit a change",
    ],
    [
      "docs/ARCHITECTURE.md",
      "## Single-agent execution model",
      "## Product execution model",
    ],
    ["docs/ENGINEERING.md", "## Change workflow", "## Delivery workflow"],
    ["docs/MAINTENANCE.md", "## Standard runbook", "## Operations"],
  ]) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects an unindexed decision record", () => {
  const context = currentContext();
  const file = "docs/decisions/9999-unindexed.md";
  context.ownedPaths.push(file);
  context.decisionPaths.push(file);
  context.files[file] = "# 9999: Unindexed\n";
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects duplicate decision ledger entries", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] +=
    "\n| [0070](0070-owned-documentation-information-architecture.md) | accepted | documentation | duplicate |\n";
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects prospective decision metadata drift", () => {
  const context = currentContext();
  const file = "docs/decisions/0070-owned-documentation-information-architecture.md";
  context.files[file] = context.files[file].replace(
    "- Domain: documentation",
    "- Domain: architecture",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects documentation authority row drift", () => {
  const context = currentContext();
  context.files[policy.index] = context.files[policy.index].replace(
    "public product introduction",
    "general project notes",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects unknown decision status and domain classifications", () => {
  for (const [before, after] of [
    ["| accepted | documentation | current |", "| retired | documentation | current |"],
    ["| accepted | documentation | current |", "| accepted | miscellaneous | current |"],
  ]) {
    const context = currentContext();
    context.files[policy.decisionIndex] = context.files[policy.decisionIndex].replace(
      before,
      after,
    );
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects broken local links", () => {
  const context = currentContext();
  context.files[policy.index] = context.files[policy.index].replace(
    "(../README.md)",
    "(../../outside.md)",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects broken local links in registered structured documents", () => {
  const context = currentContext();
  context.files["docs/ARCHITECTURE.md"] = context.files[
    "docs/ARCHITECTURE.md"
  ].replace("(PROVIDERS.md)", "(missing-provider.md)");
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects broken local links in registered living documents", () => {
  const context = currentContext();
  context.files["CONTRIBUTING.md"] = context.files["CONTRIBUTING.md"].replace(
    "(SECURITY.md)",
    "(missing-security-policy.md)",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("keeps canonical maintenance repository references owned", () => {
  const context = currentContext();
  const text = context.files["docs/MAINTENANCE.md"];
  for (const reference of [
    "docs/decisions/README.md",
    "evaluations/failures/registry.json",
    "evaluations/tasks/",
  ]) {
    const isOwned = reference.endsWith("/")
      ? context.ownedPaths.some((file) => file.startsWith(reference))
      : context.ownedPaths.includes(reference);
    assert.equal(isOwned, true, "maintenance reference is not owned: " + reference);
    assert.equal(
      text.includes("`" + reference + "`"),
      true,
      "maintenance document is missing canonical reference: " + reference,
    );
  }
});

test("routes the completed contribution workflow to its canonical owner", () => {
  const context = currentContext();
  for (const source of ["docs/ENGINEERING.md", "docs/MAINTENANCE.md"]) {
    assert.equal(
      context.files[source].includes("(../CONTRIBUTING.md)"),
      true,
      "contribution route is missing: " + source,
    );
  }

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Contribution workflow |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "contribution migration is not complete",
  );

  assert.equal(
    context.files["docs/ENGINEERING.md"].includes(
      "Maintainer changes use a protected branch.",
    ),
    true,
    "engineering workflow lost the protected-branch requirement",
  );
});

test("rejects incomplete migration coverage", () => {
  const context = currentContext();
  context.files[policy.migrationLedger] = context.files[
    policy.migrationLedger
  ].replaceAll("[Security policy](../SECURITY.md)", "Security policy");
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects repository instruction heading drift", () => {
  const context = currentContext();
  context.files[policy.repositoryInstructions.path] = context.files[
    policy.repositoryInstructions.path
  ].replace("## Canonical commands", "## Commands");
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects a missing repository instruction route", () => {
  const context = currentContext();
  context.files[policy.repositoryInstructions.path] = context.files[
    policy.repositoryInstructions.path
  ].replace("[Brand guide](docs/BRAND.md)", "Brand guide");
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});
