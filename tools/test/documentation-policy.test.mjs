import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DocumentationPolicyError,
  validateDocumentationPolicy,
} from "../lib/documentation-policy.mjs";
import { EVALUATION_LIMITS } from "../lib/evaluation-suite.mjs";
import { ownershipPolicy, projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/documentation-policy.json"), "utf8"),
);
const providerPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/provider-policy.json"), "utf8"),
);
const evaluationPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/evaluation-policy.json"), "utf8"),
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

function recordDigestFor(context) {
  const records = context.decisionPaths.map((file) => ({
    id: path.posix.basename(file).slice(0, 4),
    record: context.files[file].replaceAll("\r\n", "\n"),
  }));
  return createHash("sha256")
    .update(JSON.stringify(records), "utf8")
    .digest("hex");
}

function migrationContentLedgerDigestFor(context) {
  const normalized = context.files[policy.migrationLedger].replaceAll(
    "\r\n",
    "\n",
  );
  const marker = "\n## Content ledger\n";
  const nextMarker = "\n## Delivery sequence\n";
  const bodyStart = normalized.indexOf(marker) + marker.length;
  const end = normalized.indexOf(nextMarker, bodyStart);
  return createHash("sha256")
    .update(normalized.slice(bodyStart, end), "utf8")
    .digest("hex");
}

test("accepts the canonical documentation information architecture", () => {
  assert.doesNotThrow(() => validateDocumentationPolicy(policy, currentContext()));
});

test("keeps completed migration policy free of duplicated row prose", () => {
  assert.equal(Object.hasOwn(policy, "migrationRows"), false);
  assert.equal(Object.hasOwn(policy, "migrationContentLedgerDigest"), true);
});

test("registers every durable decision as required ownership documentation", () => {
  const requiredDocuments = new Set(ownershipPolicy.requiredDocuments);
  for (const decisionPath of policy.decisionPaths) {
    assert.equal(requiredDocuments.has(decisionPath), true, decisionPath);
  }
});

test("binds two-axis thinking controls and the journal migration", () => {
  const context = currentContext();
  const thinkingDecision =
    "docs/decisions/0083-owned-bounded-thinking-stream.md";
  const journalDecision =
    "docs/decisions/0085-owned-reasoning-journal-migration.md";
  const controlsDecision =
    "docs/decisions/0086-owned-thinking-effort-and-display.md";
  for (const decision of [thinkingDecision, journalDecision, controlsDecision]) {
    assert.equal(policy.decisionPaths.includes(decision), true);
    assert.equal(ownershipPolicy.requiredDocuments.includes(decision), true);
    assert.equal(typeof context.files[decision], "string");
  }
  assert.match(
    context.files[thinkingDecision],
    /The current runtime remains fixed at `think: false`/u,
  );
  assert.match(
    context.files[journalDecision],
    /Session journals advance to version two/u,
  );
  assert.match(
    context.files[journalDecision],
    /version one continues to accept exactly/u,
  );
  assert.match(
    context.files[thinkingDecision],
    /A separate accepted journal-schema migration decision is required before implementation/u,
  );
  assert.match(
    context.files[thinkingDecision],
    /- Superseded by: 0086/u,
  );
  assert.match(
    context.files[controlsDecision],
    /`effort` is exactly `off`, `low`, `medium`, or `high`/u,
  );
  assert.match(
    context.files[controlsDecision],
    /`display` is exactly `off` or `on`/u,
  );
  assert.match(
    context.files[controlsDecision],
    /editor opens only after one configured provider is selected and that\s+provider has one selected model/u,
  );
  assert.match(
    context.files[controlsDecision],
    /both values remain unchanged through every accepted\s+model selection in that process/u,
  );
  assert.match(
    context.files[controlsDecision],
    /If that model rejects the retained effort, the\s+turn fails explicitly and the settings remain unchanged/u,
  );
  for (const [file, marker] of [
    ["docs/ARCHITECTURE.md", "### Bounded thinking stream"],
    ["docs/ENGINEERING.md", "### Thinking-stream contract verification"],
    ["docs/MAINTENANCE.md", "### Thinking-stream lifecycle"],
    ["docs/PROVIDERS.md", "### Native thinking boundary"],
    ["PRIVACY.md", "### Thinking data"],
  ]) {
    assert.match(context.files[file], new RegExp(marker, "u"), file);
  }
});

test("binds the flat namespace tool contract", () => {
  const context = currentContext();
  const decision =
    "docs/decisions/0084-owned-flat-namespace-tool-contract.md";
  assert.equal(policy.decisionPaths.includes(decision), true);
  assert.equal(ownershipPolicy.requiredDocuments.includes(decision), true);
  assert.match(
    context.files[decision],
    /Replace the model-facing `manage_path` input with one flat closed object/u,
  );
  assert.match(
    context.files[decision],
    /rejects the complete batch before any planner/u,
  );
  for (const [file, marker] of [
    ["docs/ARCHITECTURE.md", "one flat closed object"],
    ["docs/ENGINEERING.md", "Discriminated model-facing inputs"],
    ["docs/MAINTENANCE.md", "accepts only the flat"],
  ]) {
    assert.match(context.files[file], new RegExp(marker, "u"), file);
  }
});

