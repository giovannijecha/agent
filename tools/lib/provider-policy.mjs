const EXPECTED_PROVIDERS = [
  {
    id: "chatgpt",
    displayName: "ChatGPT Plus/Pro",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
  },
  {
    id: "claude",
    displayName: "Claude Pro/Max",
    eligibility: "blocked",
    blocker: "independent-client-authorization-required",
  },
  {
    id: "kimi",
    displayName: "Kimi Code",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
  },
  {
    id: "grok",
    displayName: "Grok subscription",
    eligibility: "blocked",
    blocker: "owned-client-registration-required",
  },
];

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

function validateRegistry(policy) {
  assertExactKeys(policy, ["schemaVersion", "providers"], "provider policy");
  if (policy.schemaVersion !== 1) {
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
      ["id", "displayName", "eligibility", "blocker"],
      "provider at index " + String(index),
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
  if (!isRecord(context) || !Array.isArray(context.workspaceNames) || !Array.isArray(context.productSources)) {
    fail("provider policy validation context is invalid");
  }
  validateRegistry(policy);
  validateWorkspaces(context.workspaceNames);
  validateProductSources(context.productSources);
}
