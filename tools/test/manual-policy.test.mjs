import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function repinSelectorDismissal(policy, context) {
  const chapter = policy.selectorDismissal.path;
  policy.selectorDismissal.sha256 = createHash("sha256")
    .update(context.files[chapter].replaceAll("\r\n", "\n"), "utf8")
    .digest("hex");
}

test("accepts the canonical owned operator manual", () => {
  assert.doesNotThrow(() => validateManualPolicy(currentPolicy, currentContext()));
});

test("rejects missing or reordered chapter contract sections", () => {
  const context = currentContext();
  const chapter = currentPolicy.chapters.at(2).path;
  context.files[chapter] = context.files[chapter].replace(
    "## Tool checkpoints",
    "## Tool progress",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    ManualPolicyError,
  );
});

test("rejects terminal-interface task contract drift", () => {
  const context = currentContext();
  const chapter = currentPolicy.chapters.at(3).path;
  context.files[chapter] = context.files[chapter].replace(
    "## Navigate and copy",
    "## Copy text",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    ManualPolicyError,
  );
});

test("rejects implicit selector dismissal guidance", () => {
  const policy = structuredClone(currentPolicy);
  const context = currentContext();
  const chapter = "docs/manual/03-terminal-interface.md";
  const maintained = context.files[chapter];
  context.files[chapter] = context.files[chapter].replace(
    "Printable and editing input is inert while a dismissible selector\nowns focus",
    "An ordinary editor input closes a dismissible selector and is consumed",
  );
  assert.notEqual(context.files[chapter], maintained);
  repinSelectorDismissal(policy, context);
  assert.notEqual(
    policy.selectorDismissal.sha256,
    currentPolicy.selectorDismissal.sha256,
  );
  assert.throws(
    () => validateManualPolicy(policy, context),
    {
      message: "manual selector dismissal contract is inconsistent",
      name: "ManualPolicyError",
    },
  );
});

test("rejects contradictory selector dismissal guidance", () => {
  const policy = structuredClone(currentPolicy);
  const context = currentContext();
  const chapter = "docs/manual/03-terminal-interface.md";
  const maintained = context.files[chapter];
  context.files[chapter] = context.files[chapter].replace(
    "Other typing and editing keys\nare ignored while the menu remains open",
    "Other typing and editing keys close the menu and are consumed",
  );
  assert.notEqual(context.files[chapter], maintained);
  repinSelectorDismissal(policy, context);
  assert.notEqual(
    policy.selectorDismissal.sha256,
    currentPolicy.selectorDismissal.sha256,
  );
  assert.throws(
    () => validateManualPolicy(policy, context),
    {
      message: "manual selector dismissal contract is inconsistent",
      name: "ManualPolicyError",
    },
  );
});

test("rejects contradictory selector dismissal additions after repinning", () => {
  const contradictions = [
    "An ordinary editor input closes the menu and is consumed.",
    "Printable text dismisses the selector.",
    "Editing keys cancel the menu.",
  ];
  for (const contradiction of contradictions) {
    const policy = structuredClone(currentPolicy);
    const context = currentContext();
    const chapter = policy.selectorDismissal.path;
    context.files[chapter] += "\n" + contradiction + "\n";
    repinSelectorDismissal(policy, context);
    assert.notEqual(
      policy.selectorDismissal.sha256,
      currentPolicy.selectorDismissal.sha256,
    );
    assert.throws(
      () => validateManualPolicy(policy, context),
      {
        message: "manual selector dismissal contract is inconsistent",
        name: "ManualPolicyError",
      },
    );
  }
});

test("rejects contradictions using every decision-named inert input", () => {
  const contradictions = [
    "Paste closes the menu.",
    "Tab dismisses the selector.",
    "Home cancels the menu.",
    "End closes the selector.",
    "Delete dismisses the menu.",
    "Backspace closes the selector.",
    "Deletion dismisses the menu.",
    "Word-editing input cancels the selector.",
  ];
  for (const contradiction of contradictions) {
    const policy = structuredClone(currentPolicy);
    const context = currentContext();
    const chapter = policy.selectorDismissal.path;
    context.files[chapter] += "\n" + contradiction + "\n";
    repinSelectorDismissal(policy, context);
    assert.throws(
      () => validateManualPolicy(policy, context),
      {
        message: "manual selector dismissal contract is inconsistent",
        name: "ManualPolicyError",
      },
    );
  }
});

