const EXPECTED_PROVIDERS = [
  {
    id: "chatgpt",
    displayName: "ChatGPT Plus/Pro",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "ready-not-submitted",
      kind: "public-client-authorization-inquiry",
      route: "openai-developer-forum",
      visibility: "public",
    },
  },
  {
    id: "claude",
    displayName: "Claude Pro/Max",
    eligibility: "blocked",
    blocker: "independent-client-authorization-required",
    request: {
      state: "ready-not-submitted",
      kind: "public-client-authorization-inquiry",
      route: "anthropic-support-messenger",
      visibility: "private",
    },
  },
  {
    id: "kimi",
    displayName: "Kimi Code",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "ready-not-submitted",
      kind: "public-client-authorization-inquiry",
      route: "kimi-code-github-issues",
      visibility: "public",
    },
  },
  {
    id: "grok",
    displayName: "Grok subscription",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
    request: {
      state: "ready-not-submitted",
      kind: "public-client-authorization-inquiry",
      route: "xai-product-support-email",
      visibility: "private",
    },
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
const ALLOWED_APPLICATION_EMAILS = new Set(["support@x.ai"]);
const PUBLIC_ATTACHMENT_URLS = [
  "https://github.com/giovannijecha/agent",
  "https://github.com/giovannijecha/agent/blob/main/docs/OAUTH-REGISTRATION.md",
  "https://github.com/giovannijecha/agent/blob/main/PRIVACY.md",
  "https://github.com/giovannijecha/agent/blob/main/SECURITY.md",
];
const OFFICIAL_ROUTE_URLS = Object.freeze({
  chatgpt: "https://community.openai.com/",
  claude: "https://support.claude.com/en/articles/9015913-how-to-get-support",
  kimi: "https://github.com/MoonshotAI/kimi-code/issues",
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
  "@agent/tui",
  "@agent/cli",
];

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
    !body.includes("https://github.com/giovannijecha/agent") ||
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
    ["schemaVersion", "applicationDocument", "researchedOn", "providers"],
    "provider policy",
  );
  if (policy.schemaVersion !== 2) {
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
      ["state", "kind", "route", "visibility"],
      "provider request at index " + String(index),
    );
    if (seen.has(provider.id)) {
      fail("duplicate provider id: " + String(provider.id));
    }
    seen.add(provider.id);
    if (JSON.stringify(provider) !== JSON.stringify(expected)) {
      fail("provider policy mismatch at index " + String(index));
    }
  }
}

function validateWorkspaces(workspaceNames) {
  const actual = [...workspaceNames].sort();
  const expected = [...EXPECTED_WORKSPACES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("blocked provider policy requires the exact foundation workspaces");
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
    for (const [pattern, label] of FORBIDDEN_SOURCE_MARKERS) {
      if (pattern.test(source.text)) {
        fail(source.path + " contains forbidden " + label);
      }
    }
    const compact = compactSource(source.text);
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
