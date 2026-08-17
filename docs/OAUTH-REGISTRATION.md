# OAuth client registration dossier

This document is the provider-neutral application dossier for requesting a
direct public-client registration for `agent`. It is not proof that any provider
has approved the project, and it contains no endpoint, scope, client identifier,
secret, or credential.

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
remain in process memory. Persistent refresh-token storage is blocked until an
owned operating-system vault contract is accepted and verified.

## Data flow

After explicit operator login and model selection, the local process may send
the current prompt, bounded conversation entries, and approved tool results
directly to the selected provider. Responses return directly to the local
process. No `agent` backend proxies or stores this traffic. The project performs
no analytics, advertising, or silent synchronization.

## Authorization requested from each provider

Before implementation, the provider must document all of the following:

1. Independent native clients may use the relevant paid subscription.
2. The registration is issued to `agent`, or a public identity is expressly
   reusable by independent clients.
3. Authorization, refresh, revocation, entitlement, model transport, timeout,
   and rate-limit contracts are stable enough to implement independently.
4. The client may identify itself truthfully as `agent`.
5. Provider terms permit open-source distribution of the independent client.

Current targets are ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code, and Grok
subscription. Each remains blocked until its own written evidence satisfies the
complete list. Kimi Code confirmed on 2026-08-11 that it does not currently
offer public OAuth for third-party clients; the other three requests remain
pending. Approval by one provider does not authorize another.

## Provider submission summary

> `agent` is a local, open-source native CLI maintained by Giovanni Jecha. It
> has no backend, telemetry, embedded browser, or credential collection form.
> It requests a direct public-client registration for voluntary use with the
> operator's existing subscription. Authentication stays provider-hosted;
> credentials are initially memory-only; requests travel directly between the
> local process and the provider. The project does not reuse another product's
> client identity or distribute a client secret.

The summary is project-authored application text. The four provider-specific,
ready-to-submit requests live in `docs/PROVIDER-APPLICATIONS.md`. Adapt only
factual provider labels and provider-required private form fields; do not add
unverified capabilities or commit personal account data.

## Evidence and implementation gate

Store provider correspondence outside the repository if it contains personal or
confidential material. Record only a dated, non-secret authorization conclusion
in `docs/PROVIDERS.md` and the [ownership record](OWNERSHIP.md). Then replace the
blocking decision and machine policy in the same change as the first adapter,
threat model, offline contract tests, revocation path, rollback, and removal
procedure.

No registration means no adapter, placeholder auth package, network capability,
or simulated login screen.
