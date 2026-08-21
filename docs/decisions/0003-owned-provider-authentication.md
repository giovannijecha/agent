# 0003 — Owned provider authentication boundary

- Status: accepted
- Date: 2026-08-07

## Context

The user wants ChatGPT Plus/Pro, Claude Pro/Max, Kimi Code, and Grok subscription
accounts without API keys. Current Pi source demonstrates direct OAuth flows for
all four even where its human documentation lags. The user explicitly permits
studying current Pi implementation source, while requiring every shipped module
to be independently authored.

OAuth code ownership and OAuth client identity are different. Rewriting a flow
does not make a client registration, vendor identity, entitlement, prompt, or
protocol identifier ours. Pi's integrations contain application-specific
identity that cannot be transferred to this project merely because it is public.

## Decision

Current public reference source may be inspected when documentation is stale.
Every inspection is commit-pinned in the provenance log. Research may influence
requirements, threat models, package boundaries, failure cases, and independent
tests. It may not supply implementation structure, code, fixtures, prompts,
registered identifiers, user agents, headers that assert foreign identity, or
credential locations.

All four subscription providers are blocked until this project has explicit
independent-client authorization and an owned or expressly reusable OAuth client
registration. While blocked:

- no auth or provider workspace is created;
- no subscription endpoint, client identifier, token field, or credential-file
  reader enters product source;
- no login command claims to work;
- the canonical verifier enforces the machine-readable provider policy;
- account creation, credentials, and payment stay on provider-owned surfaces.

The source gate decodes escaped literals and detects high-entropy endpoints,
credential identifiers, and foreign identity in their syntactic context. It
does not reject an unrelated identifier merely because compacted text contains
a short fragment such as `pi/` or `bearer`; low-entropy matches require an
identity, credential, or header context.

The first approved provider replaces this decision with a concrete protocol,
registration, threat model, storage policy, implementation boundary, test plan,
update procedure, and removal procedure. Authentication begins process-memory
only; persistent secrets require a separate accepted decision.

## Consequences

The project does not pretend that borrowed OAuth identity is owned code. It can
continue researching and designing against current behavior without introducing
foreign implementation or an unusable speculative layer. Subscription login is
not yet a shipped capability; the block is explicit, testable, and removable
when authoritative evidence changes.

This costs immediate connectivity. That cost is preferable to silently using
Pi's registration, impersonating an official client, exposing refresh tokens,
or depending on undocumented consumer endpoints.

## Migration, update, and rollback

At acceptance, `tools/provider-policy.json` version 1 was the source of truth
for the blocked matrix. Decision 0011 later introduced verified request-readiness
metadata in version 2 and now governs version 3 lifecycle and reference metadata;
eligibility did not change.
Enabling a provider still requires a replacing decision and verifier update in
the same change. Research updates change provider documentation, request
metadata, and the provenance log, not product code, unless eligibility changes.

Rollback removes the replacing provider adapter and composition, restores this
blocked registry, destroys any local credential through the documented storage
contract, and verifies that core, TUI, and CLI still build without provider code.
