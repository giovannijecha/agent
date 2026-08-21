import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PublicationPolicyError,
  validatePublicationPolicy,
} from "../lib/publication-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const policy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/publication-policy.json"), "utf8"),
);

function currentContext() {
  return {
    files: Object.fromEntries(
      policy.documents.map((file) => [
        file,
        readFileSync(path.join(projectRoot, file), "utf8"),
      ]),
    ),
  };
}

function provenanceDigest(text) {
  const entries = text
    .split("\n")
    .filter((line) => /^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|/u.test(line));
  return createHash("sha256")
    .update(entries.join("\n") + "\n", "utf8")
    .digest("hex");
}

test("accepts the canonical public project identity", () => {
  assert.doesNotThrow(() => validatePublicationPolicy(policy, currentContext()));
});

test("rejects public identity drift", () => {
  const changed = structuredClone(policy);
  changed.project.maintainer = "Different Maintainer";
  assert.throws(
    () => validatePublicationPolicy(changed, currentContext()),
    PublicationPolicyError,
  );
});

test("rejects single-agent execution posture drift", () => {
  const changed = structuredClone(policy);
  changed.posture.executionModel = "multi-agent";
  assert.throws(
    () => validatePublicationPolicy(changed, currentContext()),
    PublicationPolicyError,
  );

  const concurrentMutation = structuredClone(policy);
  concurrentMutation.posture.mechanicalConcurrency = "unrestricted";
  assert.throws(
    () => validatePublicationPolicy(concurrentMutation, currentContext()),
    PublicationPolicyError,
  );
});

test("rejects single-agent public contract drift", () => {
  const cases = [
    ["AGENTS.md", "never overlap an owned effect"],
    ["docs/ARCHITECTURE.md", "excludes every owned effect"],
    ["docs/ENGINEERING.md", "independent read handlers may overlap"],
    [
      "docs/manual/07-publishing-and-governance.md",
      "cannot overlap an owned effect",
    ],
    [
      "docs/decisions/0074-owned-deterministic-read-overlap.md",
      "fixed maximum width of four",
    ],
    [
      "docs/decisions/0076-owned-bounded-session-journal.md",
      "`agent resume --latest` is the sole recovery",
    ],
    [
      "docs/decisions/0013-single-agent-execution.md",
      "Mechanical concurrency does not create another agent",
    ],
  ];

  for (const [file, marker] of cases) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(
      marker,
      "Concurrent workers may act as separate agents",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      file,
    );
  }
});