test("binds the dormant durable credential boundary", () => {
  const context = currentContext();
  const decision =
    "docs/decisions/0088-owned-durable-credential-boundary.md";
  assert.equal(policy.decisionPaths.includes(decision), true);
  assert.equal(ownershipPolicy.requiredDocuments.includes(decision), true);
  for (const marker of [
    /It creates no credential namespace, record, command,/u,
    /API keys, including the Ollama Cloud key[\s\S]+remain process-only/u,
    /local plain text protected by an owned native\s+filesystem boundary/u,
    /derive the current account SID from the\s+process token/u,
    /directory with mode `0700`\s+and records with mode `0600`/u,
    /It never retries a refresh, replays an authorization\s+exchange/u,
    /closed inventory of current sensitive-state identifiers/u,
    /exact production CLI filesystem authorities/u,
    /grants no global spelling allowance/u,
    /bound to one reviewed path and exact occurrence\s+count/u,
    /Both inventory key sets are bidirectional/u,
    /retain its exact import statement, bindings, and normalized source digest/u,
    /complete UTF-8 module after only CRLF-to-LF normalization/u,
    /uses SHA-256/u,
    /any\s+other source drift fails closed/u,
    /complete source snapshot is the verifier's sole authority/u,
    /does not execute product\s+code or infer exports, aliases, assignments, or general capability flow/u,
    /legitimate edit requires review of the complete module and an explicit digest\s+repin/u,
    /unfamiliar syntax cannot bypass the boundary/u,
    /projects values reconstructed\s+only from bounded non-interpolated literals/u,
  ]) {
    assert.match(context.files[decision], marker);
  }
  for (const [file, marker] of [
    ["docs/ARCHITECTURE.md", "Decision 0088 reserves"],
    ["docs/ENGINEERING.md", "bounded static string"],
    ["docs/ENGINEERING.md", "exact occurrence count"],
    ["docs/ENGINEERING.md", "Closed source-policy inventories are bidirectional"],
    ["docs/ENGINEERING.md", "reviewed import statement, bindings, and normalized"],
    ["docs/ENGINEERING.md", "normalizes only CRLF to LF"],
    ["docs/ENGINEERING.md", "exact source digest is the sole verifier authority"],
    ["docs/ENGINEERING.md", "partial export, alias, assignment, or capability-flow"],
    ["docs/ENGINEERING.md", "explicit review and digest"],
    ["docs/ENGINEERING.md", "new exact authority record"],
    ["docs/MAINTENANCE.md", "### Dormant durable credential boundary"],
    ["docs/MAINTENANCE.md", "exact current-path requirements"],
    ["docs/MAINTENANCE.md", "exact imported bindings and the SHA-256 digest"],
    ["docs/MAINTENANCE.md", "CRLF-to-LF normalization"],
    ["docs/MAINTENANCE.md", "Do not weaken source integrity into a partial export"],
    ["docs/MAINTENANCE.md", "representative escape recurrences"],
    ["docs/MAINTENANCE.md", "assignment to an exported binding after declaration"],
    ["docs/MAINTENANCE.md", "same exact source-integrity boundary"],
    ["docs/MAINTENANCE.md", "explicit digest\\s+repin"],
    ["docs/PROVIDERS.md", "Decision 0088 admits no API"],
    ["PRIVACY.md", "Decision 0088 defines a dormant"],
    ["SECURITY.md", "Decision 0088 selects the security boundary"],
  ]) {
    assert.match(context.files[file], new RegExp(marker, "u"), file);
  }
});

