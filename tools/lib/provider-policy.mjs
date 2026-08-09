const OPENAI_SUBMISSION_URL =
  "https://community.openai.com/t/independent-native-oauth-public-client-registration-request-for-agent/1389585";
const CLAUDE_SUBMISSION_REFERENCE =
  "anthropic-support-messenger-2026-08-08";
const KIMI_SUBMISSION_REFERENCE = "kimi-support-email-2026-08-08";
const XAI_SUBMISSION_REFERENCE = "xai-support-email-2026-08-08";

const EXPECTED_PROVIDERS = [
  {
    id: "chatgpt",
    displayName: "ChatGPT Plus/Pro",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "openai-developer-forum",
      visibility: "public",
      submittedOn: "2026-08-08",
      reference: OPENAI_SUBMISSION_URL,
    },
  },
  {
    id: "claude",
    displayName: "Claude Pro/Max",
    eligibility: "blocked",
    blocker: "independent-client-authorization-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "anthropic-support-messenger",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: CLAUDE_SUBMISSION_REFERENCE,
    },
  },
  {
    id: "kimi",
    displayName: "Kimi Code",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "kimi-code-support-email",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: KIMI_SUBMISSION_REFERENCE,
    },
  },
  {
    id: "grok",
    displayName: "Grok subscription",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "submitted",
      kind: "public-client-authorization-inquiry",
      route: "xai-product-support-email",
      visibility: "private",
      submittedOn: "2026-08-08",
      reference: XAI_SUBMISSION_REFERENCE,
    },
  },
];

const EXPECTED_DIRECT_PROVIDERS = [
  {
    id: "opencode-go",
    displayName: "OpenCode Go",
    eligibility: "enabled",
    authorization: "direct-api-key",
    credentialVariable: "AGENT_OPENCODE_GO_API_KEY",
    credentialPersistence: "memory-only",
    endpoint: "https://opencode.ai/zen/go/v1/chat/completions",
    model: "kimi-k2.7-code",
    transport: "chat-completions-sse",
    evidence: "https://opencode.ai/docs/go/",
    researchedOn: "2026-08-09",
  },
];

const APPLICATION_DOCUMENT = "docs/PROVIDER-APPLICATIONS.md";
const RESEARCH_DATE = "2026-08-08";
const APPLICATION_HEADINGS = [
  "Submission rules",
  ...EXPECTED_PROVIDERS.map((provider) => provider.displayName),
  "Maintenance and removal",
];
const REQUEST_HEADINGS = [
  "Status",
  "Official route",
  "Subject",
  "Request",
  "Public attachments",
  "Required written answer",
  "Do not include",
  "Official evidence",
];
const ALLOWED_APPLICATION_EMAILS = new Set([
  "code@moonshot.ai",
  "support@x.ai",
]);
const PUBLIC_ATTACHMENT_URLS = [
  "https://github.com/giovannijecha/agent",
  "https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md",
  "https://github.com/giovannijecha/agent/blob/main/PRIVACY.md",
  "https://github.com/giovannijecha/agent/blob/main/SECURITY.md",
];
const OFFICIAL_ROUTE_URLS = Object.freeze({
  chatgpt: "https://community.openai.com/",
  claude: "https://support.claude.com/en/articles/9015913-how-to-get-support",
  kimi: "mailto:code@moonshot.ai",
  grok: "mailto:support@x.ai",
});
const OFFICIAL_EVIDENCE_URLS = Object.freeze({
  chatgpt: [
    "https://developers.openai.com/codex/auth/",
    "https://developers.openai.com/codex/app-server/",
    "https://developers.openai.com/community",
  ],
  claude: [
    "https://code.claude.com/docs/en/authentication",
    "https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan",
    "https://support.claude.com/en/articles/9015913-how-to-get-support",
  ],
  kimi: [
    "https://www.kimi.com/code/docs/en/",
    "https://www.kimi.com/code/docs/en/kimi-code/contact-and-feedback.html",
  ],
  grok: [
    "https://docs.x.ai/build/overview",
    "https://docs.x.ai/build/enterprise",
    "https://x.ai/contact",
  ],
});

const EXPECTED_WORKSPACES = [
  "@agent/core",
  "@agent/tools",
  "@agent/runtime",
  "@agent/provider-opencode-go",
  "@agent/tui",
  "@agent/cli",
];

const APPROVED_SOURCE_LITERALS = Object.freeze({
  "packages/agent-provider-opencode-go/src/wire.ts": ["kimi-k2.7-code"],
  "packages/agent-cli/test/session.test.ts": ["kimi-k2.7-code"],
  "packages/agent-cli/src/node-opencode-go-transport.ts": ["Bearer "],
  "packages/agent-cli/test/node-opencode-go-transport.test.ts": ["Bearer "],
});

