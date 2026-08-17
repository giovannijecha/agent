import { createHash } from "node:crypto";

const EXPECTED_PROJECT = Object.freeze({
  name: "agent",
  repository: "giovannijecha/agent",
  maintainer: "Giovanni Jecha",
  license: "Apache-2.0",
  versionLine: "0.x",
});
const EXPECTED_POSTURE = Object.freeze({
  telemetry: "none",
  serviceBackend: "none",
  sessionPersistence: "disabled",
  executionModel: "single-agent",
  mechanicalConcurrency: "immutable-read-phase-only",
  externalCodeContributions: "closed-initially",
  automatedAttribution: "none",
});
const EXPECTED_DOCUMENTS = Object.freeze([
  ".gitattributes",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "docs/OAUTH-REGISTRATION.md",
  "docs/PROVIDER-APPLICATIONS.md",
  "docs/decisions/0010-public-project-identity.md",
  "docs/ARCHITECTURE.md",
  "docs/ENGINEERING.md",
  "docs/manual/03-terminal-interface.md",
  "docs/manual/07-publishing-and-governance.md",
  "docs/decisions/0013-single-agent-execution.md",
  "assets/brand/README.md",
  "docs/BRAND.md",
  "docs/decisions/0037-canonical-agent-brand.md",
  "docs/decisions/0038-owned-deterministic-tui-motion.md",
]);
const FALSE_AUTHORSHIP_MARKERS = [
  /100% human(?:-written)?/iu,
  /entirely human(?:-written)?/iu,
  /made without (?:ai|tools?)/iu,
  /no (?:ai|tool) (?:was )?used/iu,
];
const AUTOMATED_ATTRIBUTION_MARKERS = [
  /co-authored-by:\s*(?:codex|openai)/iu,
  /generated[- ]by\s+(?:codex|openai)/iu,
  /written[- ]by\s+(?:codex|openai)/iu,
];

export class PublicationPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "PublicationPolicyError";
  }
}