test("scopes negation to the selector dismissal action", () => {
  const policy = structuredClone(currentPolicy);
  const context = currentContext();
  const chapter = policy.selectorDismissal.path;
  context.files[chapter] +=
    "\nTyping does not edit but closes the menu.\n";
  repinSelectorDismissal(policy, context);
  assert.throws(
    () => validateManualPolicy(policy, context),
    {
      message: "manual selector dismissal contract is inconsistent",
      name: "ManualPolicyError",
    },
  );
});

test("rejects unregistered selector dismissal action wording", () => {
  const contradictions = [
    "Tab exits the selector.",
    "Home hides the menu.",
    "End returns focus.",
  ];
  for (const contradiction of contradictions) {
    const policy = structuredClone(currentPolicy);
    const context = currentContext();
    const chapter = policy.selectorDismissal.path;
    context.files[chapter] += "\n" + contradiction + "\n";
    repinSelectorDismissal(policy, context);
    assert.throws(
      () => validateManualPolicy(policy, context),
      {
        message: "manual selector dismissal contract is inconsistent",
        name: "ManualPolicyError",
      },
    );
  }
});

test("rejects unregistered negative selector guidance after repinning", () => {
  const policy = structuredClone(currentPolicy);
  const context = currentContext();
  const chapter = policy.selectorDismissal.path;
  context.files[chapter] += "\nPrintable text does not close the menu.\n";
  repinSelectorDismissal(policy, context);
  assert.notEqual(
    policy.selectorDismissal.sha256,
    currentPolicy.selectorDismissal.sha256,
  );
  assert.throws(
    () => validateManualPolicy(policy, context),
    {
      message: "manual selector dismissal contract is inconsistent",
      name: "ManualPolicyError",
    },
  );
});

