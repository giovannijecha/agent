# OAuth client registration dossier

This document owns current subscription OAuth registration conclusions, the
provider-neutral application dossier, and the evidence required before an
adapter can enter admission review. It is not proof that any provider has
approved the project, and it contains no endpoint, scope, client identifier,
secret, or credential.

## Current registration status

- Status reviewed through: `2026-08-21`
- Registration state: `blocked`.
- Compatibility state: `accepted-runtime-inactive`.
- Identity state: `accepted-runtime-inactive`.
- OpenAI credential state: `credential-compatible-inactive`.
- Accepted direct subscription OAuth registrations: `none`

No requested subscription provider has registered or authorized `agent` as a
direct independent OAuth public client. Decision 0091 separately permits a
provider-owned non-secret public-client compatibility route for ChatGPT, Kimi,
and xAI. That policy changes no runtime and does not describe provider approval.

| Provider | Recorded public route | Registration conclusion |
| --- | --- | --- |
| ChatGPT Plus/Pro | OpenAI documents subscription browser and device login for Codex clients; decisions 0090 through 0093 fix the independently derived protocol, exact provider-owned public-client identity, and owned record. | The protocol is `credential-compatible-inactive`: identity and storage mechanics are accepted, but auth, transport, and integration remain inactive. |
| Claude Pro/Max | Anthropic documents subscription login for Claude Code and subscription-backed third-party use through the Claude Agent SDK. | Claude Code and Agent SDK are foreign runtimes; no accepted direct independent-client registration is recorded for `agent`. |
| Kimi Code | Kimi documents device OAuth for Kimi Code; a pre-recorded clean-room inspection confirmed that current subscription OAuth uses Kimi's first-party public client even though Pi's provider guide omits that route. | Compatibility feasibility is established, but the [recorded provider response](PROVIDER-APPLICATIONS.md#kimi-code) remains a material negative-eligibility risk and a provider-specific decision is still required. |
| Grok subscription | xAI documents browser and RFC 8628 device login for Grok Build plus headless and ACP integration, while its direct API has a separate key path. | A clean-room inspection confirms direct-flow feasibility, but xAI public-client ownership remains unresolved and a provider-specific decision is required. |

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

The preferred flow is provider-documented device authorization. Decision 0090
selects that flow for OpenAI and leaves browser authorization and a loopback
callback outside its first activation. Other providers may require a separately
accepted authorization-code flow with PKCE. `agent` is a public client: it
cannot safely hold an embedded client secret. Decision 0091 permits an exact
provider-owned non-secret public-client registration after first-party
confirmation; it never permits a third-party-only registration, foreign caller
identity, user agent, prompt, runtime, or credential store.
Decision 0092 accepts the exact OpenAI provider-owned client, a one-field device
request, an empty requested-scope set, the provider callback, the closed poll
statuses, and `agent`-or-omitted caller fields without enabling runtime.
Decision 0093 implements the provider-specific record, private native protocol,
exclusive admission, recovery, replacement, and removal without adding login
or network authority.

The browser remains provider-hosted. `agent` will not request a password,
cookie, recovery code, payment detail, or one-time code. Decision 0089's active
owned store serves the current Ollama Cloud API-key path. Decision 0093 extends
that broker with the exact inactive OpenAI record, but no command invokes it.
Decisions 0090 through 0093 now supply the OpenAI protocol, compatibility
authority, public-client constant, and storage implementation; the auth and
network gates remain closed.

## Data flow

After explicit operator login and model selection, the local process may send
the current prompt, bounded conversation entries, and approved tool results
directly to the selected provider. Responses return directly to the local
process. No `agent` backend proxies or stores this traffic. The project performs
no analytics, advertising, or silent synchronization.

## Registration requirements

Before a direct-registration conclusion can change, the provider must document
all of the following:

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

Decision 0091 defines a separate compatibility gate for ChatGPT, Kimi, and xAI.
It requires a provider-owned non-secret public client confirmed from
first-party material, provider-documented hosted login, complete pinned wire
authority, a truthful `agent` caller identity, explicit independent-
compatibility disclosure, and a provider-specific implementation decision.
Compatibility does not convert a request, silence, refusal, or successful login
into provider approval. Claude is outside that gate.

## Provider submission summary

> `agent` is a local, open-source native CLI maintained by Giovanni Jecha. It
> has no backend, telemetry, embedded browser, or subscription credential form.
> It requests a direct public-client registration for voluntary use with the
> operator's existing subscription. Authentication stays provider-hosted;
> OAuth material would use a closed provider-specific local record; requests
> travel directly between the local process and the provider. The project does
> not use a third-party-only client identity, present a provider-owned
> compatibility registration as `agent`-owned, or distribute a client secret.

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
registration or compatibility evidence does not enable product code by itself.
For ChatGPT, implement decision 0090 under decisions 0091 through 0093's identity
and disclosure boundary. For Kimi or xAI, accept a separate provider-specific
compatibility decision; for Claude, satisfy the direct-registration gate. In
every case, the same activation series must supply the machine gate, first
adapter, corresponding decision-0089 credential-store extension, threat model,
revocation path, rollback, and removal procedure. Offline contract tests must
cover cancellation, expiry, concurrency, malformed responses, secret leakage,
rollback, and removal.

No accepted provider-specific implementation means no adapter, placeholder auth
package, network capability, or simulated login screen.

## Primary registration references

- [OpenAI Codex authentication](https://developers.openai.com/codex/auth/)
- [OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)
- [OpenAI authorization-server metadata](https://auth.openai.com/.well-known/openid-configuration)
- [OpenAI subscription OAuth contract decision](decisions/0090-owned-openai-subscription-oauth-contract.md)
- [Provider public-client compatibility decision](decisions/0091-owned-provider-public-client-compatibility.md)
- [OpenAI compatible public-client decision](decisions/0092-owned-openai-compatible-public-client.md)
- [OpenAI OAuth credential-record decision](decisions/0093-owned-openai-oauth-credential-record.md)
- [Anthropic authentication](https://code.claude.com/docs/en/authentication)
- [Anthropic subscription use in third-party Agent SDK apps](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
- [Kimi Code overview and third-party authentication](https://www.kimi.com/code/docs/en/)
- [xAI Grok Build overview](https://docs.x.ai/build/overview)
- [xAI Grok Build authentication](https://docs.x.ai/build/enterprise)

## Maintenance and removal

Recheck the primary references before changing a registration or compatibility
conclusion. Keep this status, the request ledger's historical lifecycle
metadata, decisions 0091 through 0093, each provider-specific decision, and the provider
policy's admission result synchronized without copying one document's owned
fields into another. A reply that does not satisfy every direct-registration
requirement leaves that route blocked; compatibility remains separately
inactive until its exact implementation gate is complete.

Remove this dossier only after subscription OAuth registration is deliberately
abandoned or every remaining provider has its own accepted admission decision.
Update the public and operator routes, documentation and publication policies,
tests, and migration ledger in the same change. Preserve stable decisions and
ownership history.
