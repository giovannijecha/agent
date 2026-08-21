# 0092: Owned OpenAI compatible public client

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0090 specifies the complete inactive OpenAI subscription OAuth,
credential, catalog, and Responses boundary. Decision 0091 permits a
provider-owned non-secret public client when the provider owns the registration,
`agent` remains every independently controllable caller identity, and the
operator receives an explicit compatibility warning. Neither record admits the
exact OpenAI client constant or completes the first implementation gate.

Current official OpenAI authentication documentation confirms ChatGPT
subscription sign-in, device-code login, local credential caching, automatic
refresh, and logout. The public authorization-server metadata confirms a public
client without a secret, S256 PKCE, refresh-token grants, the base OIDC scopes,
and no dynamic registration endpoint. Those public documents do not publish the
Codex device client's identifier, request fields, callback, pending statuses, or
caller-header behavior.

The ownership log recorded that exact gap, a current OpenAI Codex commit, the
bounded first-party modules, and the allowed facts before source access. The
completed inspection establishes an OpenAI-owned default public client, the
device request and callback, the two pending poll statuses, and a raw auth
transport that does not require Codex's originator or user agent. No foreign
implementation, test, fixture, prompt, credential schema, error text, user
agent, or product identity supplies this decision.

## Decision

Accept the exact OpenAI provider-owned non-secret public-client identifier
`app_EMoamEEZ73f0CkXaXp7hrann` for the future `openaiSubscription` device
ceremony. This value identifies OpenAI's compatibility registration, not
`agent`, Giovanni Jecha, Pi, OpenCode, or another independent client. It is
public protocol data and never a secret, credential, entitlement, approval, or
claim of OpenAI endorsement.

The machine subscription contract moves from
`specified-compatible-inactive` to `identity-compatible-inactive`. The blocked
ChatGPT row moves from `compatibility-implementation-required` to
`credential-implementation-required`. These states mean only that the identity
gate is complete. Ollama Cloud remains the sole enabled provider.

No product source, credential record, network request, provider row, model row,
login action, refresh path, catalog, transport, or TUI behavior is added by this
module. The product source scanner continues to reject the client identifier,
every OpenAI OAuth field, and every OpenAI subscription origin until the exact
later implementation module changes its closed inventory.

### Public-client identity

The future device authorization request contains only `client_id` with the
accepted constant. It contains no client secret, scope, originator, referrer,
client-version, product name, provider credential, account value, or workspace
value. The device route therefore requests no scopes; its exact
`requestedScopes` contract is the empty ordered set. Published metadata scopes
describe issuer capability and do not become an additional device request or
local entitlement authority.

Every field controlled by this project follows one rule: caller identity is
`agent` or the field is omitted. Auth requests omit `originator`, `referrer`,
and foreign client-version fields. A user-agent, when the later transport adds
one, identifies `agent` and its truthful version. Agent never sends
`codex_cli_rs`, `codex`, `pi`, `opencode`, or another product identity to obtain
subscription access.

The operator-facing ceremony must state that Agent is independent, uses an
OpenAI-owned compatibility registration, is not endorsed by OpenAI, and may
stop working if OpenAI changes or revokes the registration. A provider-hosted
page may show OpenAI's registered client name; Agent does not rewrite or hide
that provider presentation.

### Device status and exchange contract

The first ceremony remains the decision-0090 device flow. The future user-code
request uses the exact fixed device endpoint and one bounded JSON object with
the accepted client identifier. The future poll sends only the bounded device
authorization identity and displayed user code received for that ceremony.

HTTP 403 and 404 are the only pending poll outcomes. A successful HTTP outcome
must contain the complete bounded authorization-code, verifier, and matching
S256 challenge object. Every other HTTP outcome, transport failure, timeout,
decode failure, malformed value, or account ambiguity settles the ceremony
without retry or fallback. The user-code request treats a 404 response as a
terminal unavailable result; pending semantics apply only to the poll route.

The code exchange uses exactly
`https://auth.openai.com/deviceauth/callback`, public-client token endpoint
authentication method `none`, and PKCE method `S256`. The device request sends
no scope field. The OpenAI subscription token and revocation routes remain the
ones fixed by decision 0090 and its pinned first-party Codex authority; this
identity module does not replace them with the authorization-server metadata's
general account routes.

