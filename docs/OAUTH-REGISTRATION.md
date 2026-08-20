# OAuth client registration dossier

This document owns current subscription OAuth registration conclusions, the
provider-neutral application dossier, and the evidence required before an
adapter can enter admission review. It is not proof that any provider has
approved the project, and it contains no endpoint, scope, client identifier,
secret, or credential.

## Current registration status

- Status reviewed through: `2026-08-20`
- Registration state: `blocked`.
- Accepted direct subscription OAuth registrations: `none`

No requested subscription provider has registered or authorized `agent` as a
direct independent OAuth public client.

| Provider | Recorded public route | Registration conclusion |
| --- | --- | --- |
| ChatGPT Plus/Pro | OpenAI documents subscription browser and device login for its Codex clients. | Those flows identify OpenAI's clients; no accepted process registers `agent` as a direct independent client. |
| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Claude Code and Agent SDK are foreign runtimes; no accepted direct independent-client registration is recorded for `agent`. |
| Kimi Code | Kimi documents device OAuth for Kimi Code CLI and subscription-backed API keys for third-party development tools. | Public OAuth for third-party clients is unavailable according to the [recorded provider response](PROVIDER-APPLICATIONS.md#kimi-code); credential-only login does not satisfy this registration gate. |
| Grok subscription | xAI documents browser and device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | Grok Build and ACP are foreign executables; no accepted process registers `agent` for direct subscription OAuth. |

The [provider request ledger](PROVIDER-APPLICATIONS.md) owns submission and
response lifecycle metadata. The [provider policy](PROVIDERS.md) owns runtime
admission and remains fail-closed regardless of request activity.

## Public application identity

- Application name: `agent`
- Maintainer: Giovanni Jecha
- Canonical repository: [github.com/giovannijecha/agent](https://github.com/giovannijecha/agent)
- Description: An owned, zero-dependency personal coding agent.
- Application type: local native command-line public client
- License: Apache-2.0
- Release line: `0.x` until one complete direct provider is eligible
- Service backend: none
- Telemetry: none
- Account creation: not performed by `agent`

The repository is public. Publication makes the application identity
inspectable; it does not grant subscription access or register an OAuth client.

## Requested authorization model

The preferred flow is provider-documented device authorization. A
provider-documented authorization-code flow with PKCE and a loopback redirect is
the fallback. `agent` is a public client: it cannot safely hold an embedded
client secret, and it will never borrow another application's registration,
identity, user agent, prompt, or credential store.

The browser remains provider-hosted. `agent` will not request a password,
cookie, recovery code, payment detail, or one-time code. Initial credentials
remain in process memory. Decision 0089 changes no current registration or
OAuth admission result. Its future owned store can admit OAuth material only
after a separate provider decision supplies the exact public-client identity,
record, refresh, revocation, recovery, and removal contract.

## Data flow

After explicit operator login and model selection, the local process may send
the current prompt, bounded conversation entries, and approved tool results
directly to the selected provider. Responses return directly to the local
process. No `agent` backend proxies or stores this traffic. The project performs
no analytics, advertising, or silent synchronization.

## Registration requirements

Before a registration conclusion can change, the provider must document all of
the following:

1. Independent native clients may use the relevant paid subscription.
2. The registration is issued to `agent`, or a public identity is expressly
   reusable by independent clients.
3. Authorization, refresh, revocation, entitlement, model transport, timeout,
   and rate-limit contracts are stable enough to implement independently.
4. The client may identify itself truthfully as `agent`.
5. Provider terms permit open-source distribution of the independent client.

Each provider remains registration-blocked until its own written evidence
satisfies the complete list. Approval by one provider does not authorize
another.

## Provider submission summary

> `agent` is a local, open-source native CLI maintained by Giovanni Jecha. It
> has no backend, telemetry, embedded browser, or credential collection form.
> It requests a direct public-client registration for voluntary use with the
> operator's existing subscription. Authentication stays provider-hosted;
> credentials are initially memory-only; requests travel directly between the
> local process and the provider. The project does not reuse another product's
> client identity or distribute a client secret.

The summary is project-authored application text. The four provider-specific
requests and their current lifecycle state live in the
[provider request ledger](PROVIDER-APPLICATIONS.md). Adapt only factual provider
labels and provider-required private form fields; do not add unverified
capabilities or commit personal account data.

## Evidence and implementation gate

Store provider correspondence outside the repository if it contains personal or
confidential material. Record only a dated, non-secret registration conclusion
here, request lifecycle metadata in the
[provider request ledger](PROVIDER-APPLICATIONS.md), and an external-source
inspection in the [ownership record](OWNERSHIP.md) when required. Complete
registration evidence does not enable product code by itself. Replace the
blocking decision and [provider policy](PROVIDERS.md) in the same change as the
machine gate, first adapter, an accepted provider-specific successor decision,
the corresponding decision-0089 credential-store extension, threat model,
revocation path, rollback, and removal procedure. Offline contract tests must
cover cancellation, expiry, concurrency, malformed responses, secret leakage,
rollback, and removal.

No registration means no adapter, placeholder auth package, network capability,
or simulated login screen.

## Primary registration references

- [OpenAI Codex authentication](https://developers.openai.com/codex/auth/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [xAI Grok Build overview](https://docs.x.ai/build/overview)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)

## Maintenance and removal

Recheck the primary references before changing a registration conclusion. Keep
this status, the request ledger's lifecycle metadata, and the provider policy's
admission result synchronized without copying one document's owned fields into
another. A reply that does not satisfy every registration requirement leaves
the provider blocked.

Remove this dossier only after subscription OAuth registration is deliberately
abandoned or every remaining provider has its own accepted admission decision.
Update the public and operator routes, documentation and publication policies,
tests, and migration ledger in the same change. Preserve stable decisions and
ownership history.
