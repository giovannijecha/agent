import { createHash } from "node:crypto";

import { PROVIDER_POLICY_SCHEMA_VERSION } from "./provider-policy.mjs";

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
  "docs/decisions/0090-owned-openai-subscription-oauth-contract.md",
  "docs/decisions/0091-owned-provider-public-client-compatibility.md",
  "docs/decisions/0092-owned-openai-compatible-public-client.md",
  "docs/decisions/0093-owned-openai-oauth-credential-record.md",
  "docs/decisions/0094-owned-openai-device-authentication.md",
  "docs/decisions/0095-owned-openai-provider-transport.md",
  "assets/brand/README.md",
  "docs/BRAND.md",
  "docs/decisions/0037-canonical-agent-brand.md",
  "docs/decisions/0038-owned-deterministic-tui-motion.md",
]);
const OAUTH_REGISTRATION_ROWS = Object.freeze([
  "| ChatGPT Plus/Pro | OpenAI documents subscription browser and device login for Codex clients; decisions 0090 through 0095 fix the independently derived protocol, exact provider-owned public-client identity, owned record, active device-auth command, and inactive catalog and Responses transport. | Authentication is `transport-compatible-inactive`: sign-in and local removal are active without provider endorsement and the transport is installed but uncomposed, while refresh, revocation, provider/model selection, and conversation runtime remain inactive. |",
  "| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Claude Code and Agent SDK are foreign runtimes; no accepted direct independent-client registration is recorded for `agent`. |",
  "| Kimi Code | Kimi documents device OAuth for Kimi Code; a pre-recorded clean-room inspection confirmed that current subscription OAuth uses Kimi's first-party public client even though Pi's provider guide omits that route. | Compatibility feasibility is established, but the [recorded provider response](PROVIDER-APPLICATIONS.md#kimi-code) remains a material negative-eligibility risk and a provider-specific decision is still required. |",
  "| Grok subscription | xAI documents browser and RFC 8628 device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | A clean-room inspection confirms direct-flow feasibility, but xAI public-client ownership remains unresolved and a provider-specific decision is required. |",
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
  const discardedOpenAiReferenceInspectionEntry =
    "| 2026-08-21 | Discarded Pi and OpenCode OpenAI OAuth source inspection at Pi " +
    "[`5cd93f688aaab89dbb6dfa4aca535f21796ae185`](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/ai/src/auth/oauth/openai-codex.ts) and OpenCode " +
    "[`e11dbd02068aa36723dd43da43c247ade82d2fe7`](https://github.com/anomalyco/opencode/blob/e11dbd02068aa36723dd43da43c247ade82d2fe7/packages/core/src/plugin/provider/openai.ts) | " +
    "OpenAI OAuth implementation files viewed before a concrete stale-public-documentation gap was recorded | " +
    "No allowed influence; excluded from decision 0090 and every policy, protocol, feasibility, identity, and implementation claim | " +
    "None; no code, structure, test, fixture, prompt, endpoint, scope, header, client identifier, credential schema, model identifier, or product identity reused |";
  if (!entries.includes(discardedOpenAiReferenceInspectionEntry)) {
    fail("discarded OpenAI reference-source provenance is missing or incomplete");
  }
  const openAiIdentityInspectionEntry =
    "| 2026-08-21 | [OpenAI Codex authentication](https://developers.openai.com/codex/auth/), " +
    "[authorization-server metadata](https://auth.openai.com/.well-known/openid-configuration), and bounded first-party Codex source at " +
    "[`536f86e5cc9ec1ff38457d099bf320b9d08eeeba`](https://github.com/openai/codex/tree/536f86e5cc9ec1ff38457d099bf320b9d08eeeba) | " +
    "Before source access, this row recorded that current official OpenAI authentication documentation confirms ChatGPT subscription sign-in, device-code login, local credential caching, automatic refresh, and logout, but omits the exact provider-owned public-client constant, requested scopes, device-poll status values, redirect value, and controllable caller-identity fields required by decisions 0090 and 0091. After that record, only `codex-rs/login/src/device_code_auth.rs`, the relevant OAuth-field excerpts of `server.rs`, `auth/manager.rs`, and `lib.rs`, and the complete auth `default_client.rs` module were inspected; no tests were opened. | " +
    "The exact non-secret default is an OpenAI-owned public-client identifier; the device request sends only that identifier, polling treats forbidden and not-found as pending until the fixed deadline, and exchange uses the provider-owned device callback. The device route sends no scope field, while the published metadata admits public clients without a secret, PKCE S256, refresh, and the base OIDC scopes. Raw auth requests omit Codex's default originator and user agent, so every independently controlled caller field can be omitted or identify `agent` truthfully. | " +
    "None; no implementation structure, code, test, fixture, prompt, credential schema, user agent, error text, or Codex product identity reused |";
  if (!entries.includes(openAiIdentityInspectionEntry)) {
    fail("OpenAI identity provenance contract is missing or incomplete");
  }
  const openAiAuthInspectionEntry =
    "| 2026-08-21 | Reopened bounded first-party Codex authentication source at " +
    "[`536f86e5cc9ec1ff38457d099bf320b9d08eeeba`](https://github.com/openai/codex/tree/536f86e5cc9ec1ff38457d099bf320b9d08eeeba) after rechecking " +
    "[OpenAI Codex authentication](https://developers.openai.com/codex/auth/) and " +
    "[authorization-server metadata](https://auth.openai.com/.well-known/openid-configuration) | " +
    "Before reopening source, this row recorded that the public material and earlier inspection did not bind the exact device-success and poll-success response-field spellings, decimal-string interval representation, token-form field set, required token response fields, ID-token account-claim path, access-token expiration source, or first-poll timing needed to implement decision 0094. Only `codex-rs/login/src/device_code_auth.rs` and the relevant account-claim excerpts of `codex-rs/login/src/server.rs` were reopened; no tests or unrelated modules were inspected. A later content-safe live reproduction retained only response family, content type, byte count, field names, and field types, then cleared the body without retaining any response value. | " +
    "Device success requires `device_auth_id`, `user_code`, and a decimal-string `interval`; the first-party decoder does not deny other response members. The live schema additionally carried one string `expires_at`, which permits only that optional bounded and discarded member in Agent. The first poll is immediate and success carries authorization code, challenge, and verifier. The public-client exchange uses authorization-code grant, the fixed device callback, client identifier, and verifier and requires ID, access, and refresh tokens. The ID token's OpenAI auth namespace supplies `chatgpt_account_id`; access-token `exp` supplies record expiration; the returned verifier must reproduce the returned S256 challenge. These protocol facts informed an independently authored decision-0094 adapter. | " +
    "None; no response value, implementation structure, code, test, fixture, prompt, credential schema, user agent, error text, or Codex product identity reused |";
  if (!entries.includes(openAiAuthInspectionEntry)) {
    fail("OpenAI authentication provenance contract is missing or incomplete");
  }
  const reopenedPiOpenAiInspectionEntry =
    "| 2026-08-21 | Reopened bounded Pi OpenAI OAuth source at " +
    "[`5cd93f688aaab89dbb6dfa4aca535f21796ae185`](https://github.com/earendil-works/pi/blob/5cd93f688aaab89dbb6dfa4aca535f21796ae185/packages/ai/src/auth/oauth/openai-codex.ts) after repeated content-safe Agent login failures | " +
    "Current public OpenAI material and the earlier first-party inspection did not explain why a provider-approved live device ceremony was rejected before token exchange. At the user's request, only Pi's OpenAI token-response admission, access-token account extraction, and device-flow composition were reopened; no tests or other modules were inspected. A later temporary diagnostic retained only the failing phase and classified the bounded poll success as containing the valid required projection plus an additional member; it retained no member name, type, or value. | " +
    "Pi projects the required poll-success values without rejecting additional members. Together with the independently reproduced live classification and the same first-party decoding posture, this supports Agent's independently authored bounded projection-only poll decoder. Pi's separate token and account choices remain differential feasibility evidence only. | " +
    "None; no code, structure, identifier, endpoint, scope, prompt, test, fixture, error text, response value, credential path, or product identity reused |";
  if (!entries.includes(reopenedPiOpenAiInspectionEntry)) {
    fail("reopened Pi OpenAI provenance contract is missing or incomplete");
  }
  const openAiTransportInspectionEntry =
    "| 2026-08-21 | Bounded first-party Codex transport inspection at " +
    "[`93c54bca38996b56d344a2ca65f01627b1953b27`](https://github.com/openai/codex/tree/93c54bca38996b56d344a2ca65f01627b1953b27), after rechecking " +
    "[Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses) and " +
    "[streaming Responses](https://developers.openai.com/api/docs/guides/streaming-responses) | " +
    "Before source access, this row recorded that current public Responses documentation fixes the public item, function-call, `store: false`, and SSE event families but does not publish the subscription-specific catalog envelope and eligibility fields, exact version-query and caller-header names, or the subscription Responses request delta needed by decision 0090. Only the first-party catalog endpoint and model schema, bearer/account header, default caller-header, Responses request, endpoint, and SSE modules were inspected, with filtered excerpts of their direct composition call site. Several inspected implementation files contain inline test blocks that were unavoidably returned with the module; those blocks were excluded from allowed influence. No separate test, prompt, fixture, configuration, or unrelated runtime file was opened. | " +
    "The catalog appends one `client_version` query and returns a `models` array whose bounded `slug`, `visibility`, and `supported_in_api` projection establishes availability; subscription bearer requests use `ChatGPT-Account-ID`; the caller field is the `originator` header; and the Responses request uses the public item and function-call model with automatic tool choice, serial calls, explicit reasoning, `store: false`, `stream: true`, and SSE completion. These provider-owned wire facts may inform an independently specified Agent contract. | " +
    "None; no code, structure, test, fixture, prompt, default caller value, user agent, error text, model identifier, or Codex product identity reused. |";
  if (!entries.includes(openAiTransportInspectionEntry)) {
    fail("OpenAI transport provenance contract is missing or incomplete");
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
      "`agent auth`",
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
      "Its Ollama\ncredential path performs no network request. Its OpenAI path performs only the\nfixed-origin device, poll, and token HTTPS ceremony owned by decision 0094",
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
      "may persist only the exact provider-specific Ollama Cloud API-key record under\n`~/.agent/credentials`. Catalogs, provider/model selection, thinking settings,\nand permission policy remain process-only.",
      "The policy is never persisted or sent to a provider.",
      "An approved `shell` invocation is lifecycle-contained but not filesystem- or\nnetwork-sandboxed; its command retains the launching user's authority.",
      "The Ollama API key is registered, replaced, or\nremoved only by the exact external `agent auth` command in a TTY, outside the\nalternate-screen UI.",
      "The owned plaintext record is\nprotected by native owner-only filesystem controls; it is not an encrypted\nvault",
      "If both authorities are present, startup fails explicitly;\nthere is no precedence or automatic import.",
      "Fixture inputs may enumerate public numeric status codes solely to prove the\nclosed mapping; those inputs are not returned diagnostics and contain no\ncaptured provider response.",
      "An explicit interactive `agent` launch creates a version-two local session\njournal outside the workspace.",
      "`agent resume --latest` restores the newest\ninactive version-one or version-two journal for the exact canonical workspace",
      "It excludes provider credentials, catalogs, provider/model\nselection, thinking settings, permission policy, drafts, streamed or speculative\noutput",
      "Closing the current process releases its in-memory conversation, display state,\nselection state, credential snapshot, credential admission lock, and session\nlock.",
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
      "Never reuse\nthird-party registered identifiers, prompts, fixtures, headers that assert\nforeign identity, or source structure.",
      "Decision 0091 permits only one narrower\nexception: an exact provider-owned non-secret public-client identifier",
      "Reference-project implementation source may be inspected only after current\npublic documentation is demonstrated stale or incomplete for the exact\ninteroperability fact.",
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
      "The implementation is independent. It does not install or invoke Ollama, use an\nOllama SDK or CLI, contact a local daemon, read Ollama configuration, discover\norigins, follow model aliases, or read foreign credential stores.",
      "Neither has an automatic\ndefault.",
      "One concrete provider does not authorize a generic provider framework,\narbitrary base URL, unregistered model selector, generic key store, local-server mode,\nor additional integration.",
      "The Ollama API key\nmay never enter source, tests, logs, errors, documentation values, process\narguments, command history, terminal output, transcript, journal, receipt, or\ndiagnostic.",
      "`agent auth` is the sole interactive credential lifecycle and runs outside the\nalternate-screen TUI.",
      "Decision 0090 records the OpenAI contract",
      "decision 0092 records OpenAI's exact non-secret\npublic client",
      "Decision 0093 implements the exact OpenAI record and private native\nlifecycle.",
      "Decision 0094 activates its fixed-origin device login",
      "Decision 0095 installs the independently authored Node-free catalog and\nResponses adapter and the exact CLI HTTPS transport.",
      "OpenAI transport is\n`transport-compatible-inactive`",
      "OpenAI remains blocked by `runtime-integration-required`.",
      "`tools/provider-policy.json` schema version " +
      String(PROVIDER_POLICY_SCHEMA_VERSION),
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
      "Compatibility state: `accepted-runtime-inactive`.",
      "Identity state: `accepted-runtime-inactive`.",
      "OpenAI authentication state: `transport-compatible-inactive`.",
      ...OAUTH_REGISTRATION_ROWS,
      "For ChatGPT, decision 0094 completes the auth-only activation under decisions\n0090 through 0093's protocol, identity, disclosure, and record boundaries, and\ndecision 0095 supplies the inactive catalog and conversation transport.",
      "For Kimi\nor xAI, accept a separate provider-specific compatibility decision; for Claude,\nsatisfy the direct-registration gate.",
      "Offline contract tests must cover cancellation, expiry,\nconcurrency, malformed responses, secret leakage, rollback, and removal.",
      "No accepted provider-specific implementation means no adapter",
    ],
    "OAuth registration dossier",
  );
  requireMarkers(
    textFor(
      context,
      "docs/decisions/0092-owned-openai-compatible-public-client.md",
    ),
    [
      "# 0092: Owned OpenAI compatible public client",
      "provider-owned non-secret public-client identifier",
      "`app_EMoamEEZ73f0CkXaXp7hrann`",
      "device authorization request contains only `client_id`",
      "HTTP 403 and 404 are the only pending poll outcomes",
      "caller identity is\n`agent` or the field is omitted",
      "No product source, credential record, network request",
      "retains this decision and the completed provenance\nrow",
    ],
    "OpenAI compatible public-client decision",
  );
  requireMarkers(
    textFor(
      context,
      "docs/decisions/0093-owned-openai-oauth-credential-record.md",
    ),
    [
      "# 0093: Owned OpenAI OAuth credential record",
      "`credential-compatible-inactive`",
      "`auth-implementation-required`",
      "`~/.agent/credentials/openai.oauth`",
      "No current command or TUI path creates, reads, replaces, or removes an OpenAI\nrecord.",
      "The canonical Windows and Linux gates must pass offline.",
    ],
    "OpenAI credential-record decision",
  );
  requireMarkers(
    textFor(
      context,
      "docs/decisions/0094-owned-openai-device-authentication.md",
    ),
    [
      "# 0094: Owned OpenAI device authentication",
      "`auth-compatible-inactive`",
      "`transport-implementation-required`",
      "The first poll is immediate.",
      "requires exact equality before exchange",
      "sole optional\ninterpreted matching poll challenge",
      "bounded discarded additional poll\nmembers",
      "deadline also bounds challenge presentation",
      "`chatgpt_account_id`",
      "admits only `expires_at` as one optional bounded member",
      "provider authorization was not revoked",
      "no OpenAI\ncatalog request, Responses request",
    ],
    "OpenAI device-authentication decision",
  );
  requireMarkers(
    textFor(
      context,
      "docs/decisions/0095-owned-openai-provider-transport.md",
    ),
    [
      "# 0095: Owned OpenAI provider transport",
      "`transport-compatible-inactive`",
      "`runtime-integration-required`",
      "client_version=0.1.0",
      "`ChatGPT-Account-ID`",
      "`store: false` and `stream: true`",
      "does\nnot request or retain `reasoning.encrypted_content`",
      "No current\ncommand, TUI path, startup path, or runtime session constructs",
    ],
    "OpenAI provider-transport decision",
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
