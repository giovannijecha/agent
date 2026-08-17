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
const providerPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/provider-policy.json"), "utf8"),
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
    ["README.md", "## Quick start", "## Getting started"],
    ["docs/BRAND.md", "## Asset registry", "## Asset inventory"],
    [
      "CONTRIBUTING.md",
      "## Prepare a maintainer change",
      "## Submit a change",
    ],
    [
      "SECURITY.md",
      "## Report a vulnerability",
      "## Report a security problem",
    ],
    [
      "PRIVACY.md",
      "## Future local sessions",
      "## Future session storage",
    ],
    [
      "docs/OWNERSHIP.md",
      "## Provenance log",
      "## Inspection history",
    ],
    [
      "docs/PROVIDERS.md",
      "## Enabled direct provider",
      "## Enabled provider",
    ],
    [
      "docs/PROVIDER-APPLICATIONS.md",
      "## Submission rules",
      "## Request rules",
    ],
    [
      "docs/OAUTH-REGISTRATION.md",
      "## Current registration status",
      "## Provider registration status",
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

test("routes the completed public entry point to the public README", () => {
  const context = currentContext();

  assert.equal(
    context.files["docs/BRAND.md"].includes("(../README.md)"),
    true,
    "brand guidance does not route public users to the README",
  );

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "README.md",
  );
  assert.deepEqual(structure?.headings, [
    "# agent",
    "## Capabilities",
    "## Quick start",
    "## Daily use",
    "## Safety model",
    "## Verification",
    "## Task evaluation",
    "## Documentation",
    "## Public identity",
  ]);

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) =>
      line.startsWith("| Public purpose, identity, installation, and first run |"),
    );
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "public-entry-point migration is not complete",
  );
});

test("routes completed brand identity to the brand guide", () => {
  const context = currentContext();

  const assetEntryPoint = policy.livingDocuments.find(
    (entry) => entry.path === "assets/brand/README.md",
  );
  assert.equal(
    assetEntryPoint?.authority,
    "registered asset distribution entry point",
    "the asset README is still classified as a second brand authority",
  );
  assert.equal(
    context.files["assets/brand/README.md"].includes(
      "This directory is the scoped distribution entry point",
    ),
    true,
    "the asset README does not declare its scoped role",
  );

  for (const [file, route] of [
    ["README.md", "(docs/BRAND.md)"],
    ["assets/brand/README.md", "(../../docs/BRAND.md)"],
    ["docs/BRAND.md", "(OWNERSHIP.md)"],
  ]) {
    assert.equal(
      context.files[file].includes(route),
      true,
      file + " does not route to the brand authority chain",
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/BRAND.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Brand system",
    "## Identity",
    "## Asset registry",
    "## Usage rules",
    "## Updating the system",
    "## Removal",
  ]);

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) =>
      line.startsWith("| Brand identity and registered assets |"),
    );
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "brand-identity migration is not complete",
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

test("routes completed vulnerability reporting to the security policy", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["AGENTS.md", "(SECURITY.md)"],
    ["CONTRIBUTING.md", "(SECURITY.md)"],
    ["docs/README.md", "(../SECURITY.md)"],
    ["docs/MAINTENANCE.md", "(../SECURITY.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "security-policy route is missing: " + source,
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "SECURITY.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Security policy",
    "## Supported versions",
    "## Report a vulnerability",
    "## Security scope",
    "## Disclosure",
  ]);

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Vulnerability reporting |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "vulnerability-reporting migration is not complete",
  );
});

test("routes completed privacy and memory-only secrets to the privacy policy", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["AGENTS.md", "(PRIVACY.md)"],
    ["docs/README.md", "(../PRIVACY.md)"],
    ["docs/PROVIDERS.md", "(../PRIVACY.md)"],
    ["docs/manual/README.md", "(../../PRIVACY.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "privacy-policy route is missing: " + source,
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "PRIVACY.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Privacy policy",
    "## Current product",
    "## Local tools",
    "## Terminal selection and links",
    "## Ollama Cloud connection",
    "## Future local sessions",
    "## Local task evaluation",
    "## Removal",
  ]);

  assert.equal(
    context.files["PRIVACY.md"].includes(
      "An approved `run_process` invocation is lifecycle-contained but not filesystem-\nor network-sandboxed; its Node code retains the launching user's authority.",
    ),
    true,
    "privacy policy lost the process-isolation warning",
  );

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Privacy and memory-only secrets |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "privacy migration is not complete",
  );
});

test("routes completed clean-room provenance to the ownership record", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["AGENTS.md", "(docs/OWNERSHIP.md)"],
    ["README.md", "(docs/OWNERSHIP.md)"],
    ["CONTRIBUTING.md", "(docs/OWNERSHIP.md)"],
    ["docs/README.md", "(OWNERSHIP.md)"],
    ["docs/ARCHITECTURE.md", "(OWNERSHIP.md)"],
    ["docs/BRAND.md", "(OWNERSHIP.md)"],
    ["docs/MAINTENANCE.md", "(OWNERSHIP.md)"],
    ["docs/OAUTH-REGISTRATION.md", "(OWNERSHIP.md)"],
    ["docs/PROVIDERS.md", "(OWNERSHIP.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "ownership route is missing: " + source,
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/OWNERSHIP.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Ownership and provenance",
    "## Meaning of “ours”",
    "## Forbidden inputs",
    "## Provenance log",
    "## Review checklist",
  ]);

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Clean-room provenance and inspections |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "clean-room provenance migration is not complete",
  );
});