const FORBIDDEN_SOURCE_MARKERS = [
  [/(?:auth\.openai\.com|chatgpt\.com\/backend-api)/iu, "OpenAI subscription endpoint"],
  [/(?:claude\.ai\/oauth|platform\.claude\.com\/v1\/oauth)/iu, "Claude subscription endpoint"],
  [/(?:auth\.kimi\.com|api\.kimi\.com\/coding)/iu, "Kimi subscription endpoint"],
  [/(?:auth\.x\.ai|api\.x\.ai\/v1)/iu, "xAI subscription endpoint"],
  [/\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\b/u, "ambient network capability"],
  [/\b(?:oauth|pkce|CLIENT_ID|clientId|client_id)\b/iu, "OAuth client protocol"],
  [/\b(?:accessToken|access_token|refreshToken|refresh_token|deviceCode|device_code)\b/iu, "OAuth credential protocol"],
  [/\b(?:openai|chatgpt|anthropic|claude|kimi|xai|grok)\b/iu, "blocked provider implementation"],
  [/\b(?:applicationId|bearer(?:Token|Value)?)\b/iu, "OAuth identity or credential protocol"],
  [/\b(?:ANTHROPIC_OAUTH_TOKEN|KIMI_CODE_OAUTH_HOST)\b/u, "provider token configuration"],
  [/(?:auth\.json|\.codex|\.claude|\.kimi-code|\.grok)/u, "foreign credential storage"],
  [/(?:originator[^\n]*pi|referrer[^\n]*pi|You are Claude Code|claude-cli\/)/iu, "foreign product identity"],
];

const FORBIDDEN_COMPACT_MARKERS = [
  [/auth\.openai\.com/u, "OpenAI subscription endpoint"],
  [/chatgpt\.com\/backendapi/u, "OpenAI subscription endpoint"],
  [/claude\.ai\/oauth/u, "Claude subscription endpoint"],
  [/platform\.claude\.com\/v1\/oauth/u, "Claude subscription endpoint"],
  [/auth\.kimi\.com/u, "Kimi subscription endpoint"],
  [/api\.kimi\.com\/coding/u, "Kimi subscription endpoint"],
  [/auth\.x\.ai/u, "xAI subscription endpoint"],
  [/api\.x\.ai\/v1/u, "xAI subscription endpoint"],
  [/[=:](?:access|refresh)token(?:[;,}]|$)/u, "OAuth access or refresh token"],
  [/[=:]devicecode(?:[;,}]|$)/u, "OAuth device code"],
  [/\.codex\/auth\.json/u, "foreign credential storage"],
  [/\.claude/u, "foreign credential storage"],
  [/\.kimicode/u, "foreign credential storage"],
  [/\.grok/u, "foreign credential storage"],
  [/(?:identity|originator|referrer)[=:]pi(?:\/|[;,}])/u, "foreign product identity"],
  [/youareclaudecode/u, "foreign product identity"],
];

export class ProviderPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderPolicyError";
  }
}

