# 05 - Providers and authentication

## Purpose

Use this chapter to run the admitted OpenCode Go adapter safely and to check why
the four requested subscription OAuth providers remain blocked.

## Operator workflow

Create an OpenCode Go subscription and API key only on the provider's official
site. Start `agent` in an interactive terminal. When the exact environment
variable is absent, the owned startup prompt asks for the key with terminal
echo disabled. Paste the key and press Enter. The prompt prints neither the key
nor mask characters, releases raw mode, and passes the value directly to the
provider composition in process memory. Press Enter on an empty prompt to start
without a provider or Ctrl+C to cancel startup.

Inside `agent`, run `/providers`. It must report OpenCode Go, the fixed
`kimi-k2.7-code` model, and memory-only API-key authentication. `/exit` closes
the runtime. Controlled automation may set the exact documented environment
variable before starting; the interactive prompt remains the preferred
operator workflow.

## Guarantees and limits

The key is accepted only from the owned hidden prompt or
`AGENT_OPENCODE_GO_API_KEY`, is never accepted as a command-line argument, and
is not written by `agent`. Requests go only to
`https://opencode.ai/zen/go/v1/chat/completions`. The model is fixed to
`kimi-k2.7-code`; there is no arbitrary endpoint, model alias, automatic router,
fallback provider, SDK, OpenCode executable, credential-file reader, redirect,
cookie, or telemetry path.

When configured, each turn sends the lean system instruction, bounded
conversation context, the current owned tool schemas, user input, and
checkpointed tool calls and results required for the single-agent loop. The API
key is sent in the fixed request authorization header. OpenCode Go's current
page states zero-day retention and no training for Kimi K2.7 Code, but provider
terms can change and remain outside `agent`'s control.

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code credential login, and Grok
subscription OAuth remain blocked. Their submitted registration inquiries do
not authorize product code. `/providers` reports only integrations actually
composed in the current process.

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

Recheck the official OpenCode Go page before changing the endpoint, model,
privacy statement, limits, or wire behavior. Update decision 0017, the provider
registry, adapter tests, CLI transport tests, privacy/security documents, and
this chapter together. Never broaden the origin or add a second provider behind
the OpenCode Go name.

To remove the integration, first remove CLI composition and restore the exact
providerless `/providers` result. Then remove the CLI HTTPS/configuration files,
provider workspace and dependency edges, environment declaration, provider
policy admission and exact source allowlists, decision 0017, and this setup
workflow. Keep the four blocked OAuth records unchanged and prove the remaining
core, tools, runtime, TUI, and CLI workspaces offline.

## Evidence

- Eligibility and official references: `docs/PROVIDERS.md`
- Provider decision: `docs/decisions/0017-owned-opencode-go-provider.md`
- Provider authentication boundary: `docs/decisions/0003-owned-provider-authentication.md`
- Registration-request decision: `docs/decisions/0011-verified-provider-registration-requests.md`
- Provider adapter: `packages/agent-provider-opencode-go/src/index.ts`
- Exact HTTPS boundary: `packages/agent-cli/src/node-opencode-go-transport.ts`
- Credential validation: `packages/agent-cli/src/provider-configuration.ts`
- Hidden credential input: `packages/agent-cli/src/hidden-credential-prompt.ts`
- Executable startup decision: `docs/decisions/0018-owned-executable-startup.md`
- Composition root: `packages/agent-cli/src/main.ts`
- Machine-readable gate: `tools/provider-policy.json`
- Gate implementation: `tools/lib/provider-policy.mjs`
- Gate regression tests: `tools/test/provider-policy.test.mjs`
- Registration dossier: `docs/OAUTH-REGISTRATION.md`
- Submitted subscription requests: `docs/PROVIDER-APPLICATIONS.md`
