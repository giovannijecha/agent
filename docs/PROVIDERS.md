# Subscription provider eligibility

This reference tells maintainers whether a subscription provider may be added
to `agent`. It separates observed interoperability from permission to identify
this project as an OAuth client. Status is current as of 2026-08-08.

## Current status

Pi `main` at commit
[`e47b8e37a6211ebd0b2942fa87059d64f81eec02`](https://github.com/earendil-works/pi/commit/e47b8e37a6211ebd0b2942fa87059d64f81eec02)
reports package version `0.84.1` and contains direct subscription OAuth
implementations for all four requested providers. That proves technical
feasibility. It does not transfer Pi's or a vendor client's registration,
identity, approval, or entitlement to `agent`.

| Provider | Current evidence | `agent` eligibility | Blocking evidence |
|---|---|---|---|
| ChatGPT Plus/Pro | Pi performs browser and device OAuth directly. OpenAI now documents Codex App Server as the supported embedding surface, including managed ChatGPT login. [Pi source](https://github.com/earendil-works/pi/blob/e47b8e37a6211ebd0b2942fa87059d64f81eec02/packages/ai/src/auth/oauth/openai-codex.ts) | Blocked | App Server is a foreign executable and direct independent registration for `agent` is not documented. |
| Claude Pro/Max | Pi performs browser OAuth directly. Anthropic currently documents subscription use by Agent SDK, `claude -p`, and third-party apps through that channel, while warning independent tools not to misrepresent Claude Code identity. [Pi source](https://github.com/earendil-works/pi/blob/e47b8e37a6211ebd0b2942fa87059d64f81eec02/packages/ai/src/auth/oauth/anthropic.ts) | Blocked | Agent SDK and Claude CLI are foreign dependencies; `agent` has no direct independent-client authorization. |
| Kimi Code | Pi performs RFC 8628 device authorization directly. Kimi documents one-click OAuth for its CLI and API keys from the subscription console for third-party tools. [Pi source](https://github.com/earendil-works/pi/blob/e47b8e37a6211ebd0b2942fa87059d64f81eec02/packages/ai/src/auth/oauth/kimi-coding.ts) | Blocked for credential-only login | The user requested no API-key path, the official OAuth identity is not ours, and the official CLI/ACP bridge is foreign. |
| Grok subscription | Pi performs RFC 8628 device authorization while identifying its own client. xAI documents authenticated Grok Build headless and ACP integration. [Pi source](https://github.com/earendil-works/pi/blob/e47b8e37a6211ebd0b2942fa87059d64f81eec02/packages/ai/src/auth/oauth/xai.ts) | Blocked | Grok Build/ACP is a foreign executable and `agent` has no direct OAuth registration. |

The machine-readable status is `tools/provider-policy.json`. Canonical
verification rejects provider adapters, OAuth identifiers, subscription
endpoints, foreign credential stores, and borrowed product identity while every
entry remains blocked.

## Evidence required to enable a provider

Replace the blocking decision only after all of the following are recorded in a
new decision record:

1. The provider authorizes independent clients to use the relevant subscription.
2. The provider issues a registration to this project or explicitly designates
   a public client identity for independent use.
3. Authorization, token, refresh, revocation, entitlement, and model transport
   contracts are documented by the provider.
4. The adapter can identify itself as `agent`; no Pi or vendor-client identity,
   prompt, header, identifier, cookie, or credential file is required.
5. Offline contract tests can cover cancellation, expiry, concurrency, malformed
   responses, secret leakage, removal, and protocol drift.

Only then may the provider policy schema be replaced and the first concrete
auth or provider package be created. A generic package without an eligible
provider is speculative and remains forbidden.

Use `docs/OAUTH-REGISTRATION.md` as the project-authored application dossier.
It records the truthful public-client posture without inventing provider form
fields or storing confidential correspondence. Registration evidence updates
this eligibility record; it does not enter product source.

The project owner selected the direct-integration path on 2026-08-08. Vendor
SDKs, CLIs, app servers, ACP executables, and similar bridge runtimes do not
satisfy ownership even when the provider officially supports them. They may be
reconsidered only through a replacing ownership decision.

## Research rule

Public documentation can lag deployed behavior. When it does, inspect the
current public source at a pinned commit, then record only externally observable
facts and architectural risks in `docs/OWNERSHIP.md`. Never copy, translate, or
adapt source, tests, prompts, registered identifiers, protocol fixtures, user
agents, or product identity. Independently derive the owned contract before
writing implementation code.

## Account and secret boundary

`agent` links existing accounts; it never creates provider accounts, purchases
plans, or asks for passwords, one-time codes, recovery codes, cookies, or
payment details. Browser authorization remains provider-hosted. No credential
may enter source, tests, logs, errors, documentation, process arguments, or
terminal history.

Persistent refresh-token storage is a separate security decision. The first
eligible integration must use process memory until an OS-protected vault has an
accepted threat model, atomic update contract, and removal procedure.

## Primary provider references

- [OpenAI Codex authentication](https://developers.openai.com/codex/auth/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Kimi Code login](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html)
- [Kimi third-party agents](https://www.kimi.com/help/kimi-code/third-party-agents)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)
- [xAI Grok Build headless and ACP integration](https://docs.x.ai/build/cli/headless-scripting)