function fail(message) {
  throw new PublicationPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function textFor(context, path) {
  if (!isRecord(context.files) || typeof context.files[path] !== "string") {
    fail("publication document is missing: " + path);
  }
  return context.files[path];
}

function requireMarkers(text, markers, label) {
  for (const marker of markers) {
    if (!text.includes(marker)) {
      fail(label + " is missing required public identity");
    }
  }
}

function validateLicense(policy, context) {
  exactKeys(policy.licenseFile, ["path", "sha256"], "publication license file");
  if (
    policy.licenseFile.path !== "LICENSE" ||
    !/^[a-f0-9]{64}$/u.test(policy.licenseFile.sha256)
  ) {
    fail("publication license contract is invalid");
  }
  const license = textFor(context, policy.licenseFile.path);
  const digest = createHash("sha256").update(license, "utf8").digest("hex");
  if (digest !== policy.licenseFile.sha256) {
    fail("Apache-2.0 license text drifted");
  }
  requireMarkers(
    license,
    [
      "Apache License\n                           Version 2.0, January 2004",
      "3. Grant of Patent License.",
      "END OF TERMS AND CONDITIONS",
    ],
    "license",
  );
}

function validatePublicDocuments(context) {
  if (textFor(context, ".gitattributes") !== "* text=auto eol=lf\n") {
    fail("Git line-ending policy must preserve canonical LF text");
  }
  const readme = textFor(context, "README.md");
  requireMarkers(
    readme,
    [
      "Giovanni Jecha",
      "giovannijecha/agent",
      "Apache-2.0",
      "(LICENSE)",
      "(SECURITY.md)",
      "(PRIVACY.md)",
      "(CONTRIBUTING.md)",
      "(docs/OAUTH-REGISTRATION.md)",
      "(docs/PROVIDER-APPLICATIONS.md)",
      "An owned, zero-dependency personal coding agent.",
      "single-agent execution model",
      "(docs/README.md)",
      "(docs/manual/README.md)",
      "`/providers`",
      "`/models`",
    ],
    "README",
  );

  const agents = textFor(context, "AGENTS.md");
  requireMarkers(
    agents,
    [
      "Giovanni Jecha",
      "giovannijecha/agent",
      "Do not add automated tool signatures",
      "single-agent product",
      "one active runtime session",
      "overlap a mutation",
      "Current runtime remains sequential",
    ],
    "AGENTS.md",
  );

  requireMarkers(
    textFor(context, "docs/ARCHITECTURE.md"),
    [
      "## Single-agent execution model",
      "does not create sub-agents",
      "one active runtime session",
      "Single-agent is an identity and authority contract",
      "Reduction is deterministic",
      "Any mutation excludes concurrent mechanics",
      "terminal output remain serialized",
    ],
    "architecture",
  );
  requireMarkers(
    textFor(context, "docs/ENGINEERING.md"),
    [
      "All integrations preserve the single-agent execution model",
      "Any mutation excludes",
      "Current runtime remains sequential",
      "Maintainer changes use a protected branch.",
    ],
    "engineering policy",
  );
  requireMarkers(
    textFor(context, "docs/ARCHITECTURE.md"),
    [
      "User entries compose one stage-wide transparent `Surface` with the shared\none-cell content inset and no rail, marker, border, or background",
      "selected-row `accent` foreground",
      "`diffRemoved` red foreground",
      "`diffAdded` green foreground",
    ],
    "terminal presentation architecture",
  );
  requireMarkers(
    textFor(context, "docs/manual/07-publishing-and-governance.md"),
    [
      "# 07 - Publishing and governance",
      "(../../CONTRIBUTING.md)",
      "(../../SECURITY.md)",
      "Enable GitHub private vulnerability reporting before the first release.",
      "The product is single-agent",
      "Current runtime remains sequential",
    ],
    "publishing manual",
  );
  requireMarkers(
    textFor(context, "docs/decisions/0013-single-agent-execution.md"),
    [
      "# 0013: Single-agent execution",
      "`agent` is a single-agent product",
      "Mechanical concurrency does not create another agent",
      "Any mutation excludes concurrent mechanics",
      "Model turns and mutations remain serialized",
      "Current runtime remains sequential",
    ],
    "single-agent decision",
  );
  requireMarkers(
    textFor(context, "assets/brand/README.md"),
    ["# Brand assets", "visual wordmark only", "manifest.json"],
    "brand asset registry",
  );
  requireMarkers(
    textFor(context, "docs/BRAND.md"),
    [
      "# Brand system",
      "The canonical product identity is `agent`.",
      "visual signature",
    ],
    "brand contract",
  );
  requireMarkers(
    textFor(context, "docs/decisions/0037-canonical-agent-brand.md"),
    [
      "# 0037: Canonical agent brand",
      "The exact lowercase `.agent` wordmark is a visual signature",
    ],
    "brand decision",
  );
  requireMarkers(
    textFor(context, "docs/decisions/0038-owned-deterministic-tui-motion.md"),
    [
      "# 0038: Owned deterministic TUI motion",
      "Motion is state communication, not decoration.",
      "The first visible projection is one constant-width three-cell pulse",
    ],
    "motion decision",
  );

  requireMarkers(
    textFor(context, "SECURITY.md"),
    [
      "# Security policy",
      "Only the latest published `0.x` release is\nsupported.",
      "private vulnerability reporting",
      "Do not open a public\nissue, discussion, or pull request",
      "Private reporting must be enabled before the first public release.",
      "Include the affected version, platform, reproducible boundary, impact",
      "credentials",
      "Keep a report private until a fix, regression test, affected-version statement,\nand release plan exist.",
    ],
    "security policy",
  );
  requireMarkers(
    textFor(context, "PRIVACY.md"),
    ["# Privacy policy", "no project\ncloud service", "telemetry", "process memory"],
    "privacy policy",
  );
  requireMarkers(
    textFor(context, "CONTRIBUTING.md"),
    [
      "# Contributing to agent",
      "(AGENTS.md)",
      "(SECURITY.md)",
      "(docs/ENGINEERING.md)",
      "(docs/MAINTENANCE.md)",
      "(docs/OWNERSHIP.md)",
      "External code pull\nrequests are not accepted",
      "Apache License 2.0",
      "automated tool signatures",
    ],
    "contribution policy",
  );
  requireMarkers(
    textFor(context, "docs/OAUTH-REGISTRATION.md"),
    [
      "# OAuth client registration dossier",
      "Application name: `agent`",
      "Maintainer: Giovanni Jecha",
      "Canonical repository: [github.com/giovannijecha/agent]",
      "No registration means no adapter",
    ],
    "OAuth registration dossier",
  );
  requireMarkers(
    textFor(context, "docs/PROVIDER-APPLICATIONS.md"),
    [
      "# Provider registration requests",
      "Request state: `submitted`",
      "Submission route: `openai-developer-forum`",
      "Submission route: `anthropic-support-messenger`",
      "Submission route: `kimi-code-support-email`",
      "Submission route: `xai-product-support-email`",
      "community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585",
      "Private reference: `anthropic-support-messenger-2026-08-08`",
      "Private reference: `kimi-support-email-2026-08-08`",
      "Private reference: `xai-support-email-2026-08-08`",
    ],
    "provider registration requests",
  );
}

function rejectAuthorshipMisrepresentation(context) {
  const publicText = [
    "AGENTS.md",
    "CONTRIBUTING.md",
    "README.md",
    "docs/decisions/0010-public-project-identity.md",
  ]
    .map((path) => textFor(context, path))
    .join("\n");
  for (const pattern of FALSE_AUTHORSHIP_MARKERS) {
    if (pattern.test(publicText)) {
      fail("public documents contain an unverifiable authorship claim");
    }
  }
  for (const pattern of AUTOMATED_ATTRIBUTION_MARKERS) {
    if (pattern.test(publicText)) {
      fail("public documents contain forbidden automated attribution");
    }
  }
}

/** Validates the immutable public identity and governance contract offline. */
export function validatePublicationPolicy(policy, context) {
  exactKeys(
    policy,
    ["schemaVersion", "project", "posture", "licenseFile", "documents"],
    "publication policy",
  );
  if (policy.schemaVersion !== 4 || !isRecord(context)) {
    fail("unsupported publication policy schema or context");
  }
  exactKeys(policy.project, Object.keys(EXPECTED_PROJECT), "publication project");
  exactKeys(policy.posture, Object.keys(EXPECTED_POSTURE), "publication posture");
  same(policy.project, EXPECTED_PROJECT, "publication project");
  same(policy.posture, EXPECTED_POSTURE, "publication posture");
  same(policy.documents, EXPECTED_DOCUMENTS, "publication document registry");
  for (const document of policy.documents) {
    textFor(context, document);
  }
  validateLicense(policy, context);
  validatePublicDocuments(context);
  rejectAuthorshipMisrepresentation(context);
}
