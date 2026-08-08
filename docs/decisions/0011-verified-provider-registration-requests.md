# 0011: Verified provider registration requests

- Status: accepted
- Date: 2026-08-08

## Context

The project needs to ask ChatGPT, Claude, Kimi Code, and Grok for direct
independent-client authorization. A generic OAuth dossier already describes the
application, but it does not identify a current official submission route or
provide provider-specific text. Treating an inquiry as an approved registration
would weaken the fail-closed provider boundary; storing unverified form fields,
personal account data, or confidential replies in the public repository would
create a separate privacy risk.

None of the four providers currently publishes a self-service form specifically
for registering an independent native subscription client. Each provider does,
however, document an official support or developer-feedback route. Those routes
can receive a request for authorization without implying that authorization has
already been granted.

## Decision

`docs/PROVIDER-APPLICATIONS.md` is the single source of truth for four
project-authored registration requests. Every provider section records the
blocked eligibility, a `ready-not-submitted` state, the official route and its
visibility, copyable request text, public evidence, required written answers,
and information that must not be submitted.

The requests ask for an `agent`-owned public-client registration or an explicit
provider statement that an independent public identity is reusable. They do not
request or record a password, session, token, cookie, recovery code, payment
detail, client identifier, client secret, private account identifier, or
undocumented protocol value. Public channels receive public project facts only.
Private correspondence stays outside the repository.

Provider policy schema version 2 records request readiness and routing metadata
without changing eligibility. All four providers remain blocked. The provider
validator checks the exact provider set, section contract, request state,
research date, route visibility, and absence of personal email addresses. A
prepared or submitted request never enables product code; only authoritative
written approval satisfying decision 0003 can do that.

## Consequences

The maintainer can submit consistent, truthful requests without reconstructing
the project posture each time. Public and private channels are distinguishable,
and provider replies can be evaluated against the same explicit checklist.
The extra verification is intentionally narrow: it checks completeness and
status, not the truth of a future provider response.

The requests may receive no answer or a refusal. That leaves the product fully
providerless and does not justify a placeholder adapter, borrowed identity, or
vendor bridge.

## Update, rollback, and removal

After submission, update only that provider's request state and record a public
issue URL or a content-free private reference. Never commit private
correspondence. After an answer, update the dated evidence and eligibility only
if the complete authorization gate is satisfied; otherwise record the refusal
or unresolved blocker.

Recheck every official source before resubmitting a stale request. If a route
changes, update the request document, policy, tests, manual, and provenance in
one change. To remove this workflow, remove the request document and its links,
restore provider policy schema version 1 and its validator tests, remove this
decision from the registries, and verify that the blocked provider foundation
is unchanged.
