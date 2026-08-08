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
    ],
    "AGENTS.md",
  );

  requireMarkers(
    textFor(context, "SECURITY.md"),
    ["# Security policy", "private vulnerability reporting", "credentials"],
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
      "External code pull\nrequests are not accepted",
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
      "Request state: `ready-not-submitted`",
      "Submission route: `openai-developer-forum`",
      "Submission route: `anthropic-support-messenger`",
      "Submission route: `kimi-code-github-issues`",
      "Submission route: `xai-product-support-email`",
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
  if (policy.schemaVersion !== 1 || !isRecord(context)) {
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
