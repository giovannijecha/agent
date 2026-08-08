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

| Provider | Current official route | `agent` eligibility | Blocking evidence |
|---|---|---|---|
| ChatGPT Plus/Pro | OpenAI documents ChatGPT subscription login for its Codex clients and managed browser or device login through Codex App Server. | Blocked | App Server is a foreign executable; no public process registers `agent` as a direct independent client. |
| Claude Pro/Max | Anthropic documents subscription login for Claude Code and currently permits subscription-backed third-party use through the Claude Agent SDK. | Blocked | Claude Code and Agent SDK are foreign runtimes; no direct independent-client authorization or registration is documented for `agent`. |
| Kimi Code | Kimi documents device OAuth for Kimi Code CLI and subscription-backed API keys for third-party development tools. | Blocked for credential-only login | The documented third-party path requires a manually managed key; the CLI OAuth identity and ACP bridge are foreign. |
| Grok subscription | xAI documents browser and device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | Blocked | Grok Build and ACP are foreign executables; no public process registers `agent` for direct subscription OAuth. |

The machine-readable status is `tools/provider-policy.json`. Schema version 2
also records the four official inquiry routes and their `ready-not-submitted`
state. That metadata does not change eligibility. Canonical verification checks
the complete request packets and rejects provider adapters, OAuth identifiers,
subscription endpoints, foreign credential stores, and borrowed product
identity while every entry remains blocked.

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

Use `docs/OAUTH-REGISTRATION.md` as the provider-neutral dossier and
`docs/PROVIDER-APPLICATIONS.md` as the four provider-specific submission
packets. The latter records only official routes, public project facts, and
project-authored request text. Personal fields and confidential correspondence
stay outside Git. A submitted request updates request state only; written
authorization evidence updates this eligibility record and never enters product
source.

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
- [OpenAI developer community](https://developers.openai.com/community)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Anthropic support route](https://support.claude.com/en/articles/9015913-how-to-get-support)
- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [Kimi Code login](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html)
- [Kimi Code feedback routes](https://www.kimi.com/code/docs/en/kimi-code/contact-and-feedback.html)
- [xAI Grok Build overview](https://docs.x.ai/build/overview)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)
- [xAI Grok Build headless and ACP integration](https://docs.x.ai/build/cli/headless-scripting)
- [xAI product support](https://x.ai/contact)
