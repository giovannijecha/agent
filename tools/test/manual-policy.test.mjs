import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ManualPolicyError,
  validateManualPolicy,
} from "../lib/manual-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const currentPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/manual-policy.json"), "utf8"),
);

function collectFiles(directory = projectRoot) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist" || entry.name === ".test-dist") {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute));
    } else if (entry.isFile()) {
      files.push(path.relative(projectRoot, absolute).split(path.sep).join("/"));
    }
  }
  return files;
}

function currentContext() {
  const ownedPaths = collectFiles();
  const manualPaths = ownedPaths.filter(
    (file) => file.startsWith("docs/manual/") && file.endsWith(".md"),
  );
  const needed = [
    "README.md",
    "packages/agent-cli/src/commands.ts",
    "packages/agent-cli/src/builtin-tools.ts",
    ...manualPaths,
  ];
  return {
    files: Object.fromEntries(
      needed.map((file) => [
        file,
        readFileSync(path.join(projectRoot, file), "utf8"),
      ]),
    ),
    manualPaths,
    ownedPaths,
  };
}

test("accepts the canonical owned operator manual", () => {
  assert.doesNotThrow(() => validateManualPolicy(currentPolicy, currentContext()));
});

test("rejects missing or reordered chapter contract sections", () => {
  const context = currentContext();
  const chapter = currentPolicy.chapters.at(2).path;
  context.files[chapter] = context.files[chapter].replace(
    "## Failure behavior",
    "## Failure handling",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    ManualPolicyError,
  );
});

test("rejects command and tool source drift", () => {
  const commandContext = currentContext();
  commandContext.files["packages/agent-cli/src/commands.ts"] +=
    '\nconst future = "/new";\n';
  assert.throws(
    () => validateManualPolicy(currentPolicy, commandContext),
    ManualPolicyError,
  );

  const toolContext = currentContext();
  toolContext.files["packages/agent-cli/src/builtin-tools.ts"] +=
    '\ndescriptor("future_tool", "future", "read", schema);\n';
  assert.throws(
    () => validateManualPolicy(currentPolicy, toolContext),
    ManualPolicyError,
  );
});

test("rejects an unregistered chapter or broken local link", () => {
  const extraContext = currentContext();
  extraContext.manualPaths.push("docs/manual/07-unregistered.md");
  assert.throws(
    () => validateManualPolicy(currentPolicy, extraContext),
    ManualPolicyError,
  );

  const linkContext = currentContext();
  linkContext.files[currentPolicy.index] += "\n[escape](../../../outside.md)\n";
  assert.throws(
    () => validateManualPolicy(currentPolicy, linkContext),
    ManualPolicyError,
  );
});

test("rejects missing or uncited evidence", () => {
  const missingContext = currentContext();
  missingContext.ownedPaths = missingContext.ownedPaths.filter(
    (file) => file !== "tools/verify.ps1",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, missingContext),
    ManualPolicyError,
  );

  const uncitedContext = currentContext();
  const chapter = currentPolicy.chapters.find((candidate) =>
    uncitedContext.files[candidate.path].includes("`tools/verify.ps1`"),
  )?.path;
  assert.equal(typeof chapter, "string");
  uncitedContext.files[chapter] = uncitedContext.files[chapter].replace(
    "`tools/verify.ps1`",
    "the release script",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, uncitedContext),
    ManualPolicyError,
  );
});
