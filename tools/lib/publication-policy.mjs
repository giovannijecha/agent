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
  sessionPersistence: "bounded-local",
  executionModel: "single-agent",
  mechanicalConcurrency: "bounded-independent-read-cohort",
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
  "docs/OWNERSHIP.md",
  "docs/PROVIDER-APPLICATIONS.md",
  "docs/PROVIDERS.md",
  "docs/decisions/0010-public-project-identity.md",
  "docs/ARCHITECTURE.md",
  "docs/ENGINEERING.md",
  "docs/manual/03-terminal-interface.md",
  "docs/manual/07-publishing-and-governance.md",
  "docs/decisions/0013-single-agent-execution.md",
  "docs/decisions/0074-owned-deterministic-read-overlap.md",
  "docs/decisions/0075-owned-branching-conversation-tree.md",
  "docs/decisions/0076-owned-bounded-session-journal.md",
  "docs/decisions/0083-owned-bounded-thinking-stream.md",
  "docs/decisions/0085-owned-reasoning-journal-migration.md",
  "docs/decisions/0086-owned-thinking-effort-and-display.md",
  "docs/decisions/0087-owned-user-scoped-state-root.md",
  "docs/decisions/0088-owned-durable-credential-boundary.md",
  "docs/decisions/0089-owned-external-authentication-transition.md",
  "assets/brand/README.md",
  "docs/BRAND.md",
  "docs/decisions/0037-canonical-agent-brand.md",
  "docs/decisions/0038-owned-deterministic-tui-motion.md",
]);
const OAUTH_REGISTRATION_ROWS = Object.freeze([
  "| ChatGPT Plus/Pro | OpenAI documents subscription browser and device login for its Codex clients. | Those flows identify OpenAI's clients; no accepted process registers `agent` as a direct independent client. |",
  "| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Claude Code and Agent SDK are foreign runtimes; no accepted direct independent-client registration is recorded for `agent`. |",
  "| Kimi Code | Kimi documents device OAuth for Kimi Code CLI and subscription-backed API keys for third-party development tools. | Public OAuth for third-party clients is unavailable according to the [recorded provider response](PROVIDER-APPLICATIONS.md#kimi-code); credential-only login does not satisfy this registration gate. |",
  "| Grok subscription | xAI documents browser and device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | Grok Build and ACP are foreign executables; no accepted process registers `agent` for direct subscription OAuth. |",
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

function validateProvenanceLog(policy, context) {
  exactKeys(
    policy.provenanceLog,
    ["path", "entryCount", "sha256"],
    "publication provenance log",
  );
  if (
    policy.provenanceLog.path !== "docs/OWNERSHIP.md" ||
    !Number.isSafeInteger(policy.provenanceLog.entryCount) ||
    policy.provenanceLog.entryCount <= 0 ||
    !/^[a-f0-9]{64}$/u.test(policy.provenanceLog.sha256)
  ) {
    fail("publication provenance log contract is invalid");
  }

  const lines = textFor(context, policy.provenanceLog.path).split("\n");
  const header =
    "| Date | Reference | Material inspected | Allowed influence | Code copied |";
  const headerIndex = lines.indexOf(header);
  if (
    headerIndex < 0 ||
    lines.at(headerIndex + 1) !== "|---|---|---|---|---|"
  ) {
    fail("provenance log table is invalid");
  }

  const entries = [];
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    const line = lines.at(index);
    if (line === undefined || !line.startsWith("|")) {
      break;
    }
    if (!/^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|/u.test(line)) {
      fail("provenance log entry is invalid");
    }
    entries.push(line);
  }

  if (entries.length !== policy.provenanceLog.entryCount) {
    fail("provenance log entry inventory drifted");
  }
  const ollamaErrorEntry =
    "| 2026-08-19 | [Ollama API errors](https://docs.ollama.com/api/errors) | " +
    "Public HTTP status-code semantics and JSON error-envelope shape for failed requests | " +
    "Content-free classification of non-success HTTP outcomes into the closed provider failure families under decision 0080; response bodies remain unread | " +
    "None; no SDK, CLI, executable, local daemon, source, sample, response, fixture, identifier, or implementation structure reused |";
  if (!entries.includes(ollamaErrorEntry)) {
    fail("Ollama error provenance contract is missing or incomplete");
  }
  const ollamaThinkingEntry =
    "| 2026-08-19 | [Ollama chat API](https://docs.ollama.com/api/chat), " +
    "[thinking capability](https://docs.ollama.com/capabilities/thinking), " +
    "[tool calling](https://docs.ollama.com/capabilities/tool-calling), and " +
    "[streaming](https://docs.ollama.com/capabilities/streaming) | " +
    "Native boolean and low, medium, and high request controls, separate streamed reasoning field, and reasoning continuity in assistant history | " +
    "Independently specified and implemented disabled-by-default bounded reasoning effort, independent transcript display, non-executable reasoning, and exact journal migration under decisions 0086 and 0085 | " +
    "None; no SDK, CLI, executable, source, sample, fixture, prompt, response, model identifier, product identity, or implementation structure reused |";
  if (!entries.includes(ollamaThinkingEntry)) {
    fail("Ollama thinking provenance contract is missing or incomplete");
  }
  const digest = createHash("sha256")
    .update(entries.join("\n") + "\n", "utf8")
    .digest("hex");
  if (digest !== policy.provenanceLog.sha256) {
    fail("provenance log entries drifted");
  }
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
      "original CLI and terminal UI authored in this repository",
      "Requirements: Node.js `>=22.19.0`, npm `11.16.0`, external TypeScript `5.9.3`,\nand Clang `>=18`. TypeScript and Clang stay outside the workspace.",
      "npm ci --offline --ignore-scripts --no-audit --no-fund\nnpm run build\nnpm run dev",
      "npm run install:command\nagent",
      "The directory in which `agent` starts becomes its immutable workspace boundary.",
      "The project remains on the `0.x` release line.",
      "single-agent execution model",
      "(docs/README.md)",
      "(docs/manual/README.md)",
      "(docs/BRAND.md)",
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
      "never overlap an owned effect",
      "results return to the sole controller in provider order",
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
      "excludes every owned effect",
      "terminal output remain serialized",
    ],
    "architecture",
  );
  requireMarkers(
    textFor(context, "docs/ENGINEERING.md"),
    [
      "All integrations preserve the single-agent execution model",
      "Any mutation excludes",
      "independent read handlers may overlap",
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
      "(../OWNERSHIP.md)",
      "(../../PRIVACY.md)",
      "(../../SECURITY.md)",
      "Enable GitHub private vulnerability reporting before the first release.",
      "The product is single-agent",
      "cannot overlap an owned effect",
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
    textFor(context, "docs/decisions/0074-owned-deterministic-read-overlap.md"),
    [
      "# 0074: Owned deterministic read overlap",
      "between two and four calls",
      "every permission settles",
      "fixed maximum width of four",
      "not an atomic multi-file filesystem snapshot",
      "results in provider order",
    ],
    "read overlap decision",
  );
  requireMarkers(
    textFor(context, "docs/decisions/0076-owned-bounded-session-journal.md"),
    [
      "# 0076: Owned bounded session journal",
      "`agent resume --latest` is the sole recovery",
      "Streaming deltas, prospective\nturns, drafts",
      "16,777,216 UTF-8 bytes",
      "at most 32 validated session directories",
      "A new schema version requires an accepted migration decision",
    ],
    "durable session decision",
  );
  requireMarkers(
    textFor(context, "assets/brand/README.md"),
    [
      "# Brand assets",
      "This directory is the scoped distribution entry point",
      "visual wordmark only",
      "manifest.json",
      "Do not silently convert, redraw,\nrecolor, crop, decorate, or add missing variants.",
      "The canonical verifier rejects unregistered\nfiles, byte drift, unsafe SVG content, and dimension drift.",
      "(../../docs/BRAND.md)",
    ],
    "brand asset registry",
  );
  requireMarkers(
    textFor(context, "docs/BRAND.md"),
    [
      "# Brand system",
      "The canonical product identity is `agent`.",
      "The exact lowercase `.agent` wordmark is a visual signature",
      "(../README.md)",
      "The canonical palette is `#FFFFFF` and `#0B0D10`.",
      "`assets/brand/manifest.json` is the machine-verified source of truth",
      "| Role | Controlled-scaling asset | Stable published asset |",
      "| Authentication mark | `agent-auth-logo.svg` | 256, 512, or 1024 px PNG |",
      "| Wordmark on dark surfaces | `agent-wordmark-dark.svg` | `agent-wordmark-dark.png` |",
      "| Wordmark on transparent surfaces | `agent-wordmark-transparent.svg` | `agent-wordmark-transparent.png` |",
      "Use the registered PNG files for stable published rendering.",
      "Use SVG only for\ncontrolled scaling where the host supports safe vector assets; SVG text uses a\nsystem font and can render differently across environments.",
      "Never regenerate\none format from another during a build.",
      "Do not add a persistent brand banner, welcome screen, dashboard, or decorative\n  header to the terminal interface.",
      "Keep brand assets outside `@agent/tui`",
      "(OWNERSHIP.md)",
      "Brand assets are never silently optimized, reformatted, or normalized.",
      "Retiring the complete\nbrand system additionally requires a superseding identity decision",
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
      "Include the affected version, platform, reproducible boundary, impact, and the\nsmallest safe reproduction.",
      "Replace all secrets and personal content with inert\nsentinels.",
      "credentials",
      "Keep a report private until a fix, regression test, affected-version statement,\nand release plan exist.",
    ],
    "security policy",
  );
  requireMarkers(
    textFor(context, "PRIVACY.md"),
    [
      "# Privacy policy",
      "`agent` is local-first software maintained by Giovanni Jecha. It has no project\ncloud service, analytics, advertising, crash-reporting endpoint, or telemetry.",
      "persists no credential, catalog, provider/model selection, or permission\npolicy.",
      "The policy is never persisted or sent to a provider.",
      "An approved `shell` invocation is lifecycle-contained but not filesystem- or\nnetwork-sandboxed; its command retains the launching user's authority.",
      "The Ollama API key is accepted only through the\nzero-projection TUI credential context or `AGENT_OLLAMA_API_KEY` and remains in\nprocess memory.",
      "Fixture inputs may enumerate public numeric status codes solely to prove the\nclosed mapping; those inputs are not returned diagnostics and contain no\ncaptured provider response.",
      "Decision 0089 changes no current retention behavior:\nit supersedes decision 0088's future design without creating a directory,\nrecord, or `agent auth` command and without admitting API-key persistence in the\ncurrent product.",
      "An explicit interactive `agent` launch creates a version-two local session\njournal outside the workspace.",
      "`agent resume --latest` restores the newest\ninactive version-one or version-two journal for the exact canonical workspace",
      "It excludes provider credentials, catalogs, provider/model\nselection, thinking settings, permission policy, drafts, streamed or speculative\noutput",
      "Closing the current process releases its in-memory conversation, display state,\nselection state, key reference, and session lock.",
    ],
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
    textFor(context, "docs/OWNERSHIP.md"),
    [
      "# Ownership and provenance",
      "We do not copy, translate, port, adapt,\nvendor, or regenerate project code from third parties.",
      "External documentation or current public source may establish observable\nbehavior or a protocol. Record the commit, material, and allowed facts below\nbefore implementation.",
      "Never reuse registered\nidentifiers, prompts, fixtures, headers that assert foreign identity, or source\nstructure.",
      "| Date | Reference | Material inspected | Allowed influence | Code copied |",
      "Later TUI comparison remains restricted to observable outcomes and does not\nadmit a foreign hierarchy, module boundary, name, style literal, animation\ntiming, redraw algorithm, or source structure.",
      "Development tools may assist repository work, but every accepted artifact is\nreviewed against this project's rules, tests, and provenance contract.",
      "Stop the change if provenance is uncertain.",
    ],
    "ownership and provenance policy",
  );
  requireMarkers(
    textFor(context, "docs/PROVIDERS.md"),
    [
      "# Provider eligibility",
      "Ollama Cloud is the sole enabled provider.",
      "| Origin | `https://ollama.com` |",
      "| Chat path | `/api/chat` |",
      "| Authenticated catalog path | `/api/tags` |",
      "The implementation is independent. It does not install or invoke Ollama, use an\nOllama SDK or CLI, contact a local daemon, read Ollama configuration, discover\norigins, follow model aliases, or persist the key.",
      "Neither\nprovider nor model has an automatic default.",
      "One concrete provider does not authorize a generic provider framework,\narbitrary base URL, unregistered model selector, key store, local-server mode,\nor additional integration.",
      "The Ollama API key\nmay never enter source, tests, logs, errors, documentation values, process\narguments, or command history.",
    ],
    "direct provider policy",
  );
  requireMarkers(
    textFor(context, "docs/OAUTH-REGISTRATION.md"),
    [
      "# OAuth client registration dossier",
      "Application name: `agent`",
      "Maintainer: Giovanni Jecha",
      "Canonical repository: [github.com/giovannijecha/agent]",
      "Registration state: `blocked`.",
      ...OAUTH_REGISTRATION_ROWS,
      "an accepted provider-specific successor decision,\nthe corresponding decision-0089 credential-store extension",
      "Offline contract tests must\ncover cancellation, expiry, concurrency, malformed responses, secret leakage,\nrollback, and removal.",
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
    [
      "schemaVersion",
      "project",
      "posture",
      "licenseFile",
      "provenanceLog",
      "documents",
    ],
    "publication policy",
  );
  if (policy.schemaVersion !== 5 || !isRecord(context)) {
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
  validateProvenanceLog(policy, context);
  validatePublicDocuments(context);
  rejectAuthorshipMisrepresentation(context);
}
