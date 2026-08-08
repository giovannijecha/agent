# 05 - Providers and authentication

## Purpose

Use this chapter to check whether a subscription provider can be connected
without borrowing code, credentials, client identity, or a foreign runtime.

## Operator workflow

Run `/providers` for the product status, then read
[the dated provider eligibility record](../PROVIDERS.md). A provider may be
enabled only after its official contract authorizes an independently written
client, gives `agent` its own registration or an expressly reusable public
identity, and documents transport plus credential lifecycle. Browser login must
stay provider-hosted; `agent` never asks for a password, cookie, recovery code,
payment detail, or provider one-time code.

When requesting a registration, use
[the OAuth client registration dossier](../OAUTH-REGISTRATION.md) together with
[the four verified request packets](../PROVIDER-APPLICATIONS.md). Recheck the
official route, copy only the relevant request, and keep account fields inside
the provider-owned submission surface. Public routes receive public project
facts only. Do not add a provider-specific field unless the official process
requires it and the value is factually known.

## Guarantees and limits

ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code, and Grok subscription are currently
blocked in production. Current public implementations prove the services are
technically reachable, but their direct OAuth identities are not ours. Official
embedding paths that require a vendor SDK or executable are also outside this
project's zero-third-party-source and zero-foreign-binary contract. No generic
authentication package, endpoint, token field, or credential store exists.
All four requests are `ready-not-submitted`; that state is preparation, not
authorization.

## Failure behavior

Ordinary text entered without a runtime is discarded after a generic no-model
notice. The ownership verifier rejects provider workspaces, OAuth identifiers,
subscription endpoints, ambient network capability, and foreign credential
paths while the registry is blocked. Research evidence can update documentation
without silently enabling product code.

## Maintenance and removal

Recheck official documentation and current public source at a pinned commit.
Record only observable facts in provenance. Enabling the first provider requires
a replacing decision, a provider-policy schema change, offline contract tests,
an in-memory credential boundary, and explicit update, revocation, rollback, and
removal procedures. Never reuse a vendor or reference project's client ID.
After submission, record only a public issue URL or a content-free private case
reference. Keep private messages and replies outside Git.

## Evidence

- Eligibility and primary references: `docs/PROVIDERS.md`
- Provenance log: `docs/OWNERSHIP.md`
- Machine-readable gate: `tools/provider-policy.json`
- Gate implementation: `tools/lib/provider-policy.mjs`
- Authentication decision: `docs/decisions/0003-owned-provider-authentication.md`
- Registration dossier: `docs/OAUTH-REGISTRATION.md`
- Provider request packets: `docs/PROVIDER-APPLICATIONS.md`
- Request verification decision: `docs/decisions/0011-verified-provider-registration-requests.md`
- Provider gate tests: `tools/test/provider-policy.test.mjs`