test("rejects canonical document structure drift", () => {
  for (const [file, before, after] of [
    ["README.md", "## Quick start", "## Getting started"],
    ["docs/BRAND.md", "## Asset registry", "## Asset inventory"],
    [
      "docs/manual/README.md",
      "## Current product boundary",
      "## Product boundary",
    ],
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
      "## Local sessions",
      "## Session storage",
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
      "evaluations/README.md",
      "## List and prepare a run",
      "## Prepare a run",
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

test("rejects noncanonical files in the flat decision directory", () => {
  const context = currentContext();
  const file = "docs/decisions/draft-notes.md";
  context.ownedPaths.push(file);
  context.files[file] = "# Draft notes\n";
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects a coherently renamed stable decision path", () => {
  const context = currentContext();
  const currentFile = "docs/decisions/0001-owned-zero-dependency-rust.md";
  const renamedFile = "docs/decisions/0001-renamed.md";
  context.ownedPaths = context.ownedPaths.map((file) =>
    file === currentFile ? renamedFile : file,
  );
  context.decisionPaths = context.decisionPaths.map((file) =>
    file === currentFile ? renamedFile : file,
  );
  context.files[renamedFile] = context.files[currentFile];
  delete context.files[currentFile];
  context.files[policy.decisionIndex] = context.files[
    policy.decisionIndex
  ].replace(
    "0001-owned-zero-dependency-rust.md",
    "0001-renamed.md",
  );
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

test("rejects unparsed rows in the complete decision ledger", () => {
  const context = currentContext();
  const row =
    "| [0001](0001-owned-zero-dependency-rust.md) | superseded | foundation | superseded by 0002 |";
  context.files[policy.decisionIndex] = context.files[
    policy.decisionIndex
  ].replace(row, row + "\n" + row + " unexpected |");
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects historical decision identity drift", () => {
  const context = currentContext();
  const file = "docs/decisions/0001-owned-zero-dependency-rust.md";
  context.files[file] = context.files[file].replace(
    "# 0001 —",
    "# 0002 —",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects empty or truncated decision section bodies", () => {
  for (const mutate of [
    (text) =>
      text
        .replace(
          /(## Context\r?\n)[\s\S]*?(?=\r?\n## Decision)/u,
          "$1",
        )
        .replace(
          /(## Decision\r?\n)[\s\S]*?(?=\r?\n## Consequences)/u,
          "$1",
        ),
    (text) => text.replace("The user wants", "The operator wants"),
  ]) {
    const context = currentContext();
    const file = "docs/decisions/0003-owned-provider-authentication.md";
    context.files[file] = mutate(context.files[file]);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects removal of any durable decision section", () => {
  const context = currentContext();
  const file = "docs/decisions/0016-owned-native-process-containment.md";
  context.files[file] = context.files[file].replace(
    /\n## Controller protocol\n[\s\S]*?(?=\n## Windows backend\n)/u,
    "",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects historical decision status and core-section drift", () => {
  for (const [file, before, after] of [
    [
      "docs/decisions/0001-owned-zero-dependency-rust.md",
      "- Status: superseded by decision 0002",
      "- Status: accepted",
    ],
    [
      "docs/decisions/0002-owned-zero-dependency-typescript.md",
      "## Context",
      "## Background",
    ],
    [
      "docs/decisions/0009-owned-operator-manual.md",
      "- Status: accepted",
      "- Status: superseded by decision 0071",
    ],
    [
      "docs/decisions/0001-owned-zero-dependency-rust.md",
      "- Status: superseded by decision 0002",
      "- Status: superseded by decision 0019",
    ],
  ]) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects invalid historical decision status exceptions", () => {
  for (const exceptions of [
    { "0009": "superseded" },
    { "0070": "accepted" },
    { "9999": "accepted" },
  ]) {
    assert.throws(
      () =>
        validateDocumentationPolicy(
          { ...policy, historicalDecisionStatusExceptions: exceptions },
          currentContext(),
        ),
      DocumentationPolicyError,
    );
  }
});

test("rejects unregistered historical relationship field owners", () => {
  assert.throws(
    () =>
      validateDocumentationPolicy(
        {
          ...policy,
          historicalDecisionRelationshipFields: {
            ...policy.historicalDecisionRelationshipFields,
            supersedes: {
              ...policy.historicalDecisionRelationshipFields.supersedes,
              "0000": "decision 0001",
            },
          },
        },
        currentContext(),
      ),
    DocumentationPolicyError,
  );
});

test("rejects invalid current decision authority routes", () => {
  for (const [before, after] of [
    [
      "[0002 TypeScript foundation](0002-owned-zero-dependency-typescript.md)",
      "[0001 Rust foundation](0001-owned-zero-dependency-rust.md)",
    ],
    [
      "[0073 shell execution](0073-owned-capability-complete-shell-execution.md)",
      "[0003 provider authentication](0003-owned-provider-authentication.md)",
    ],
    [
      "[0072 Ollama Cloud](0072-owned-ollama-cloud-provider.md), ",
      "",
    ],
    [
      "[0072 Ollama Cloud](0072-owned-ollama-cloud-provider.md)",
      "[0069 tool interoperability](0072-owned-ollama-cloud-provider.md)",
    ],
    [
      "[0013 single-agent execution](0013-single-agent-execution.md), [0052 checkpointed failures](0052-owned-checkpointed-turn-failure-classification.md)",
      "[0013 single-agent execution](0013-single-agent-execution.md), unregistered authority, [0052 checkpointed failures](0052-owned-checkpointed-turn-failure-classification.md)",
    ],
    [
      "| architecture | [0087 user-scoped state root](0087-owned-user-scoped-state-root.md), [0086 thinking effort and display](0086-owned-thinking-effort-and-display.md), [0085 reasoning journal migration](0085-owned-reasoning-journal-migration.md), [0076 durable session journal](0076-owned-bounded-session-journal.md), [0075 branching conversation tree](0075-owned-branching-conversation-tree.md), [0074 deterministic read overlap](0074-owned-deterministic-read-overlap.md), [0013 single-agent execution](0013-single-agent-execution.md), [0052 checkpointed failures](0052-owned-checkpointed-turn-failure-classification.md), [0061 convergent turns](0061-owned-convergent-tool-turns.md) |\n",
      "",
    ],
  ]) {
    const context = currentContext();
    context.files[policy.decisionIndex] = context.files[
      policy.decisionIndex
    ].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects malformed current decision authority table structure", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[
    policy.decisionIndex
  ].replace(
    "| Domain | Entry points |\n| --- | --- |",
    "Current authority routes",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects removal of the decision lifecycle contract", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[
    policy.decisionIndex
  ].replace(
    "The ledger records incoming and outgoing replacement edges independently. A\nrecord with both uses `supersedes ...; superseded by ...` so later replacement\ndoes not erase the history it had already consolidated. The offline verifier\nalso binds the complete canonical edge inventory and rejects replacement cycles;\nchanging that acyclic graph requires updating the policy in the same decision\nchange.\n\n",
    "",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("scopes current decision authority parsing to its section", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[
    policy.decisionIndex
  ].replace(
    "current authority by domain and to see whether a record has been superseded.\n\n",
    "current authority by domain and to see whether a record has been superseded.\n\n| note | retained historical context |\n\n",
  );
  assert.doesNotThrow(() => validateDocumentationPolicy(policy, context));
});

test("rejects decision relationship drift", () => {
  for (const [before, after] of [
    [
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | current |",
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | superseded by 0001 |",
    ],
    ["superseded by 0002 |", "superseded by 9999 |"],
    [
      "| [0017](0017-owned-opencode-go-provider.md) | superseded | providers | superseded by 0072 |",
      "| [0017](0017-owned-opencode-go-provider.md) | superseded | providers | superseded by 0071 |",
    ],
    [
      "| [0001](0001-owned-zero-dependency-rust.md) | superseded | foundation | superseded by 0002 |",
      "| [0001](0001-owned-zero-dependency-rust.md) | superseded | foundation | superseded by 0019 |",
    ],
    [
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | current |",
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | supersedes 0017 |",
    ],
  ]) {
    const context = currentContext();
    context.files[policy.decisionIndex] = context.files[
      policy.decisionIndex
    ].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects historical supersession metadata drift", () => {
  for (const [file, before, after] of [
    [
      "docs/decisions/0002-owned-zero-dependency-typescript.md",
      "- Supersedes: decision 0001",
      "- Supersedes: decision 0019",
    ],
    [
      "docs/decisions/0002-owned-zero-dependency-typescript.md",
      "- Supersedes: decision 0001",
      "- Historical replacement: decision 0001",
    ],
    [
      "docs/decisions/0017-owned-opencode-go-provider.md",
      "- Superseded: 2026-08-16 by decision 0072",
      "- Superseded: 2026-08-16 by decision 0071",
    ],
    [
      "docs/decisions/0017-owned-opencode-go-provider.md",
      "- Superseded: 2026-08-16 by decision 0072",
      "- Historical replacement: decision 0072",
    ],
    [
      "docs/decisions/0067-owned-opencode-provider-selection.md",
      "- Superseded by: decision 0072",
      "- Superseded by: decision 0071",
    ],
    [
      "docs/decisions/0068-owned-ephemeral-provider-and-model-selection.md",
      "- Supersedes: the startup credential and fixed-model selection parts of decision 0067",
      "- Supersedes: the startup credential and fixed-model selection parts of decision 0066",
    ],
  ]) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects prospective decision metadata drift", () => {
  for (const [file, before, after] of [
    [
      "docs/decisions/0070-owned-documentation-information-architecture.md",
      "- Domain: documentation",
      "- Domain: architecture",
    ],
    [
      "docs/decisions/0072-owned-ollama-cloud-provider.md",
      "- Supersedes: 0017, 0067, and 0068",
      "- Supersedes: none",
    ],
    [
      "docs/decisions/0072-owned-ollama-cloud-provider.md",
      "- Supersedes: 0017, 0067, and 0068",
      "- Supersedes: 0017, 0067, and 0069",
    ],
    [
      "docs/decisions/0072-owned-ollama-cloud-provider.md",
      "- Date: 2026-08-16",
      "- Date: 1999-01-01",
    ],
  ]) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects impossible prospective decision dates", () => {
  const file = "docs/decisions/0072-owned-ollama-cloud-provider.md";
  for (const date of ["2026-02-30", "2026-00-15", "2025-02-29"]) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(
      "- Date: 2026-08-16",
      "- Date: " + date,
    );
    const prospectiveDecisionDates = {
      ...policy.prospectiveDecisionDates,
      "0072": date,
    };
    const decisionRecordDigest = {
      ...policy.decisionRecordDigest,
      value: recordDigestFor(context),
    };
    assert.throws(
      () =>
        validateDocumentationPolicy(
          {
            ...policy,
            prospectiveDecisionDates,
            decisionRecordDigest,
          },
          context,
        ),
      DocumentationPolicyError,
    );
  }
});

test("permits valid prospective leap-day metadata", () => {
  const context = currentContext();
  const file = "docs/decisions/0072-owned-ollama-cloud-provider.md";
  context.files[file] = context.files[file].replace(
    "- Date: 2026-08-16",
    "- Date: 2024-02-29",
  );
  const prospectiveDecisionDates = {
    ...policy.prospectiveDecisionDates,
    "0072": "2024-02-29",
  };
  const decisionRecordDigest = {
    ...policy.decisionRecordDigest,
    value: recordDigestFor(context),
  };
  assert.doesNotThrow(() =>
    validateDocumentationPolicy(
      { ...policy, prospectiveDecisionDates, decisionRecordDigest },
      context,
    ),
  );
});

test("preserves both directions when a consolidation is superseded", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[policy.decisionIndex]
    .replace(
      "| documentation | [0081 structural manual policy](0081-owned-structural-manual-policy.md), [0070 information architecture](0070-owned-documentation-information-architecture.md), [0071 task-oriented operator manual](0071-owned-task-oriented-operator-manual.md) |",
      "| documentation | [0081 structural manual policy](0081-owned-structural-manual-policy.md), [0070 information architecture](0070-owned-documentation-information-architecture.md) |",
    )
    .replace(
      "| [0070](0070-owned-documentation-information-architecture.md) | accepted | documentation | current |",
      "| [0070](0070-owned-documentation-information-architecture.md) | accepted | documentation | supersedes 0071 |",
    )
    .replace(
      "| [0071](0071-owned-task-oriented-operator-manual.md) | accepted | documentation | supersedes 0009 |",
      "| [0071](0071-owned-task-oriented-operator-manual.md) | superseded | documentation | supersedes 0009; superseded by 0070 |",
    );
  context.files[
    "docs/decisions/0070-owned-documentation-information-architecture.md"
  ] = context.files[
    "docs/decisions/0070-owned-documentation-information-architecture.md"
  ].replace("- Supersedes: none", "- Supersedes: 0071");
  context.files["docs/decisions/0071-owned-task-oriented-operator-manual.md"] =
    context.files[
      "docs/decisions/0071-owned-task-oriented-operator-manual.md"
    ]
      .replace("- Status: accepted", "- Status: superseded")
      .replace("- Superseded by: none", "- Superseded by: 0070");
  const currentDecisionAuthorities = {
    ...policy.currentDecisionAuthorities,
    documentation: ["0081", "0070"],
  };
  const decisionRelationshipEdges = policy.decisionRelationshipEdges.flatMap(
    (edge) =>
      edge.superseder === "0071"
        ? [{ superseder: "0070", superseded: "0071" }, edge]
        : [edge],
  );
  const decisionRecordDigest = {
    ...policy.decisionRecordDigest,
    value: recordDigestFor(context),
  };
  assert.doesNotThrow(() =>
    validateDocumentationPolicy(
      {
        ...policy,
        currentDecisionAuthorities,
        decisionRelationshipEdges,
        decisionRecordDigest,
      },
      context,
    ),
  );
});

test("rejects cycles in the decision supersession graph", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[policy.decisionIndex]
    .replace(
      "[0023 Markdown](0023-owned-bounded-markdown.md), ",
      "",
    )
    .replace(
      "| [0019](0019-owned-semantic-terminal-tones.md) | superseded | terminal | superseded by 0023, 0027, and 0031 |",
      "| [0019](0019-owned-semantic-terminal-tones.md) | superseded | terminal | supersedes 0023; superseded by 0023, 0027, and 0031 |",
    )
    .replace(
      "| [0023](0023-owned-bounded-markdown.md) | accepted | terminal | supersedes 0019 |",
      "| [0023](0023-owned-bounded-markdown.md) | superseded | terminal | supersedes 0019; superseded by 0019 |",
    );
  context.files["docs/decisions/0019-owned-semantic-terminal-tones.md"] =
    context.files["docs/decisions/0019-owned-semantic-terminal-tones.md"].replace(
      "- Date: 2026-08-09",
      "- Date: 2026-08-09\n- Supersedes: decision 0023",
    );
  context.files["docs/decisions/0023-owned-bounded-markdown.md"] =
    context.files["docs/decisions/0023-owned-bounded-markdown.md"].replace(
      "- Status: accepted",
      "- Status: superseded by decision 0019",
    );
  const historicalDecisionRelationshipFields = {
    ...policy.historicalDecisionRelationshipFields,
    supersedes: {
      ...policy.historicalDecisionRelationshipFields.supersedes,
      "0019": "decision 0023",
    },
  };
  const decisionRelationshipEdges = policy.decisionRelationshipEdges.flatMap(
    (edge) =>
      edge.superseder === "0023" && edge.superseded === "0019"
        ? [{ superseder: "0019", superseded: "0023" }, edge]
        : [edge],
  );
  const currentDecisionAuthorities = {
    ...policy.currentDecisionAuthorities,
    terminal: policy.currentDecisionAuthorities.terminal.filter(
      (id) => id !== "0023",
    ),
  };
  const decisionRecordDigest = {
    ...policy.decisionRecordDigest,
    value: recordDigestFor(context),
  };
  assert.throws(
    () =>
      validateDocumentationPolicy(
        {
          ...policy,
          historicalDecisionRelationshipFields,
          decisionRelationshipEdges,
          currentDecisionAuthorities,
          decisionRecordDigest,
        },
        context,
      ),
    {
      name: "DocumentationPolicyError",
      message: /decision relationship cycle/u,
    },
  );
});

test("rejects coherent rewrites of canonical decision relationship edges", () => {
  const context = currentContext();
  context.files[policy.decisionIndex] = context.files[policy.decisionIndex]
    .replace(
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | current |",
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | supersedes 0017 |",
    )
    .replace(
      "| [0017](0017-owned-opencode-go-provider.md) | superseded | providers | superseded by 0072 |",
      "| [0017](0017-owned-opencode-go-provider.md) | superseded | providers | superseded by 0003 |",
    )
    .replace(
      "| [0072](0072-owned-ollama-cloud-provider.md) | accepted | providers | supersedes 0017, 0067, and 0068 |",
      "| [0072](0072-owned-ollama-cloud-provider.md) | accepted | providers | supersedes 0067 and 0068 |",
    );
  context.files["docs/decisions/0072-owned-ollama-cloud-provider.md"] =
    context.files[
      "docs/decisions/0072-owned-ollama-cloud-provider.md"
    ].replace(
      "- Supersedes: 0017, 0067, and 0068",
      "- Supersedes: 0067 and 0068",
    );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects incomplete documentation migration state", () => {
  for (const [before, after] of [
    ["- Status: complete", "- Status: active"],
    [
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | complete |",
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | active |",
    ],
    [
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | complete |\n",
      "",
    ],
  ]) {
    const context = currentContext();
    context.files[policy.migrationLedger] = context.files[
      policy.migrationLedger
    ].replace(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects malformed documentation migration table structure", () => {
  const context = currentContext();
  context.files[policy.migrationLedger] = context.files[
    policy.migrationLedger
  ].replace(
    "| Topic | Current sources | Canonical owner | Status |\n| --- | --- | --- | --- |\n",
    "",
  );
  assert.throws(
    () => validateDocumentationPolicy(policy, context),
    DocumentationPolicyError,
  );
});

test("rejects a reopened migration with completed map wording", () => {
  const context = currentContext();
  context.files[policy.migrationLedger] = context.files[
    policy.migrationLedger
  ]
    .replace("- Status: complete", "- Status: active")
    .replace(
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | complete |",
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | active |",
    );
  const migrationContentLedgerDigest = {
    ...policy.migrationContentLedgerDigest,
    value: migrationContentLedgerDigestFor(context),
  };
  assert.throws(
    () =>
      validateDocumentationPolicy(
        { ...policy, migrationContentLedgerDigest },
        context,
      ),
    DocumentationPolicyError,
  );
});

test("permits a coherently reopened documentation migration", () => {
  const context = currentContext();
  context.files[policy.migrationLedger] = context.files[
    policy.migrationLedger
  ]
    .replace("- Status: complete", "- Status: active")
    .replace(
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | complete |",
      "| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | active |",
    );
  context.files[policy.index] = context.files[policy.index].replace(
    "The completed lossless reduction is preserved in",
    "The active lossless reduction is tracked in",
  );
  const migrationContentLedgerDigest = {
    ...policy.migrationContentLedgerDigest,
    value: migrationContentLedgerDigestFor(context),
  };
  assert.doesNotThrow(() =>
    validateDocumentationPolicy(
      { ...policy, migrationContentLedgerDigest },
      context,
    ),
  );
});

test("routes completed durable design history to stable decision records", () => {
  const context = currentContext();
  const structure = policy.documentStructures.find(
    (entry) => entry.path === policy.decisionIndex,
  );
  assert.deepEqual(structure?.headings, [
    "# Architecture decision records",
    "## Lifecycle",
    "## Current authority by domain",
    "## Complete ledger",
  ]);
  assert.equal(
    context.files[policy.index].includes(
      "| [Decision index](decisions/README.md) | maintainers and auditors | durable design history |",
    ),
    true,
    "the central map does not register durable design history",
  );
  assert.equal(
    context.files[policy.index]
      .replace(/\s+/gu, " ")
      .includes("The completed lossless reduction is preserved in"),
    true,
    "the central map still describes the reduction as active",
  );
  assert.equal(
    context.files[policy.migrationLedger].includes(
      "| Topic | Current sources | Canonical owner | Status |",
    ),
    true,
    "the completed ledger still labels canonical owners as future",
  );
  assert.equal(
    context.files[policy.migrationLedger].startsWith(
      "# Documentation migration ledger\n\n- Status: complete\n",
    ),
    true,
    "the documentation migration is not closed",
  );
  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Durable design history |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "durable design history migration is not complete",
  );
});

test("rejects documentation authority row drift", () => {
  for (const [before, after] of [
    ["public product introduction", "general project notes"],
    ["[Decision index](decisions/README.md)", "[Evaluation manual](decisions/README.md)"],
  ]) {
    const context = currentContext();
    context.files[policy.index] = context.files[policy.index].replace(
      before,
      after,
    );
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects documentation map table boundary drift", () => {
  const publicRow =
    "| [Public README](../README.md) | public users | public product introduction |";
  const repositoryRow =
    "| [Repository instructions](../AGENTS.md) | contributors and coding agents | repository change contract |";
  const mutations = [
    (text) =>
      text.replace(
        "| Document | Audience | Authority |\n| --- | --- | --- |",
        "Registered documentation authorities",
      ),
    (text) =>
      text.replace(
        publicRow,
        publicRow +
          "\n| [Unregistered architecture](ARCHITECTURE.md) | readers | notes |",
      ),
    (text) =>
      text.replace(
        publicRow + "\n" + repositoryRow,
        repositoryRow + "\n" + publicRow,
      ),
    (text) =>
      text
        .replace(publicRow + "\n", "")
        .replace("## Reading paths\n", "## Reading paths\n\n" + publicRow + "\n"),
  ];

  for (const mutate of mutations) {
    const context = currentContext();
    context.files[policy.index] = mutate(context.files[policy.index]);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
});

test("rejects unknown decision status and domain classifications", () => {
  for (const [before, after] of [
    ["| accepted | documentation | current |", "| retired | documentation | current |"],
    ["| accepted | documentation | current |", "| accepted | miscellaneous | current |"],
    [
      "| [0003](0003-owned-provider-authentication.md) | accepted | providers | current |",
      "| [0003](0003-owned-provider-authentication.md) | accepted | tools | current |",
    ],
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

test("routes completed product operation to the operator manual", () => {
  const context = currentContext();

  for (const [file, route] of [
    ["README.md", "(docs/manual/README.md)"],
    ["docs/README.md", "(manual/README.md)"],
    ["docs/MAINTENANCE.md", "(manual/README.md)"],
  ]) {
    assert.equal(
      context.files[file].includes(route),
      true,
      file + " does not route product operation to the manual",
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "docs/manual/README.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Agent operator manual",
    "## Chapters",
    "## Current product boundary",
    "## Documentation contract",
  ]);

  const runningAgent = readFileSync(
    path.join(projectRoot, "docs/manual/01-running-agent.md"),
    "utf8",
  );
  for (const marker of [
    "Agent requires Node.js `>=22.19.0`, npm `11.16.0`, TypeScript `5.9.3`, and\nClang `>=18` installed outside this repository.",
    "npm ci --offline --ignore-scripts --no-audit --no-fund\nnpm run build\nnpm run install:command",
    "Run `agent` from the directory that should become the workspace.",
    "Every new or resumed session starts without a selected provider or model.",
    "Resume is a CLI launch form, not a TUI slash command.",
    "Use `/exit`, Ctrl+D, or terminal EOF.",
    "Use the exact `agent --evaluation-receipt` launch form",
    "`agent rejected the workspace root`",
  ]) {
    assert.equal(
      runningAgent.includes(marker),
      true,
      "running-agent operation contract is missing: " + marker,
    );
  }

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Product operation |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "product-operation migration is not complete",
  );
});

test("completes the task-oriented operator-manual migration without rewriting accepted decisions", () => {
  const context = currentContext();
  const legacyDecision = context.files[
    "docs/decisions/0009-owned-operator-manual.md"
  ];
  assert.equal(
    legacyDecision.includes("- Status: accepted"),
    true,
    "the historical manual decision status was rewritten",
  );
  assert.equal(
    legacyDecision.includes(
      "Every chapter\nuses the same ordered contract:",
    ),
    true,
    "the historical manual decision contract was rewritten",
  );

  const decision = context.files[
    "docs/decisions/0071-owned-task-oriented-operator-manual.md"
  ];
  for (const marker of [
    "The first migrated task is `01-running-agent.md`.",
    "The manual may temporarily contain both migrated task-specific chapters and\nlegacy six-section chapters.",
    "the active migration ledger.",
  ]) {
    assert.equal(
      decision.includes(marker),
      true,
      "the accepted task-oriented manual decision was rewritten: " + marker,
    );
  }

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) =>
      line.startsWith(
        "| Operator-manual structure and repository evidence routing |",
      ),
    );
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "operator-manual structure migration is not complete",
  );
});

test("routes completed evaluation operation to the evaluation guide", () => {
  const context = currentContext();
  for (const [file, route] of [
    ["AGENTS.md", "(evaluations/README.md)"],
    ["README.md", "(evaluations/README.md)"],
    ["docs/README.md", "(../evaluations/README.md)"],
    ["docs/ENGINEERING.md", "(../evaluations/README.md)"],
    ["docs/MAINTENANCE.md", "(../evaluations/README.md)"],
  ]) {
    assert.equal(
      context.files[file].includes(route),
      true,
      file + " does not route evaluation operation to the evaluation guide",
    );
  }

  const structure = policy.documentStructures.find(
    (entry) => entry.path === "evaluations/README.md",
  );
  assert.deepEqual(structure?.headings, [
    "# Owned task evaluations",
    "## Scope",
    "## List and prepare a run",
    "## Run agent and capture the receipt",
    "## Grade and validate the record",
    "## Protect local state and content",
    "## Maintain failure evidence",
    "## Update or remove the corpus",
    "## References",
  ]);

  const guide = context.files["evaluations/README.md"];
  const normalizedGuide = guide.replace(/\s+/gu, " ");
  assert.equal(
    normalizedGuide.includes(
      "`list` prints all " + evaluationPolicy.tasks.length +
        " registered task identifiers.",
    ),
    true,
    "evaluation guide task count does not match the manifest",
  );
  const projectKindLabels = new Map([
    ["c", "C"],
    ["documentation", "documentation"],
    ["javascript", "JavaScript"],
    ["typescript", "TypeScript"],
    ["web", "web"],
  ]);
  const projectKinds = [...new Set(
    evaluationPolicy.tasks.map((task) => task.projectKind),
  )].map((projectKind) => projectKindLabels.get(projectKind));
  assert.equal(
    projectKinds.every((projectKind) => typeof projectKind === "string"),
    true,
    "evaluation manifest contains an undocumented project kind",
  );
  const sortedProjectKinds = [...projectKinds].sort((left, right) =>
    left.localeCompare(right, "en")
  );
  assert.equal(
    normalizedGuide.includes(
      "The corpus spans " + sortedProjectKinds.slice(0, -1).join(", ") +
        ", and " + sortedProjectKinds.at(-1) + " work.",
    ),
    true,
    "evaluation guide project kinds do not match the manifest",
  );
  for (const marker of [
    "It is an evaluation corpus, not product runtime, training data, or a claim of model quality.",
    "node tools/evaluate.mjs prepare javascript-collapse-whitespace run-01",
    "Start `agent --evaluation-receipt` from the emitted `workspace` directory",
    "submit the `task` brief emitted by `prepare`; honor its `Completion` acceptance and denial conditions.",
    "The TTY-only option cannot be combined.",
    "On failure or loss, preserve the result and pending record.",
    "node tools/evaluate.mjs grade javascript-collapse-whitespace run-01",
    "Copy the receipt's five metric values into adjacent `record.json`; its schema version is present.",
    "set the closed outcome, artifact, and primary constraint",
    "`manualCorrections` and `riskyActions` as bounded counts. Add no fields beyond the template:",
    "node tools/evaluate.mjs validate-record javascript-collapse-whitespace run-01",
    "Input and created/edited `workspace/` files persist in ignored `state/evaluations/` until removed.",
    "The evaluator cannot delete them, run candidate code, or contact a provider;",
    "it captures no prompt, transcript, provider output, or receipt line.",
    "Records retain admitted fields only.",
    "Keep sensitive content out.",
    "snapshot path limits apply after the canonical task prefix is removed.",
    "Never reconstruct values from screenshots, transcripts, provider output, or tool activity.",
    "Entries contain only bounded entry and registered-task IDs; closed category, priority, lifecycle, and record classifications; positive occurrence count; content-free grade-path sets; resolution fields.",
    "promote it to `actionable` only when frequency or impact justifies a correction.",
    "The canonical verifier validates the registry against the current task catalog and tracked source inventory.",
    "Evaluator commands reserve the registry directory, file, and complete byte allowance but do not parse it or inspect ignored runs.",
    "Remove evidence if a corpus correction proves its expected snapshot could not satisfy its own check",
    "Change a task atomically with its brief, snapshots, manifest, completion contract, owning decision, evidence, docs, ownership/manual policy registrations, and tests.",
    "Task removal deletes that registered set; never move or reconstruct ignored runs or receipts.",
    "[decision 0047](../docs/decisions/0047-owned-reproducible-task-evaluation.md)",
  ]) {
    assert.equal(
      normalizedGuide.includes(marker),
      true,
      "evaluation operation contract is missing: " + marker,
    );
  }
  const guideBytes = readFileSync(
    path.join(projectRoot, "evaluations/README.md"),
  ).byteLength;
  assert.ok(
    guideBytes <= EVALUATION_LIMITS.taskBytes,
    "evaluation guide exceeds its corpus bound: " + guideBytes + "/" +
      EVALUATION_LIMITS.taskBytes,
  );

  const row = context.files[policy.migrationLedger]
    .split("\n")
    .find((line) => line.startsWith("| Owned evaluation operation |"));
  assert.equal(
    row?.endsWith("| complete |"),
    true,
    "owned-evaluation-operation migration is not complete",
  );

  const evaluationAuthority = context.files["docs/decisions/README.md"]
    .split("\n")
    .find((line) => line.startsWith("| evaluation |"));
  for (const decision of ["[0064 ", "[0065 ", "[0066 "]) {
    assert.equal(
      evaluationAuthority?.includes(decision),
      true,
      "evaluation authority omits task decision: " + decision.trim(),
    );
  }

  const maintenance = context.files["docs/MAINTENANCE.md"];
  const taskEvaluation = maintenance
    .slice(
      maintenance.indexOf("### Task evaluation"),
      maintenance.indexOf("### Documentation and publication"),
    )
    .replace(/\s+/gu, " ");
  for (const ownerPath of [
    "evaluations/README.md",
    "tools/evaluate.mjs",
    "tools/lib/evaluation-suite.mjs",
    "tools/lib/evaluation-failure-registry.mjs",
    "tools/test/evaluation-suite.test.mjs",
    "tools/test/evaluation-failure-registry.test.mjs",
    "packages/agent-cli/src/evaluation-receipt.ts",
    "packages/agent-cli/test/evaluation-receipt.test.ts",
    "packages/agent-cli/src/launch-command.ts",
    "packages/agent-cli/test/launch-command.test.ts",
    "packages/agent-cli/src/main.ts",
    "tools/smoke-cli.mjs",
    "packages/agent-cli/src/run.ts",
    "packages/agent-cli/test/runtime-integration.test.ts",
    "packages/agent-cli/src/builtin-tools.ts",
    "packages/agent-cli/test/builtin-tools.test.ts",
    "tools/evaluation-policy.json",
    "evaluations/failures/registry.json",
  ]) {
    assert.equal(
      context.ownedPaths.includes(ownerPath),
      true,
      "task-evaluation owner path is not owned: " + ownerPath,
    );
  }
  for (const owner of [
    "[evaluation guide](../evaluations/README.md)",
    "`tools/evaluate.mjs`",
    "`tools/lib/evaluation-suite.mjs`",
    "`tools/lib/evaluation-failure-registry.mjs`",
    "`tools/test/evaluation-suite.test.mjs`",
    "`tools/test/evaluation-failure-registry.test.mjs`",
    "`packages/agent-cli/src/evaluation-receipt.ts`",
    "`packages/agent-cli/test/evaluation-receipt.test.ts`",
    "`packages/agent-cli/src/launch-command.ts`",
    "`packages/agent-cli/test/launch-command.test.ts`",
    "`packages/agent-cli/src/main.ts`",
    "`tools/smoke-cli.mjs`",
    "`packages/agent-cli/src/run.ts`",
    "`packages/agent-cli/test/runtime-integration.test.ts`",
    "`packages/agent-cli/src/builtin-tools.ts`",
    "`packages/agent-cli/test/builtin-tools.test.ts`",
    "`tools/evaluation-policy.json`",
    "`evaluations/failures/registry.json`",
    "`evaluations/tasks/`",
    "[Decision 0047](decisions/0047-owned-reproducible-task-evaluation.md)",
    "[0048](decisions/0048-owned-content-free-evaluation-receipt.md)",
    "[0049](decisions/0049-owned-evaluation-failure-registry.md)",
    "[0064](decisions/0064-owned-self-verifying-typescript-evaluation.md)",
    "[0065](decisions/0065-owned-red-green-tool-recovery-evaluation.md)",
    "[0066](decisions/0066-owned-namespace-directory-evaluation.md)",
    "owns framework rationale and task design without a dedicated decision",
    "at most " + new Intl.NumberFormat("en-US").format(
      EVALUATION_LIMITS.taskBytes,
    ) + " bytes (`EVALUATION_LIMITS.taskBytes`)",
    "Follow the guide's atomic task-change, evidence-invalidation, rollback, and removal sequence.",
  ]) {
    assert.equal(
      taskEvaluation.includes(owner),
      true,
      "task-evaluation implementation owner is missing: " + owner,
    );
  }
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
    "## Local sessions",
    "## Local task evaluation",
    "## Removal",
  ]);

  assert.equal(
    context.files["PRIVACY.md"].includes(
      "An approved `shell` invocation is lifecycle-contained but not filesystem- or\nnetwork-sandboxed; its command retains the launching user's authority.",
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
    "OpenAI documents subscription browser and device login for its Codex clients.",
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
  for (const [before, after] of [
    ["[Security policy](../SECURITY.md)", "Security policy"],
    [
      "[Decision index](decisions/README.md) and stable records | complete |",
      "[Public README](../README.md) | complete |",
    ],
  ]) {
    const context = currentContext();
    context.files[policy.migrationLedger] = context.files[
      policy.migrationLedger
    ].replaceAll(before, after);
    assert.throws(
      () => validateDocumentationPolicy(policy, context),
      DocumentationPolicyError,
    );
  }
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