test("rejects deterministic motion public contract drift", () => {
  const context = currentContext();
  context.files["docs/decisions/0038-owned-deterministic-tui-motion.md"] =
    context.files[
      "docs/decisions/0038-owned-deterministic-tui-motion.md"
    ].replace(
      "The first visible projection is one constant-width three-cell pulse",
      "The visible projection may change width between frames",
    );

  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects canonical terminal presentation contract drift", () => {
  const cases = [
    [
      "User entries compose one stage-wide transparent `Surface` with the shared\none-cell content inset and no rail, marker, border, or background",
      "User entries use a private boxed surface",
    ],
    ["`diffRemoved` red foreground", "one neutral diff foreground"],
    ["selected-row `accent` foreground", "private selected-row styling"],
  ];

  for (const [marker, replacement] of cases) {
    const context = currentContext();
    context.files["docs/ARCHITECTURE.md"] = context.files[
      "docs/ARCHITECTURE.md"
    ].replace(marker, replacement);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects public README entry-point drift", () => {
  const cases = [
    "An owned, zero-dependency personal coding agent.",
    "original CLI and terminal UI authored in this repository",
    "Requirements: Node.js `>=22.19.0`, npm `11.16.0`, external TypeScript `5.9.3`,\nand Clang `>=18`. TypeScript and Clang stay outside the workspace.",
    "npm ci --offline --ignore-scripts --no-audit --no-fund\nnpm run build\nnpm run dev",
    "npm run install:command\nagent",
    "The directory in which `agent` starts becomes its immutable workspace boundary.",
    "The project remains on the `0.x` release line.",
    "(docs/README.md)",
    "(docs/manual/README.md)",
    "(docs/BRAND.md)",
    "`agent auth`",
    "`/models`",
  ];

  for (const marker of cases) {
    const context = currentContext();
    context.files["README.md"] = context.files["README.md"].replaceAll(
      marker,
      "removed public entry point",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects brand documentation contract drift", () => {
  const cases = [
    [
      "docs/BRAND.md",
      "The canonical palette is `#FFFFFF` and `#0B0D10`.",
    ],
    [
      "docs/BRAND.md",
      "`assets/brand/manifest.json` is the machine-verified source of truth",
    ],
    [
      "docs/BRAND.md",
      "| Role | Controlled-scaling asset | Stable published asset |",
    ],
    [
      "docs/BRAND.md",
      "| Authentication mark | `agent-auth-logo.svg` | 256, 512, or 1024 px PNG |",
    ],
    [
      "docs/BRAND.md",
      "| Wordmark on dark surfaces | `agent-wordmark-dark.svg` | `agent-wordmark-dark.png` |",
    ],
    [
      "docs/BRAND.md",
      "| Wordmark on transparent surfaces | `agent-wordmark-transparent.svg` | `agent-wordmark-transparent.png` |",
    ],
    [
      "docs/BRAND.md",
      "Use the registered PNG files for stable published rendering.",
    ],
    [
      "docs/BRAND.md",
      "Use SVG only for\ncontrolled scaling where the host supports safe vector assets; SVG text uses a\nsystem font and can render differently across environments.",
    ],
    ["docs/BRAND.md", "Never regenerate\none format from another during a build."],
    [
      "docs/BRAND.md",
      "Do not add a persistent brand banner, welcome screen, dashboard, or decorative\n  header to the terminal interface.",
    ],
    ["docs/BRAND.md", "Keep brand assets outside `@agent/tui`"],
    ["docs/BRAND.md", "(OWNERSHIP.md)"],
    [
      "docs/BRAND.md",
      "Brand assets are never silently optimized, reformatted, or normalized.",
    ],
    [
      "docs/BRAND.md",
      "Retiring the complete\nbrand system additionally requires a superseding identity decision",
    ],
    [
      "assets/brand/README.md",
      "This directory is the scoped distribution entry point",
    ],
    [
      "assets/brand/README.md",
      "Do not silently convert, redraw,\nrecolor, crop, decorate, or add missing variants.",
    ],
    [
      "assets/brand/README.md",
      "The canonical verifier rejects unregistered\nfiles, byte drift, unsafe SVG content, and dimension drift.",
    ],
    ["assets/brand/README.md", "(../../docs/BRAND.md)"],
  ];

  for (const [file, marker] of cases) {
    const context = currentContext();
    context.files[file] = context.files[file].replace(
      marker,
      "removed brand contract",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects wordmark identity and brand-retirement decision drift", () => {
  for (const [before, after] of [
    [
      "The exact lowercase `.agent` wordmark is a visual signature",
      "The exact lowercase `.assistant` wordmark is a visual signature",
    ],
    ["a superseding identity decision", "an accepted identity decision"],
  ]) {
    const context = currentContext();
    context.files["docs/BRAND.md"] = context.files["docs/BRAND.md"].replace(
      before,
      after,
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      before,
    );
  }
});

test("rejects contribution workflow drift", () => {
  for (const marker of [
    "(AGENTS.md)",
    "(SECURITY.md)",
    "(docs/ENGINEERING.md)",
    "(docs/MAINTENANCE.md)",
    "(docs/OWNERSHIP.md)",
    "External code pull\nrequests are not accepted",
    "Apache License 2.0",
  ]) {
    const context = currentContext();
    context.files["CONTRIBUTING.md"] = context.files["CONTRIBUTING.md"].replaceAll(
      marker,
      "removed contribution contract",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }

  const manualRoute = currentContext();
  manualRoute.files["docs/manual/07-publishing-and-governance.md"] =
    manualRoute.files["docs/manual/07-publishing-and-governance.md"].replaceAll(
      "(../../CONTRIBUTING.md)",
      "(missing-contribution-policy.md)",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, manualRoute),
    PublicationPolicyError,
  );

  const protectedBranch = currentContext();
  protectedBranch.files["docs/ENGINEERING.md"] = protectedBranch.files[
    "docs/ENGINEERING.md"
  ].replaceAll(
    "Maintainer changes use a protected branch.",
    "Maintainer changes may use any branch.",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, protectedBranch),
    PublicationPolicyError,
  );
});

test("rejects vulnerability-reporting contract drift", () => {
  for (const marker of [
    "Only the latest published `0.x` release is\nsupported.",
    "Do not open a public\nissue, discussion, or pull request",
    "Private reporting must be enabled before the first public release.",
    "Keep a report private until a fix, regression test, affected-version statement,\nand release plan exist.",
  ]) {
    const context = currentContext();
    context.files["SECURITY.md"] = context.files["SECURITY.md"].replaceAll(
      marker,
      "removed vulnerability-reporting contract",
    );
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }

  for (const marker of [
    "(../../SECURITY.md)",
    "Enable GitHub private vulnerability reporting before the first release.",
  ]) {
    const context = currentContext();
    context.files["docs/manual/07-publishing-and-governance.md"] = context.files[
      "docs/manual/07-publishing-and-governance.md"
    ].replaceAll(marker, "removed security publication route");
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects an unsafe vulnerability reproduction", () => {
  const context = currentContext();
  context.files["SECURITY.md"] = context.files["SECURITY.md"].replace(
    "Include the affected version, platform, reproducible boundary, impact, and the\nsmallest safe reproduction.",
    "Include the affected version, platform, reproducible boundary, impact.",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects an unsanitized vulnerability report", () => {
  const context = currentContext();
  context.files["SECURITY.md"] = context.files["SECURITY.md"].replace(
    "Replace all secrets and personal content with inert\nsentinels.",
    "Include live secrets and personal content.",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects privacy and bounded local retention drift", () => {
  for (const marker of [
    "may persist only the exact provider-specific Ollama Cloud API-key record under\n`~/.agent/credentials`. Catalogs, provider/model selection, thinking settings,\nand permission policy remain process-only.",
    "The policy is never persisted or sent to a provider.",
    "The Ollama API key is registered, replaced, or\nremoved only by the exact external `agent auth` command in a TTY, outside the\nalternate-screen UI.",
    "The owned plaintext record is\nprotected by native owner-only filesystem controls; it is not an encrypted\nvault",
    "If both authorities are present, startup fails explicitly;\nthere is no precedence or automatic import.",
    "Fixture inputs may enumerate public numeric status codes solely to prove the\nclosed mapping; those inputs are not returned diagnostics and contain no\ncaptured provider response.",
    "An explicit interactive `agent` launch creates a version-two local session\njournal outside the workspace.",
    "`agent resume --latest` restores the newest\ninactive version-one or version-two journal for the exact canonical workspace",
    "It excludes provider credentials, catalogs, provider/model\nselection, thinking settings, permission policy, drafts, streamed or speculative\noutput",
    "Closing the current process releases its in-memory conversation, display state,\nselection state, credential snapshot, credential admission lock, and session\nlock.",
  ]) {
    const context = currentContext();
    const maintained = context.files["PRIVACY.md"];
    context.files["PRIVACY.md"] = context.files["PRIVACY.md"].replaceAll(
      marker,
      "removed privacy and retention contract",
    );
    assert.notEqual(context.files["PRIVACY.md"], maintained, marker);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects a weakened process-isolation privacy warning", () => {
  const context = currentContext();
  const maintained = context.files["PRIVACY.md"];
  context.files["PRIVACY.md"] = context.files["PRIVACY.md"].replace(
    "An approved `shell` invocation is lifecycle-contained but not filesystem- or\nnetwork-sandboxed; its command retains the launching user's authority.",
    "An approved `shell` invocation is fully sandboxed.",
  );
  assert.notEqual(context.files["PRIVACY.md"], maintained);
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects a missing privacy publication route", () => {
  const context = currentContext();
  const maintained = context.files[
    "docs/manual/07-publishing-and-governance.md"
  ];
  context.files["docs/manual/07-publishing-and-governance.md"] = context.files[
    "docs/manual/07-publishing-and-governance.md"
  ].replaceAll("(../../PRIVACY.md)", "(missing-privacy-policy.md)");
  assert.notEqual(
    context.files["docs/manual/07-publishing-and-governance.md"],
    maintained,
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects clean-room provenance contract drift", () => {
  const ownership = readFileSync(
    path.join(projectRoot, "docs/OWNERSHIP.md"),
    "utf8",
  );
  for (const marker of [
    "We do not copy, translate, port, adapt,\nvendor, or regenerate project code from third parties.",
    "External documentation or current public source may establish observable\nbehavior or a protocol. Record the commit, material, and allowed facts below\nbefore implementation.",
    "Never reuse\nthird-party registered identifiers, prompts, fixtures, headers that assert\nforeign identity, or source structure.",
    "| Date | Reference | Material inspected | Allowed influence | Code copied |",
    "Later TUI comparison remains restricted to observable outcomes and does not\nadmit a foreign hierarchy, module boundary, name, style literal, animation\ntiming, redraw algorithm, or source structure.",
    "Development tools may assist repository work, but every accepted artifact is\nreviewed against this project's rules, tests, and provenance contract.",
    "Stop the change if provenance is uncertain.",
  ]) {
    const context = currentContext();
    context.files["docs/OWNERSHIP.md"] = ownership.replaceAll(
      marker,
      "removed clean-room provenance contract",
    );
    assert.notEqual(context.files["docs/OWNERSHIP.md"], ownership, marker);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("requires stale public documentation before reference-source inspection", () => {
  const ownership = readFileSync(
    path.join(projectRoot, "docs/OWNERSHIP.md"),
    "utf8",
  );
  for (const marker of [
    "Reference-project implementation source may be inspected only after current\npublic documentation is demonstrated stale or incomplete for the exact\ninteroperability fact.",
    "A maintainer\nrequest does not replace this prerequisite.",
  ]) {
    assert.equal(ownership.includes(marker), true, marker);
  }
});

test("excludes retrospectively justified reference-source influence", () => {
  const context = currentContext();
  const ownership = context.files["docs/OWNERSHIP.md"];
  const decision =
    context.files["docs/decisions/0090-owned-openai-subscription-oauth-contract.md"];
  const providers = context.files["docs/PROVIDERS.md"];
  assert.equal(
    ownership.includes("Discarded Pi and OpenCode OpenAI OAuth source inspection"),
    true,
  );
  assert.equal(
    ownership.includes("No allowed influence; excluded from decision 0090"),
    true,
  );
  assert.match(
    decision,
    /supplies no feasibility,\s+protocol, identity, or implementation authority/u,
  );
  assert.doesNotMatch(decision, /Both projects independently implement/u);
  assert.match(
    decision,
    /one commit-pinned official OpenAI provenance\s+entry and the separately bound discarded Pi\/OpenCode historical record/u,
  );
  assert.doesNotMatch(decision, /two commit-pinned clean-room provenance/u);
  assert.doesNotMatch(
    providers,
    /Those concrete stale-documentation\s+gaps permitted/u,
  );
});

test("rejects removal or modification of maintained provenance entries", () => {
  const maintained = currentContext().files["docs/OWNERSHIP.md"];
  const entries = maintained
    .split("\n")
    .filter((line) => /^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|/u.test(line));
  const firstEntry = entries.at(0);
  assert.equal(typeof firstEntry, "string");

  for (const changed of [
    maintained
      .split("\n")
      .filter((line) => !/^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|/u.test(line))
      .join("\n"),
    maintained.replace(firstEntry + "\n", ""),
    maintained.replace(firstEntry, firstEntry + " altered"),
  ]) {
    const context = currentContext();
    context.files["docs/OWNERSHIP.md"] = changed;
    assert.notEqual(context.files["docs/OWNERSHIP.md"], maintained);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
    );
  }
});

test("rejects Ollama error provenance drift after inventory repinning", () => {
  const maintained = currentContext().files["docs/OWNERSHIP.md"];
  for (const marker of [
    "| 2026-08-19 | [Ollama API errors](https://docs.ollama.com/api/errors)",
    "Public HTTP status-code semantics and JSON error-envelope shape for failed requests",
    "Content-free classification of non-success HTTP outcomes into the closed provider failure families under decision 0080",
    "response bodies remain unread",
    "None; no SDK, CLI, executable, local daemon, source, sample, response, fixture, identifier, or implementation structure reused",
  ]) {
    const context = currentContext();
    context.files["docs/OWNERSHIP.md"] = maintained.replace(
      marker,
      "removed Ollama error provenance",
    );
    assert.notEqual(context.files["docs/OWNERSHIP.md"], maintained, marker);
    const changed = structuredClone(policy);
    changed.provenanceLog.sha256 = provenanceDigest(
      context.files["docs/OWNERSHIP.md"],
    );
    assert.throws(
      () => validatePublicationPolicy(changed, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects bounded thinking provenance drift after inventory repinning", () => {
  const maintained = currentContext().files["docs/OWNERSHIP.md"];
  for (const marker of [
    "[thinking capability](https://docs.ollama.com/capabilities/thinking)",
    "Native boolean and low, medium, and high request controls, separate streamed reasoning field, and reasoning continuity in assistant history",
    "Independently specified and implemented disabled-by-default bounded reasoning effort, independent transcript display, non-executable reasoning, and exact journal migration under decisions 0086 and 0085",
    "under decisions 0086 and 0085 | None; no SDK, CLI, executable, source, sample, fixture, prompt, response, model identifier, product identity, or implementation structure reused |",
  ]) {
    const context = currentContext();
    context.files["docs/OWNERSHIP.md"] = maintained.replace(
      marker,
      "removed bounded thinking provenance",
    );
    assert.notEqual(context.files["docs/OWNERSHIP.md"], maintained, marker);
    const changed = structuredClone(policy);
    changed.provenanceLog.sha256 = provenanceDigest(
      context.files["docs/OWNERSHIP.md"],
    );
    assert.throws(
      () => validatePublicationPolicy(changed, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects OpenAI identity provenance drift after inventory repinning", () => {
  const maintained = currentContext().files["docs/OWNERSHIP.md"];
  for (const marker of [
    "bounded first-party Codex source at [`536f86e5cc9ec1ff38457d099bf320b9d08eeeba`]",
    "Before source access, this row recorded that current official OpenAI authentication documentation confirms ChatGPT subscription sign-in",
    "the device request sends only that identifier, polling treats forbidden and not-found as pending",
    "Raw auth requests omit Codex's default originator and user agent",
    "None; no implementation structure, code, test, fixture, prompt, credential schema, user agent, error text, or Codex product identity reused",
  ]) {
    const context = currentContext();
    context.files["docs/OWNERSHIP.md"] = maintained.replace(
      marker,
      "removed OpenAI identity provenance",
    );
    assert.notEqual(context.files["docs/OWNERSHIP.md"], maintained, marker);
    const changed = structuredClone(policy);
    changed.provenanceLog.sha256 = provenanceDigest(
      context.files["docs/OWNERSHIP.md"],
    );
    assert.throws(
      () => validatePublicationPolicy(changed, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects a missing ownership publication route", () => {
  const context = currentContext();
  const maintained = context.files[
    "docs/manual/07-publishing-and-governance.md"
  ];
  context.files["docs/manual/07-publishing-and-governance.md"] = context.files[
    "docs/manual/07-publishing-and-governance.md"
  ].replaceAll("(../OWNERSHIP.md)", "(missing-ownership-record.md)");
  assert.notEqual(
    context.files["docs/manual/07-publishing-and-governance.md"],
    maintained,
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects direct provider admission contract drift", () => {
  const providers = readFileSync(
    path.join(projectRoot, "docs/PROVIDERS.md"),
    "utf8",
  );
  for (const marker of [
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
    "The contract is now `auth-compatible-inactive`",
    "OpenAI remains blocked by `transport-implementation-required`.",
  ]) {
    const context = currentContext();
    context.files["docs/PROVIDERS.md"] = providers.replaceAll(
      marker,
      "removed direct provider contract",
    );
    assert.notEqual(context.files["docs/PROVIDERS.md"], providers, marker);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      marker,
    );
  }
});

test("rejects OAuth registration status drift", () => {
  const context = currentContext();
  const maintained = context.files["docs/OAUTH-REGISTRATION.md"];
  context.files["docs/OAUTH-REGISTRATION.md"] = maintained.replace(
    "Registration state: `blocked`.",
    "Registration state: `approved`.",
  );
  assert.notEqual(context.files["docs/OAUTH-REGISTRATION.md"], maintained);
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects provider-specific OAuth registration conclusion drift", () => {
  const maintained = currentContext().files["docs/OAUTH-REGISTRATION.md"];
  for (const [provider, row] of [
    [
      "ChatGPT Plus/Pro",
      "| ChatGPT Plus/Pro | OpenAI documents subscription browser and device login for Codex clients; decisions 0090 through 0094 fix the independently derived protocol, exact provider-owned public-client identity, owned record, and active device-auth command. | Authentication is `auth-compatible-inactive`: sign-in and local removal are active without provider endorsement, while refresh, revocation, catalog, model, and conversation runtime remain inactive. |",
    ],
    [
      "Claude Pro/Max",
      "| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Claude Code and Agent SDK are foreign runtimes; no accepted direct independent-client registration is recorded for `agent`. |",
    ],
    [
      "Kimi Code",
      "| Kimi Code | Kimi documents device OAuth for Kimi Code; a pre-recorded clean-room inspection confirmed that current subscription OAuth uses Kimi's first-party public client even though Pi's provider guide omits that route. | Compatibility feasibility is established, but the [recorded provider response](PROVIDER-APPLICATIONS.md#kimi-code) remains a material negative-eligibility risk and a provider-specific decision is still required. |",
    ],
    [
      "Grok subscription",
      "| Grok subscription | xAI documents browser and RFC 8628 device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | A clean-room inspection confirms direct-flow feasibility, but xAI public-client ownership remains unresolved and a provider-specific decision is required. |",
    ],
  ]) {
    const context = currentContext();
    context.files["docs/OAUTH-REGISTRATION.md"] = maintained.replace(
      row,
      "| " + provider + " | altered route | Registration accepted. |",
    );
    assert.notEqual(context.files["docs/OAUTH-REGISTRATION.md"], maintained);
    assert.throws(
      () => validatePublicationPolicy(policy, context),
      PublicationPolicyError,
      provider,
    );
  }
});

test("rejects OAuth contract-test coverage drift", () => {
  const context = currentContext();
  const maintained = context.files["docs/OAUTH-REGISTRATION.md"];
  context.files["docs/OAUTH-REGISTRATION.md"] = maintained.replace(
    "Offline contract tests must cover cancellation, expiry,\nconcurrency, malformed responses, secret leakage, rollback, and removal.",
    "Offline contract tests must cover the happy path.",
  );
  assert.notEqual(context.files["docs/OAUTH-REGISTRATION.md"], maintained);
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects obsolete OAuth credential-store authority", () => {
  const context = currentContext();
  const maintained = context.files["docs/OAUTH-REGISTRATION.md"];
  context.files["docs/OAUTH-REGISTRATION.md"] = maintained.replace(
    "For Kimi\nor xAI, accept a separate provider-specific compatibility decision; for Claude,\nsatisfy the direct-registration gate.",
    "decision-0088 storage activation",
  );
  assert.notEqual(context.files["docs/OAUTH-REGISTRATION.md"], maintained);
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects modified license terms", () => {
  const context = currentContext();
  context.files.LICENSE = context.files.LICENSE.replace(
    "Grant of Patent License",
    "Patent Terms",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects a Git checkout policy that can alter verified text", () => {
  const context = currentContext();
  context.files[".gitattributes"] = "* text=auto\n";
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});

test("rejects missing public links and automated attribution", () => {
  const missingPublicReadmeRoute = currentContext();
  missingPublicReadmeRoute.files["docs/BRAND.md"] =
    missingPublicReadmeRoute.files["docs/BRAND.md"].replace(
      "(../README.md)",
      "(missing-public-readme.md)",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingPublicReadmeRoute),
    PublicationPolicyError,
  );

  const missingLink = currentContext();
  missingLink.files["README.md"] = missingLink.files["README.md"].replaceAll(
    "(PRIVACY.md)",
    "(missing.md)",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, missingLink),
    PublicationPolicyError,
  );

  const missingRequestLink = currentContext();
  missingRequestLink.files["README.md"] = missingRequestLink.files["README.md"].replaceAll(
    "(docs/PROVIDER-APPLICATIONS.md)",
    "(missing-requests.md)",
  );
  assert.throws(
    () => validatePublicationPolicy(policy, missingRequestLink),
    PublicationPolicyError,
  );

  const missingSubmissionReference = currentContext();
  missingSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"].replace(
      "community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585",
      "example.com/unverified-submission",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingSubmissionReference),
    PublicationPolicyError,
  );

  const missingPrivateSubmissionReference = currentContext();
  missingPrivateSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingPrivateSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "anthropic-support-messenger-2026-08-08",
      "conversation-unverified",
    );
  assert.throws(
    () =>
      validatePublicationPolicy(policy, missingPrivateSubmissionReference),
    PublicationPolicyError,
  );

  const missingKimiSubmissionReference = currentContext();
  missingKimiSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingKimiSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "kimi-support-email-2026-08-08",
      "kimi-support-email-unverified",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingKimiSubmissionReference),
    PublicationPolicyError,
  );

  const missingXaiSubmissionReference = currentContext();
  missingXaiSubmissionReference.files["docs/PROVIDER-APPLICATIONS.md"] =
    missingXaiSubmissionReference.files[
      "docs/PROVIDER-APPLICATIONS.md"
    ].replace(
      "xai-support-email-2026-08-08",
      "xai-support-email-unverified",
    );
  assert.throws(
    () => validatePublicationPolicy(policy, missingXaiSubmissionReference),
    PublicationPolicyError,
  );

  const attributed = currentContext();
  attributed.files["README.md"] += "\nGenerated by Codex.\n";
  assert.throws(
    () => validatePublicationPolicy(policy, attributed),
    PublicationPolicyError,
  );
});

test("rejects unverifiable no-tool authorship claims", () => {
  const context = currentContext();
  context.files["CONTRIBUTING.md"] += "\nThis is 100% human-written.\n";
  assert.throws(
    () => validatePublicationPolicy(policy, context),
    PublicationPolicyError,
  );
});