function fail(message) {
  throw new ProviderPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function assertSame(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function validateRequestLifecycle(request, label) {
  if (request.state === "ready-not-submitted") {
    if (request.submittedOn !== null || request.reference !== null) {
      fail(label + " unsubmitted request must not retain submission metadata");
    }
    return;
  }
  if (
    request.state !== "submitted" ||
    typeof request.submittedOn !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(request.submittedOn) ||
    typeof request.reference !== "string" ||
    request.reference.length === 0
  ) {
    fail(label + " submitted request metadata is invalid");
  }
  if (
    request.visibility === "public" &&
    !/^https:\/\/[A-Za-z0-9.-]+(?:\/|$)/u.test(request.reference)
  ) {
    fail(label + " public submission reference must be an HTTPS URL");
  }
  if (
    request.visibility === "private" &&
    (!/^[A-Za-z0-9._:-]{1,128}$/u.test(request.reference) ||
      request.reference.includes("@"))
  ) {
    fail(label + " private submission reference must be content-free text");
  }
}

function markdownHeadings(text, level) {
  const prefix = "#".repeat(level) + " ";
  return text
    .split("\n")
    .filter((line) => line.startsWith(prefix) && !line.startsWith(prefix + "#"))
    .map((line) => line.slice(prefix.length));
}

function markdownSection(text, heading, nextHeading) {
  const startToken = "## " + heading + "\n";
  const start = text.indexOf(startToken);
  if (start < 0 || text.indexOf(startToken, start + startToken.length) >= 0) {
    fail("provider application section is missing or duplicated: " + heading);
  }
  const bodyStart = start + startToken.length;
  const end = nextHeading === undefined
    ? text.length
    : text.indexOf("## " + nextHeading + "\n", bodyStart);
  if (end < 0) {
    fail("provider application section order is invalid: " + heading);
  }
  return text.slice(bodyStart, end);
}

function markdownSubsection(text, heading, nextHeading) {
  const startToken = "### " + heading + "\n";
  const start = text.indexOf(startToken);
  if (start < 0 || text.indexOf(startToken, start + startToken.length) >= 0) {
    fail("provider application subsection is missing or duplicated: " + heading);
  }
  const bodyStart = start + startToken.length;
  const end = nextHeading === undefined
    ? text.length
    : text.indexOf("### " + nextHeading + "\n", bodyStart);
  if (end < 0) {
    fail("provider application subsection order is invalid: " + heading);
  }
  return text.slice(bodyStart, end);
}

function requestBody(section, provider) {
  const startToken = "### Request\n\n```text\n";
  const start = section.indexOf(startToken);
  const end = start < 0 ? -1 : section.indexOf("\n```", start + startToken.length);
  if (start < 0 || end < 0) {
    fail("provider request is not a copyable text block: " + provider.id);
  }
  const body = section.slice(start + startToken.length, end);
  if (
    body.length < 500 ||
    !body.includes("giovannijecha/agent") ||
    !body.includes("Giovanni Jecha") ||
    /\b(?:TODO|TBD|CHANGEME)\b/iu.test(body)
  ) {
    fail("provider request body is incomplete: " + provider.id);
  }
  return body;
}

function validateApplicationDocument(policy, text) {
  if (
    policy.applicationDocument !== APPLICATION_DOCUMENT ||
    policy.researchedOn !== RESEARCH_DATE ||
    !text.startsWith("# Provider registration requests\n") ||
    !text.includes("- Research date: `" + RESEARCH_DATE + "`")
  ) {
    fail("provider application identity or research date mismatch");
  }
  assertSame(markdownHeadings(text, 2), APPLICATION_HEADINGS, "provider application headings");

  for (let index = 0; index < EXPECTED_PROVIDERS.length; index += 1) {
    const provider = EXPECTED_PROVIDERS[index];
    const nextHeading = APPLICATION_HEADINGS[index + 2];
    const section = markdownSection(text, provider.displayName, nextHeading);
    assertSame(
      markdownHeadings(section, 3),
      REQUEST_HEADINGS,
      provider.id + " request headings",
    );
    for (const marker of [
      "- Eligibility: `" + provider.eligibility + "`",
      "- Request state: `" + provider.request.state + "`",
      "- Request kind: `" + provider.request.kind + "`",
      "- Submission route: `" + provider.request.route + "`",
      "- Channel visibility: `" + provider.request.visibility + "`",
    ]) {
      if (!section.includes(marker)) {
        fail(provider.id + " request metadata mismatch");
      }
    }
    if (provider.request.state === "submitted") {
      const referenceMarker = provider.request.visibility === "public"
        ? "- Public reference: [Submission record](" + provider.request.reference + ")"
        : "- Private reference: `" + provider.request.reference + "`";
      for (const marker of [
        "- Submitted on: `" + provider.request.submittedOn + "`",
        referenceMarker,
      ]) {
        if (!section.includes(marker)) {
          fail(provider.id + " submitted request metadata mismatch");
        }
      }
    } else if (
      section.includes("- Submitted on:") ||
      section.includes("- Public reference:") ||
      section.includes("- Private reference:")
    ) {
      fail(provider.id + " unsubmitted request contains submission metadata");
    }
    requestBody(section, provider);
    const route = markdownSubsection(section, "Official route", "Subject");
    if (!route.includes(OFFICIAL_ROUTE_URLS[provider.id])) {
      fail(provider.id + " request official route is incomplete");
    }
    const attachments = markdownSubsection(
      section,
      "Public attachments",
      "Required written answer",
    );
    for (const url of PUBLIC_ATTACHMENT_URLS) {
      if (!attachments.includes("](" + url + ")")) {
        fail(provider.id + " request public attachments are incomplete");
      }
    }
    const evidence = markdownSubsection(section, "Official evidence", undefined);
    for (const url of OFFICIAL_EVIDENCE_URLS[provider.id]) {
      if (!evidence.includes(url)) {
        fail(provider.id + " request official evidence is incomplete");
      }
    }
  }

  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
  for (const email of emails) {
    if (!ALLOWED_APPLICATION_EMAILS.has(email.toLowerCase())) {
      fail("provider applications contain an unapproved email address");
    }
  }
}

function validateRegistry(policy) {
  assertExactKeys(
    policy,
    [
      "schemaVersion",
      "applicationDocument",
      "researchedOn",
      "providers",
      "directProviders",
    ],
    "provider policy",
  );
  if (policy.schemaVersion !== 4) {
    fail("unsupported provider policy schema");
  }
  if (!Array.isArray(policy.providers)) {
    fail("provider policy providers must be an array");
  }
  if (policy.providers.length !== EXPECTED_PROVIDERS.length) {
    fail("provider policy must contain exactly four providers");
  }

  const seen = new Set();
  for (let index = 0; index < policy.providers.length; index += 1) {
    const provider = policy.providers[index];
    const expected = EXPECTED_PROVIDERS[index];
    assertExactKeys(
      provider,
      ["id", "displayName", "eligibility", "blocker", "request"],
      "provider at index " + String(index),
    );
    assertExactKeys(
      provider.request,
      ["state", "kind", "route", "visibility", "submittedOn", "reference"],
      "provider request at index " + String(index),
    );
    validateRequestLifecycle(provider.request, "provider request at index " + String(index));
    if (seen.has(provider.id)) {
      fail("duplicate provider id: " + String(provider.id));
    }
    seen.add(provider.id);
    if (JSON.stringify(provider) !== JSON.stringify(expected)) {
      fail("provider policy mismatch at index " + String(index));
    }
  }

  if (
    !Array.isArray(policy.directProviders) ||
    policy.directProviders.length !== EXPECTED_DIRECT_PROVIDERS.length
  ) {
    fail("provider policy must contain exactly one admitted direct provider");
  }
  for (let index = 0; index < policy.directProviders.length; index += 1) {
    const provider = policy.directProviders[index];
    assertExactKeys(
      provider,
      [
        "id",
        "displayName",
        "eligibility",
        "authorization",
        "credentialVariable",
        "credentialPersistence",
        "endpoint",
        "model",
        "transport",
        "evidence",
        "researchedOn",
      ],
      "direct provider at index " + String(index),
    );
    if (
      JSON.stringify(provider) !==
      JSON.stringify(EXPECTED_DIRECT_PROVIDERS[index])
    ) {
      fail("direct provider policy mismatch at index " + String(index));
    }
  }
}

function validateWorkspaces(workspaceNames) {
  const actual = [...workspaceNames].sort();
  const expected = [...EXPECTED_WORKSPACES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("provider policy requires the exact admitted workspaces");
  }
}

function decodeScannableEscapes(text) {
  return text
    .replace(/\\x([0-9A-Fa-f]{2})/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/\\u\{([0-9A-Fa-f]{1,6})\}/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/\\u([0-9A-Fa-f]{4})/gu, (_match, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    );
}

function compactSource(text) {
  return decodeScannableEscapes(text)
    .replace(/[\s\x22'`+\\_-]/gu, "")
    .toLowerCase();
}

function validateProductSources(productSources) {
  for (const source of productSources) {
    if (!isRecord(source) || typeof source.path !== "string" || typeof source.text !== "string") {
      fail("product source entries must contain path and text");
    }
    let scannable = source.text;
    const approved = APPROVED_SOURCE_LITERALS[source.path] ?? [];
    for (const literal of approved) {
      scannable = scannable.split(literal).join("");
    }
    for (const [pattern, label] of FORBIDDEN_SOURCE_MARKERS) {
      if (pattern.test(scannable)) {
        fail(source.path + " contains forbidden " + label);
      }
    }
    const compact = compactSource(scannable);
    if (
      /import(?!\{)[^;]*fromnode:process/u.test(compact) ||
      /import\{[^}]*defaultas[^}]*\}fromnode:process/u.test(compact)
    ) {
      fail(source.path + " contains a broad node:process import");
    }
    for (const [pattern, label] of FORBIDDEN_COMPACT_MARKERS) {
      if (pattern.test(compact)) {
        fail(source.path + " contains obfuscated " + label);
      }
    }
  }
}

export function validateProviderPolicy(policy, context) {
  if (
    !isRecord(context) ||
    !Array.isArray(context.workspaceNames) ||
    !Array.isArray(context.productSources) ||
    typeof context.applicationText !== "string"
  ) {
    fail("provider policy validation context is invalid");
  }
  validateRegistry(policy);
  validateApplicationDocument(policy, context.applicationText);
  validateWorkspaces(context.workspaceNames);
  validateProductSources(context.productSources);
}