test("routes completed direct provider admission to the provider policy", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["AGENTS.md", "(docs/PROVIDERS.md)"],
    ["README.md", "(docs/PROVIDERS.md)"],
    ["docs/README.md", "(PROVIDERS.md)"],
    ["docs/ARCHITECTURE.md", "(PROVIDERS.md)"],
    ["docs/MAINTENANCE.md", "(PROVIDERS.md)"],
    ["docs/manual/README.md", "(../PROVIDERS.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "provider-policy route is missing: " + source,
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/PROVIDERS.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Provider eligibility",
    "## Enabled direct provider",
    "## Blocked subscription OAuth providers",
    "## Machine gate",
    "## Research rule",
    "## Account and secret boundary",
    "## Primary references",
  ]);

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Direct provider admission and operation |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "direct-provider migration is not complete",
  );
});

test("routes completed provider registration requests to the request ledger", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["README.md", "(docs/PROVIDER-APPLICATIONS.md)"],
    ["docs/README.md", "(PROVIDER-APPLICATIONS.md)"],
    ["docs/OAUTH-REGISTRATION.md", "(PROVIDER-APPLICATIONS.md)"],
    ["docs/PROVIDERS.md", "(PROVIDER-APPLICATIONS.md)"],
    ["docs/PROVIDER-APPLICATIONS.md", "(OAUTH-REGISTRATION.md)"],
    ["docs/PROVIDER-APPLICATIONS.md", "(PROVIDERS.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "provider-request route is missing: " + source,
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/PROVIDER-APPLICATIONS.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Provider registration requests",
    "## Submission rules",
    "## ChatGPT Plus/Pro",
    "## Claude Pro/Max",
    "## Kimi Code",
    "## Grok subscription",
    "## Maintenance and removal",
  ]);

  assert.equal(
    context.files["docs/PROVIDERS.md"].includes(
      "All four independent-client inquiries are submitted.",
    ),
    false,
    "provider policy retains duplicated request state",
  );
  assert.equal(
    context.files["docs/OAUTH-REGISTRATION.md"].includes(
      "the other three requests remain\npending",
    ),
    false,
    "OAuth dossier retains duplicated request status",
  );
  assert.equal(
    context.files["docs/OAUTH-REGISTRATION.md"].includes(
      "ready-to-submit requests",
    ),
    false,
    "OAuth dossier retains obsolete request readiness",
  );

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Provider registration requests |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "provider-request migration is not complete",
  );
});

test("routes completed OAuth registration status to the OAuth dossier", () => {
  const context = currentContext();
  for (const [source, route] of [
    ["README.md", "(docs/OAUTH-REGISTRATION.md)"],
    ["docs/README.md", "(OAUTH-REGISTRATION.md)"],
    ["docs/PROVIDERS.md", "(OAUTH-REGISTRATION.md)"],
    ["docs/PROVIDER-APPLICATIONS.md", "(OAUTH-REGISTRATION.md)"],
  ]) {
    assert.equal(
      context.files[source].includes(route),
      true,
      "OAuth-registration route is missing: " + source,
    );
  }

  const operatorText = readFileSync(
    path.join(projectRoot, "docs/manual/05-providers-and-authentication.md"),
    "utf8",
  );
  assert.equal(
    operatorText.includes("(../OAUTH-REGISTRATION.md)"),
    true,
    "operator OAuth-registration route is missing",
  );

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/OAUTH-REGISTRATION.md",
  );
  assert.deepEqual(structure?.headings, [
    "# OAuth client registration dossier",
    "## Current registration status",
    "## Public application identity",
    "## Requested authorization model",
    "## Data flow",
    "## Registration requirements",
    "## Provider submission summary",
    "## Evidence and implementation gate",
    "## Primary registration references",
    "## Maintenance and removal",
  ]);

  const oauthText = context.files["docs/OAUTH-REGISTRATION.md"];
  const providerText = context.files["docs/PROVIDERS.md"];
  const registrationProviders = oauthText
    .split("\n")
    .filter((line) => /^\| (?!Provider\b|---)/u.test(line))
    .map((line) => line.split("|").at(1)?.trim());
  assert.deepEqual(
    registrationProviders,
    providerPolicy.providers.map((provider) => provider.displayName),
    "OAuth conclusion inventory diverges from the machine provider registry",
  );
  for (const reference of [
    "https://developers.openai.com/codex/auth/",
    "https://developers.openai.com/codex/app-server/",
    "https://code.claude.com/docs/en/authentication",
    "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan",
    "https://www.kimi.com/code/docs/en/",
    "https://docs.x.ai/build/overview",
    "https://docs.x.ai/build/enterprise",
  ]) {
    assert.equal(
      oauthText.includes(reference),
      true,
      "OAuth dossier is missing registration reference: " + reference,
    );
    assert.equal(
      providerText.includes(reference),
      false,
      "provider policy retains OAuth registration reference: " + reference,
    );
  }

  for (const routeSummary of [
    "OpenAI documents subscription login for its Codex clients and managed browser or device login through Codex App Server.",
    "Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK.",
    "Kimi documents device OAuth for Kimi Code CLI and subscription-backed API keys for third-party development tools.",
    "xAI documents browser and device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path.",
  ]) {
    assert.equal(
      oauthText.includes(routeSummary),
      true,
      "OAuth dossier is missing a recorded public route",
    );
    assert.equal(
      providerText.includes(routeSummary),
      false,
      "provider policy retains a recorded OAuth route",
    );
  }

  assert.equal(
    providerText.includes("| Provider | Current official route |"),
    false,
    "provider policy retains the OAuth status table",
  );
  assert.equal(
    providerText.includes("Kimi Code Team confirmed in writing"),
    false,
    "provider policy retains a provider-specific registration conclusion",
  );

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| OAuth registration status |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "OAuth-registration migration is not complete",
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