Polling remains one serial protocol continuation, never an HTTP retry. It uses
the server-provided bounded interval, one outstanding request, and the single
15-minute wall-clock deadline from decision 0090. It never follows redirects,
replays a failed request, changes the client identifier, tries browser login,
or falls back to an API key or foreign runtime.

### Security, privacy, and disclosure

Publishing the client identifier does not disclose a secret because a native
public client cannot authenticate itself with that value. It does increase
compatibility and account risk: OpenAI can change, reject, rate-limit, or revoke
the registration; the provider may display a different product name; and a
successful token exchange does not prove plan eligibility, quota, pricing,
retention, availability, or future access.

No real account, device code, authorization code, PKCE value, access token,
refresh token, ID token, account identifier, response body, cookie, browser
session, foreign credential file, or live provider request enters this module.
The exact client identifier is the only newly admitted OpenAI protocol value,
and it remains confined to decision, policy, provenance, and offline test
authority.

### Delivery gate

OpenAI activation remains serial and reviewable:

1. this module accepts the public-client identity and exact device status
   semantics without runtime behavior;
2. a separate module extends the owned native credential broker with the exact
   OpenAI record, exclusive admission, recovery, replacement, and removal
   lifecycle;
3. a separate module extends `agent auth` with the device ceremony and proves
   zero projection;
4. a separate module adds the authenticated catalog and Responses adapter; and
5. a separate integration module adds the `/models` provider row, current
   living behavior, Windows and Linux verification, and an operator-controlled
   live smoke.

The credential module may admit the constant only where its provider-specific
contract requires it. It may not create a login action, send a request, add a
provider workspace, or weaken the source scanner. Kimi and xAI remain outside
this sequence until their own decision gates are complete.

## Consequences

OpenAI identity is no longer an unresolved implementation prerequisite. The
next module can focus on the provider-specific durable record and exclusive
refresh authority without choosing or borrowing an identity. The contract
remains honest that OpenAI owns the registration and Agent owns only its
independent implementation and caller identity.

The repository now contains a public client constant before it contains an
OpenAI transport. This is deliberate: policy and tests must reject any attempt
to turn that constant into runtime authority without the remaining staged
decisions, removal paths, and platform evidence.

## Verification

Provider-policy tests bind the exact client identifier, provider-owned public
type, identity decision, inactive state, next blocker, one-field device request,
empty requested-scope set, callback, pending statuses, successful and terminal
settlement classes, public-client token authentication, S256 PKCE, truthful
caller identity, disclosure, and pinned first-party evidence. They reject an
enabled state, foreign identifier, foreign caller, extra device field, inferred
scope, callback drift, broadened pending class, client secret, or weaker PKCE.

Documentation and publication tests bind this decision, its current-authority
route, the completed pre-inspection provenance sequence, the unchanged active
runtime, the identity-inactive living state, decision metadata, complete
decision digest, and provenance digest. Stable decisions 0090 and 0091 remain
unchanged.

The product source gate continues to reject every OpenAI identifier, OAuth
field, subscription endpoint, credential record, provider workspace, foreign
credential path, and foreign caller identity. Canonical Windows and Linux
verification remains offline and uses no provider account or credential.

## Update, rollback, and removal

Changing the client identifier, client ownership, request fields, scope rule,
callback, pending status, success shape, token authentication, PKCE method,
caller identity, disclosure, evidence, next blocker, or delivery order requires
a successor decision, current official research, a new pre-inspection gap when
source is necessary, provider policy, provenance, privacy, security,
maintenance, documentation, and focused tests to change together.

Before runtime activation, rollback requires a successor decision that marks
this record superseded, restores `specified-compatible-inactive` and
`compatibility-implementation-required`, removes the client and device identity
fields from current machine and living authority, and leaves Ollama source and
operator data untouched. It retains this decision and the completed provenance
row as immutable design and clean-room audit history.

After any later OpenAI module exists, rollback follows that module's stricter
disable, admission, credential retirement, recovery, revocation, and removal
order before removing current identity authority. It never copies a token,
imports or exports a foreign credential, restores a foreign caller identity,
falls back to an API key, or removes Ollama credentials or sessions.
