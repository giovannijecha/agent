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
  const productSources = ownedPaths.filter((file) =>
    /^packages\/[a-z0-9-]+\/src\/[a-z0-9-]+\.ts$/u.test(file),
  );
  const decisionPaths = ownedPaths.filter((file) =>
    /^docs\/decisions\/[0-9]{4}-[a-z0-9-]+\.md$/u.test(file),
  );
  const needed = [
    "README.md",
    "PRIVACY.md",
    "docs/MAINTENANCE.md",
    ...productSources,
    ...manualPaths,
    ...decisionPaths,
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
    '\nconst futureRisk = "read";\n' +
    'descriptor("future_tool", "future", futureRisk, schema);\n';
  assert.throws(
    () => validateManualPolicy(currentPolicy, toolContext),
    ManualPolicyError,
  );

  const registeredDrift = currentContext();
  registeredDrift.files["packages/agent-cli/src/builtin-tools.ts"] +=
    '\ndescriptor("future_tool", "future", "read", schema);\n';
  assert.throws(
    () => validateManualPolicy(currentPolicy, registeredDrift),
    {
      message: "manual tool source inventory mismatch",
      name: "ManualPolicyError",
    },
  );

  const escapedAuthority = currentContext();
  escapedAuthority.files["packages/agent-cli/src/application.ts"] +=
    "\nToolDescriptor.create;\n";
  assert.throws(
    () => validateManualPolicy(currentPolicy, escapedAuthority),
    {
      message: "tool descriptor construction escapes the registered source",
      name: "ManualPolicyError",
    },
  );
});

test("rejects duplicate or incomplete lean tool contracts", () => {
  const duplicateCapability = structuredClone(currentPolicy);
  duplicateCapability.toolSurface.tools.at(1).capability =
    duplicateCapability.toolSurface.tools.at(0).capability;
  assert.throws(
    () => validateManualPolicy(duplicateCapability, currentContext()),
    ManualPolicyError,
  );

  const duplicateNecessity = structuredClone(currentPolicy);
  duplicateNecessity.toolSurface.tools.at(1).necessity =
    duplicateNecessity.toolSurface.tools.at(0).necessity;
  assert.throws(
    () => validateManualPolicy(duplicateNecessity, currentContext()),
    ManualPolicyError,
  );

  const missingNecessity = structuredClone(currentPolicy);
  missingNecessity.toolSurface.tools.at(0).necessity = "";
  assert.throws(
    () => validateManualPolicy(missingNecessity, currentContext()),
    ManualPolicyError,
  );

  const unsafeNecessity = structuredClone(currentPolicy);
  unsafeNecessity.toolSurface.tools.at(0).necessity =
    "Creates one bounded file without hidden\u202e display direction.";
  assert.throws(
    () => validateManualPolicy(unsafeNecessity, currentContext()),
    ManualPolicyError,
  );

  const riskDrift = structuredClone(currentPolicy);
  riskDrift.toolSurface.tools.at(0).risk = "execute";
  assert.throws(
    () => validateManualPolicy(riskDrift, currentContext()),
    {
      message: "manual tool source inventory mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("rejects a dormant blocked-tool registry", () => {
  const staleRegistry = structuredClone(currentPolicy);
  staleRegistry.blockedTools = [];
  assert.throws(
    () => validateManualPolicy(staleRegistry, currentContext()),
    {
      message: "manual policy keys mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("rejects an incomplete lean harness inventory", () => {
  const capabilityContext = currentContext();
  capabilityContext.files["docs/manual/04-tools-and-approval.md"] =
    capabilityContext.files["docs/manual/04-tools-and-approval.md"].replace(
      "`read-one-file`",
      "`read-file-alias`",
    );
  assert.throws(
    () => validateManualPolicy(currentPolicy, capabilityContext),
    ManualPolicyError,
  );

  const riskContext = currentContext();
  riskContext.files["docs/manual/04-tools-and-approval.md"] =
    riskContext.files["docs/manual/04-tools-and-approval.md"].replace(
      "| `apply_patch` | `patch-one-text-file` | `write` |",
      "| `apply_patch` | `patch-one-text-file` | `read` |",
    );
  assert.throws(
    () => validateManualPolicy(currentPolicy, riskContext),
    ManualPolicyError,
  );

  const substringPolicy = structuredClone(currentPolicy);
  substringPolicy.toolSurface.tools.at(0).necessity =
    "Creates or updates one file through ordered exact-text hunks.";
  assert.throws(
    () => validateManualPolicy(substringPolicy, currentContext()),
    ManualPolicyError,
  );
});

test("rejects mutation convergence documentation drift", () => {
  const countContext = currentContext();
  countContext.files["PRIVACY.md"] = countContext.files["PRIVACY.md"].replace(
    "The four filesystem tools",
    "The five filesystem tools",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, countContext),
    {
      message: "manual mutation convergence contract is incomplete",
      name: "ManualPolicyError",
    },
  );

  const rollbackContext = currentContext();
  const maintainedRollback = rollbackContext.files["docs/MAINTENANCE.md"];
  rollbackContext.files["docs/MAINTENANCE.md"] = maintainedRollback.replace(
    "planners before removing `apply_patch`",
    "planners after removing `apply_patch`",
  );
  assert.notEqual(
    rollbackContext.files["docs/MAINTENANCE.md"],
    maintainedRollback,
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, rollbackContext),
    {
      message: "manual mutation convergence contract is incomplete",
      name: "ManualPolicyError",
    },
  );
});

test("rejects stale manual removal schema guidance", () => {
  const context = currentContext();
  const maintainedGuidance = context.files["docs/MAINTENANCE.md"];
  context.files["docs/MAINTENANCE.md"] = context.files[
    "docs/MAINTENANCE.md"
  ].replace("manual-policy schema 5", "manual-policy schema 4");
  assert.notEqual(context.files["docs/MAINTENANCE.md"], maintainedGuidance);
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    {
      message: "manual removal schema guidance is stale",
      name: "ManualPolicyError",
    },
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
