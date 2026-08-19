# 0080: Owned provider HTTP outcome classification

- Status: accepted
- Date: 2026-08-19
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

The Ollama Cloud adapter already rejects every non-successful chat response
before creating a model stream. Its initial boundary collapsed every valid
non-200 HTTP status into one provider reason and therefore one
`model/open/rejected` presentation. That makes an invalid request, a selected
model or account rejection, a provider limit, and an unavailable upstream look
identical even though the provider publishes stable content-free status
semantics for those outcomes.

The authenticated model catalog remains availability authority, but appearance
in that inventory does not prove that the current account has every entitlement
or credit required to run an entry. Model-specific aliases, retries, request
fallbacks, response-body inspection, and hard-coded model exclusions would
either weaken that authority or create provider behavior outside the accepted
contract. The correction must diagnose the first failed boundary without
retaining a status value, provider message, credential, model identifier,
prompt, or response content.

## Decision

The Node-free Ollama Cloud adapter classifies the validated ephemeral HTTP
status before closing a non-successful response. Statuses whose meanings are
part of the admitted provider contract map into the existing adapter-neutral
failure families:

- client-request failures map to `request`, except for the closed cases below;
- authentication, payment, authorization, and model-not-found failures map to
  `rejected`;
- request-entity and rate limits map to `limit`;
- request timeout or gateway timeout maps to `timeout`;
- server failures map to `connectivity`; and
- every other non-success class maps to `protocol`.

The adapter retains only a closed provider reason for that family. The CLI
classifier continues to own presentation and the existing
`model/open/<family>` vocabulary. A `rejected` notice states only that account
or model access was rejected and directs the operator to verify plan, credit,
authorization, and model availability. It does not claim which condition
failed. Neither boundary returns or persists the numeric status. Unrecognized
values within each HTTP class retain that class's closed mapping; they do not infer a
new capability, retry, change the selected model, or inspect the body.

The request contract remains identical for every catalog-selected model. It
uses the exact selected identifier, native messages, the registered tool
inventory, `stream: true`, and disabled reasoning. A catalog entry is never
removed or rewritten because a later chat request fails. Model access, account
entitlement, quota, and provider availability remain provider-owned facts, not
locally guessed capabilities.

## Bounds, privacy, and failures

Classification is a total pure projection over one already validated integer
status. It allocates no response buffer and admits no additional network read.
The rejected response is closed exactly once and cleanup truth remains separate
from the primary reason. No status, response header, response body, model name,
account detail, secret, submitted text, or provider-specific diagnostic enters
the transcript, notice, journal, fixture values, or logs.

Transport failure before a response retains the existing transport family.
Invalid status shape retains the existing transport-protocol failure. A
successful response with an invalid media type remains `protocol`, and a
mid-stream provider error remains governed by the bounded stream decoder. No
implicit retry, replay, alias, fallback, or alternate origin is introduced.

## Verification

Provider regressions prove every admitted status-family mapping, unknown-status
closure, cleanup observation, immutable content-free errors, and absence of
private request content. CLI regressions prove each new provider reason maps to
the existing adapter-neutral family and malformed values remain unclassified.
Wire-contract tests continue to prove one identical model request with the
selected catalog identifier, tools, streaming, and disabled reasoning.

The canonical Windows and Linux verification gates remain mandatory. They use
only deterministic fake transports and never contact Ollama or consume a real
credential.

## Update, rollback, and removal

Changing an admitted status mapping, exposing a new presentation family,
reading an error body, or varying a request by model requires this decision,
the provider adapter, CLI classifier, provider and operator documentation,
privacy boundary, maintenance guidance, and regressions to change together.

Rollback removes the status projection and its reasons and restores one generic
non-success reason without altering stream cleanup. To remove Ollama Cloud,
follow decision 0072 and delete this projection with that adapter; the shared
CLI failure families remain independently owned by decision 0052.
