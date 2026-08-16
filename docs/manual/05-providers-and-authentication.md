# 05 - Providers and authentication

## Purpose

Use this chapter to run the admitted OpenCode Go and OpenCode Zen adapters
safely, select one for the current session, and check why the four requested
subscription OAuth providers remain blocked.

## Operator workflow

Create OpenCode API keys only on the provider's official site. Start `agent` in
an interactive terminal. When either exact environment variable is absent, the
owned startup sequence asks independently for its Go or Zen key with terminal
echo disabled. Paste a key and press Enter, or press Enter on an empty prompt to
skip that backend. The prompts print neither keys nor mask characters, release
raw mode, and pass each value directly to its own provider composition in
process memory. Skipping both starts providerless; Ctrl+C cancels startup.

Inside an idle `agent`, run `/providers`. It opens one transparent selection
list containing only configured backends and their fixed models. Up and Down
move without wrapping; Enter selects the highlighted provider for subsequent
turns. Go is initially selected when both are configured. Selection never
changes an active turn and is not persisted. `/exit` closes the runtime.
Controlled automation may set either exact documented environment variable
before starting; the interactive prompts remain the preferred operator workflow.

## Guarantees and limits

Keys are accepted only from the owned hidden prompts or the exact
`AGENT_OPENCODE_GO_API_KEY` and `AGENT_OPENCODE_ZEN_API_KEY` variables. They are
never accepted as command-line arguments or written by `agent`. Go requests go
only to `https://opencode.ai/zen/go/v1/chat/completions` with
`kimi-k2.7-code`; Zen requests go only to
`https://opencode.ai/zen/v1/chat/completions` with
`deepseek-v4-flash-free`. There is no arbitrary endpoint, model alias, automatic
router, fallback provider, shared credential slot, SDK, OpenCode executable,
credential-file reader, redirect, cookie, or telemetry path.

When configured, each turn sends the lean system instruction, bounded
conversation context, the current owned tool schemas, user input, and
checkpointed tool calls and results required for the single-agent loop. The API
key is sent in the selected adapter's fixed request authorization header. The
OpenCode Go page currently states zero-day retention and no training for Kimi
K2.7 Code. OpenCode documents Zen models as hosted in the United States and the
temporary free DeepSeek model as eligible for data collection used to improve
the model. Do not submit secrets, personal data, or confidential content to that
free model. Provider terms can change and remain outside `agent`'s control.

Both OpenCode adapters request at most one tool call per model response. After a result is
checkpointed, the next bounded request includes that result and asks the same
model to reassess the unfinished parts of the user goal. The generic decoder
still accepts a complete bounded batch if the compatible service returns one,
but runtime handlers remain sequential and are never retried implicitly.

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code credential login, and Grok
subscription OAuth remain blocked. Kimi Code Team confirmed on 2026-08-11 that
it does not currently offer a public OAuth flow for third-party clients; the
other three submitted inquiries remain pending. Neither state authorizes
product code. `/providers` reports only integrations actually composed in the
current process.

## Failure behavior

A skipped prompt with no variable preserves providerless startup; ordinary text
is discarded after the generic no-model notice. A whitespace-containing,
control-containing, or oversized value stops startup with a fixed content-free
message.
DNS, TLS, connection, timeout, HTTP status, content type, UTF-8, SSE, JSON,
stream-shape, finish-reason, tool-call, and size failures terminate only the
active turn through bounded provider errors. Underlying causes, response bodies,
the key, prompts, and model content are never printed as diagnostics.

Cancellation closes the active stream. The transport allows one outstanding
read, pauses between pulls, bounds headers and byte chunks, and never retries a
request automatically. Canonical verification uses deterministic fake streams
and never consumes an account or performs a live request.

## Maintenance and removal

Recheck the corresponding official OpenCode page before changing an endpoint,
model, privacy statement, limit, or wire behavior. Update decision 0017 or 0067,
the provider registry, adapter tests, CLI transport tests, privacy/security
documents, and this chapter together. Never broaden an origin or place a second
backend behind either registered provider name.

To remove one integration, remove only its CLI composition, HTTPS transport,
credential input, provider workspace and dependency edges, policy admission,
source allowlists, governing decision references, and documentation. Preserve
the other provider and its `/providers` entry. Removing both restores the exact
providerless result. Keep the four blocked OAuth records unchanged and prove the
remaining graph offline.

## Evidence

- Eligibility and official references: `docs/PROVIDERS.md`
- Go provider decision: `docs/decisions/0017-owned-opencode-go-provider.md`
- Provider selection and Zen decision: `docs/decisions/0067-owned-opencode-provider-selection.md`
- Convergent tool-turn decision: `docs/decisions/0061-owned-convergent-tool-turns.md`
- Provider authentication boundary: `docs/decisions/0003-owned-provider-authentication.md`
- Registration-request decision: `docs/decisions/0011-verified-provider-registration-requests.md`
- Go provider adapter: `packages/agent-provider-opencode-go/src/index.ts`
- Zen provider adapter: `packages/agent-provider-opencode-zen/src/index.ts`
- Go HTTPS boundary: `packages/agent-cli/src/node-opencode-go-transport.ts`
- Zen HTTPS boundary: `packages/agent-cli/src/node-opencode-zen-transport.ts`
- Session selector: `packages/agent-cli/src/provider-session.ts`
- Provider selection presentation: `packages/agent-cli/src/providers-view.ts`
- Credential validation: `packages/agent-cli/src/provider-configuration.ts`
- Hidden credential input: `packages/agent-cli/src/hidden-credential-prompt.ts`
- Executable startup decision: `docs/decisions/0018-owned-executable-startup.md`
- Composition root: `packages/agent-cli/src/main.ts`
- Machine-readable gate: `tools/provider-policy.json`
- Gate implementation: `tools/lib/provider-policy.mjs`
- Gate regression tests: `tools/test/provider-policy.test.mjs`
- Registration dossier: `docs/OAUTH-REGISTRATION.md`
- Submitted subscription requests: `docs/PROVIDER-APPLICATIONS.md`