test("binds each chapter to its declared task-specific sections", () => {
  const policy = structuredClone(currentPolicy);
  policy.chapters.at(1).sections = [
    ...policy.chapters.at(1).sections.slice(0, 2),
    "Legacy universal section",
    ...policy.chapters.at(1).sections.slice(2),
  ];
  assert.throws(
    () => validateManualPolicy(policy, currentContext()),
    {
      message: "manual chapter section order mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("uses task-specific reading and publishing contracts", () => {
  assert.deepEqual(currentPolicy.chapters.at(0).sections, [
    "Choose a task",
    "Follow the authority chain",
    "Verify the manual",
    "Maintain or remove the manual",
    "References",
  ]);
  assert.deepEqual(currentPolicy.chapters.at(7).sections, [
    "Prepare publication",
    "Preserve identity and attribution",
    "Protect runtime and provider boundaries",
    "Verify the release",
    "Handle publication failures",
    "Roll back or remove publication",
    "References",
  ]);

  const context = currentContext();
  const index = context.files["docs/manual/README.md"];
  for (const marker of [
    "Credentials, catalogs, provider/model selection, permission policy, drafts,\n  and active turns are not persisted.",
    "only the bounded settled session journal documented by the",
  ]) {
    assert.equal(
      index.includes(marker),
      true,
      "manual boundary is missing: " + marker,
    );
  }
  for (const chapter of [
    "docs/manual/00-reading-this-manual.md",
    "docs/manual/07-publishing-and-governance.md",
  ]) {
    assert.equal(
      context.files[chapter].includes("## Evidence"),
      false,
      chapter + " still exposes the legacy evidence inventory",
    );
  }

  const publishing = context.files[
    "docs/manual/07-publishing-and-governance.md"
  ];
  for (const marker of [
    "Run the canonical release gate and resolve every failure.",
    "Scan the complete history for secrets and inspect the rendered public files.",
    "never require a status name that has not run.",
    "Keep the version on `0.x` until one direct provider integration is complete",
    "Do not add a generated-by banner, automated tool signature,\nor tool co-author trailer.",
    "Interactive launches retain only the bounded settled local\nsession journal documented by the [privacy policy](../../PRIVACY.md).",
    "Release mechanics remain in the [maintenance guide](../MAINTENANCE.md).",
    "[publication policy](../../tools/lib/publication-policy.mjs)",
    "[offline regressions](../../tools/test/publication-policy.test.mjs)",
  ]) {
    assert.equal(
      publishing.includes(marker),
      true,
      "publishing operation contract is missing: " + marker,
    );
  }
  assert.equal(
    publishing.indexOf(
      "Run the canonical release gate and resolve every failure.",
    ) < publishing.indexOf("initialize Git or create a remote repository."),
    true,
    "publication can initialize repository state before the release gate passes",
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

test("rejects tools-and-permissions task contract drift", () => {
  const context = currentContext();
  const chapter = "docs/manual/04-tools-and-approval.md";
  context.files[chapter] = context.files[chapter].replace(
    "## Decide a request",
    "## Approve a request",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    {
      message: "manual chapter section order mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("rejects providers-and-authentication task contract drift", () => {
  const context = currentContext();
  const chapter = "docs/manual/05-providers-and-authentication.md";
  context.files[chapter] = context.files[chapter].replace(
    "## Choose a model",
    "## Select a model",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    {
      message: "manual chapter section order mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("rejects verification-and-diagnostics task contract drift", () => {
  const context = currentContext();
  const chapter = "docs/manual/06-verification-and-diagnostics.md";
  context.files[chapter] = context.files[chapter].replace(
    "## Diagnose the first failure",
    "## Inspect a failure",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, context),
    {
      message: "manual chapter section order mismatch",
      name: "ManualPolicyError",
    },
  );
});

test("rejects tool convergence documentation drift", () => {
  const countContext = currentContext();
  countContext.files["PRIVACY.md"] = countContext.files["PRIVACY.md"].replace(
    "The five filesystem tools",
    "The four filesystem tools",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, countContext),
    {
      message: "manual tool convergence contract is incomplete",
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
      message: "manual tool convergence contract is incomplete",
      name: "ManualPolicyError",
    },
  );

  const namespaceContext = currentContext();
  const maintainedNamespace = namespaceContext.files["docs/MAINTENANCE.md"];
  namespaceContext.files["docs/MAINTENANCE.md"] = maintainedNamespace.replace(
    "remove `manage_path` advertisement",
    "remove `manage_path` implementation",
  );
  assert.notEqual(
    namespaceContext.files["docs/MAINTENANCE.md"],
    maintainedNamespace,
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, namespaceContext),
    {
      message: "manual tool convergence contract is incomplete",
      name: "ManualPolicyError",
    },
  );
});

test("rejects stale manual removal schema guidance", () => {
  const context = currentContext();
  const maintainedGuidance = context.files["docs/MAINTENANCE.md"];
  context.files["docs/MAINTENANCE.md"] = context.files[
    "docs/MAINTENANCE.md"
  ].replace("manual-policy schema 11", "manual-policy schema 10");
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

test("rejects missing registered references without requiring prose citations", () => {
  const missingContext = currentContext();
  missingContext.ownedPaths = missingContext.ownedPaths.filter(
    (file) => file !== "tools/verify.ps1",
  );
  assert.throws(
    () => validateManualPolicy(currentPolicy, missingContext),
    ManualPolicyError,
  );

  const proseIndependentContext = currentContext();
  const chapter = currentPolicy.chapters.find((candidate) =>
    proseIndependentContext.files[candidate.path].includes("tools/verify.ps1"),
  )?.path;
  assert.equal(typeof chapter, "string");
  proseIndependentContext.files[chapter] = proseIndependentContext.files[
    chapter
  ].replace("tools/verify.ps1", "the canonical release gate");
  assert.doesNotThrow(
    () => validateManualPolicy(currentPolicy, proseIndependentContext),
  );
});
