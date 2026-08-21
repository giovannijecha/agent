# 0094: Owned OpenAI device authentication

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0090 specifies the complete OpenAI subscription OAuth direction,
decision 0091 permits provider-owned public-client compatibility without
provider endorsement, decision 0092 accepts OpenAI's exact non-secret public
client and device-flow identity, and decision 0093 implements the exact durable
record and exclusive native mutation. The remaining authentication gate is an
owned command that performs the ceremony, validates its result, and publishes
that record without activating an OpenAI catalog or model transport.

Current OpenAI authentication documentation confirms ChatGPT subscription
browser and device login, local credential caching, automatic refresh, and
logout. It does not publish every Codex-specific wire field. The already
recorded, commit-pinned first-party inspection in the ownership log was
therefore reopened only for the missing response-field, exchange-form, account-
claim, expiration-claim, and PKCE facts. No foreign implementation, test,
fixture, prompt, structure, error text, or product identity is an input to this
implementation.

The device response represents its polling interval as a decimal JSON string.
Decisions 0090 and 0092 use "integer" for the admitted semantic value: this
decision fixes the wire representation and requires decoding that string to the
same integer range. It does not change the 1-through-30-second bound.

A pre-merge operator smoke exposed one additional `expires_at` string in the
live user-code response. A bounded reproduction retained only the HTTP family,
content type, byte count, field names, and field types, then cleared the body;
no device identity, code, timestamp, or response value was retained. The
already authorized first-party decoder consumes the three required fields
without rejecting additional members. Agent does not adopt that open schema:
this decision admits only `expires_at` as one optional bounded member and gives
it no timing, display, persistence, or authorization role.

A later pre-merge operator smoke reached code presentation and provider-side
browser approval, then failed closed before credential publication. A temporary
content-safe diagnostic retained only the failing phase and established that
the bounded poll-success object contained the valid required projection plus at
least one additional member; it retained no member name, type, or value. The
authorization code and verifier are the two values required for the token
exchange; a returned challenge is validation metadata, not exchange authority.
Both the already authorized first-party decoder and the separately recorded
bounded Pi inspection project only their required poll-success fields without
rejecting additional members. Agent therefore admits poll success by bounded
projection: duplicate names still fail closed, required values and an optional
`code_challenge` are validated, and every other member is discarded without
timing, authorization, projection, or persistence effect.

## Decision

Activate an independently authored OpenAI device-authentication adapter owned
by `@agent/cli` and invoke it only from `agent auth`, outside the alternate-
screen TUI. The OpenAI machine state becomes `auth-compatible-inactive`; its
next blocker is `transport-implementation-required`. Operators can sign in,
sign in again, or remove Agent's local OpenAI record, but OpenAI is not an
enabled backend and does not appear in `/models`. Ollama Cloud remains the sole
provider with catalog and chat runtime authority.

Authentication never selects a provider or model. This module adds no OpenAI
catalog request, Responses request, provider workspace, runtime credential
snapshot, refresh request, revocation request, environment authority, browser
launch, loopback listener, redirect following, retry, fallback, discovery, or
foreign credential import.

### Command and admission

`agent auth` first presents one bounded provider selector. Selecting Ollama
Cloud enters its existing API-key lifecycle unchanged. Selecting OpenAI opens
one decision-0093 exclusive mutation before the first network request and holds
it through cancellation or atomic publication. Absence offers sign in or
cancel. Presence offers sign in again, remove locally, or cancel. A second
OpenAI credential user fails busy immediately without waiting, polling,
stealing, retrying, or reading secret bytes.

Before a request, Agent tells the operator that this is an independently
implemented compatibility flow, not an OpenAI endorsement. Agent identifies
itself truthfully as `agent`; no Codex, Pi, OpenCode, browser, or other harness
identity is emitted. The command does not open a browser. It displays only the
fixed `https://auth.openai.com/codex/device` verification URL and the current
one-time user code, with guidance to enter the code only at that origin.

During the ceremony, Ctrl+C, Escape, Ctrl+D, input end, or input failure cancels
the current request or delay, publishes nothing, settles the native mutation as
cancelled, restores terminal input, and releases admission. Other keystrokes are
ignored and never echoed. Cancellation remains effective through token
validation and terminal cleanup; a credential is not published after a late
cancellation or failed input cleanup.

### Exact device and exchange protocol

The adapter sends one UTF-8 `application/json` object containing exactly
`client_id` to
`POST https://auth.openai.com/api/accounts/deviceauth/usercode`. Success is
exactly HTTP 200 plus an admitted JSON content type and one bounded object with
exactly the required `device_auth_id`, `user_code`, and `interval` values and,
optionally, `expires_at`. When present, `expires_at` is 1 through 256 visible-
ASCII bytes and is validated only as bounded provider metadata, then discarded.
Every other additional member is ambiguous and fails closed.
`interval` is a canonical decimal string without a leading zero and decodes to
1 through 30 seconds. A user-code HTTP 404 is terminal unavailable, not a poll
continuation.

The first poll is immediate. Each later poll begins only after the complete
server interval following a pending result. A poll sends one UTF-8
`application/json` object containing exactly `device_auth_id` and `user_code`
to `POST https://auth.openai.com/api/accounts/deviceauth/token`. HTTP 403 and
404 are the only pending outcomes and their bodies are not read. HTTP 200 must
carry one bounded JSON object with required `authorization_code` and
`code_verifier` strings and, optionally, `code_challenge`. After the complete
bounded object passes duplicate-name validation, additional members are
ignored and never projected, persisted, or interpreted. A malformed required
value or malformed present challenge fails closed. Every other status is
terminal.

The verifier is 43 through 128 RFC 7636 unreserved ASCII characters. The
optional challenge is canonical unpadded base64url. When it is present, Agent
computes SHA-256 of the exact verifier, base64url-encodes it without padding,
and requires exact equality before exchange. When it is absent, Agent still
uses only the provider-returned verifier in the one token exchange; it never
generates, substitutes, or accepts a second verifier authority.

The adapter then sends exactly one UTF-8
`application/x-www-form-urlencoded` request to
`POST https://auth.openai.com/oauth/token` with fields `grant_type` equal to
`authorization_code`, `code`, `redirect_uri` equal to
`https://auth.openai.com/deviceauth/callback`, `client_id`, and
`code_verifier`. Public-client token authentication is `none`; there is no
client secret, scope, authorization header, cookie, originator, referrer, or
alternate caller identity.

Every request uses the fixed TLS origin, port 443, no pooled agent, a bounded
header section, one 30-second inactivity timeout, and no redirect handling.
The complete ceremony has one 900,000-millisecond monotonic deadline. Device
identity and authorization code are each at most 4,096 visible-ASCII bytes;
the displayed code and optional device-expiration metadata are each at most 256
visible-ASCII bytes. A response chunk is at most 65,536 bytes; the user-code
body is at most 8,192 bytes, the poll body at most 16,384 bytes, and the token
body at most 131,072 bytes. Limit, transport, timeout, status, content-type,
decode, and validation failures settle once and never replay a request.

### Token validation and publication

Token success is exactly HTTP 200 plus an admitted JSON content type and a
bounded object containing nonempty visible-ASCII `id_token`, `access_token`,
and `refresh_token` values. Each token is at most 32,768 bytes. Unknown JSON
members are ignored only after the complete bounded object is decoded; they are
never persisted or projected. Duplicate JSON member names at any depth,
including escape-equivalent names, are ambiguous and fail before any value is
admitted.

The ID token and access token must each be a canonical three-segment JWT with a
strict UTF-8 JSON payload. Agent derives the account identifier only from the
ID-token object at claim namespace `https://api.openai.com/auth` and member
`chatgpt_account_id`. The account identifier is 1 through 256 visible-ASCII
bytes. If the access token also supplies that namespaced member, it must be a
valid exact match; a missing access-token account claim is permitted. Any
malformed, empty, ambiguous, or conflicting account claim fails closed.

Agent derives `expires-at` only from the access token's numeric `exp` claim.
It must be a positive safe-integer Unix second later than current wall-clock
time. JWT claims are decoded only to bind the record returned by the exact TLS
token exchange; they do not grant local authorization and Agent does not claim
to verify a JWT signature. Remote OpenAI services remain the bearer-token
authority.

After complete validation and a final cancellation check, Agent submits one
complete decision-0093 credential value to the still-open native mutation as
register or replace. It persists access token, refresh token, account ID, and
expiration only. It never persists the ID token, device identity, displayed
code, provider `expires_at` metadata, authorization code, verifier, challenge,
response object, account claims, email, name, plan, browser cookie, or status.
Publication and terminal success retain the decision-0093 atomic, revision,
recovery, comparison, and cleanup contract.

### Failure, privacy, and removal

Operator-visible failures use only the closed content-free families busy,
cancellation, denial, expiry, connectivity, timeout, rejection, limit,
protocol, unsafe store, input, output, and cleanup. They never contain an HTTP
status, response body, endpoint, token, account, code, device identity,
verifier, challenge, path, byte count, or provider-supplied text. Ephemeral
response buffers are bounded and cleared after decoding; retained local values
exist only long enough to validate and publish or cancel.

The owned plaintext record retains decision 0093's threat model. It does not
protect against processes running as the same user, administrator or root,
malware, memory inspection, backup, snapshot, restore privilege, or privileged
offline access. No secret enters arguments, environment, shell history, logs,
errors, receipts, sessions, transcripts, source, documentation values, or test
fixtures.

Local removal uses the exact native retirement path and explicitly reports
that provider authorization was not revoked. The accepted revocation endpoint
remains inactive because this module has no separately verified revocation
payload or response contract. Agent does not imply remote revocation, secure
erasure, subscription entitlement, quota, availability, pricing, retention, or
provider endorsement.

## Consequences

Agent can now create, replace, and remove its own OpenAI OAuth record through a
real provider ceremony while OpenAI remains unavailable to the conversation
runtime. This deliberately leaves a useful intermediate state: credential and
authentication failures can be reviewed independently from catalog, refresh,
Responses streaming, and `/models` integration.

Holding exclusive admission for up to 15 minutes prevents concurrent refresh
or replacement ambiguity. The tradeoff is that another OpenAI credential user
fails busy for the whole ceremony. The next module must add the exact
authenticated catalog and Responses transport before any OpenAI runtime row is
admitted. Refresh remains a later serialized module and cannot silently start
from this auth-only state.

## Verification

Pure and Node-bound contract tests use synthetic non-credential sentinels and
fake HTTPS, clock, input, output, and broker boundaries. They bind exact request
origins, paths, methods, headers, bodies, field order, content types, response
bounds, interval parsing, first and later poll timing, pending statuses, single
exchange, the sole optional `expires_at` device member, the sole optional
interpreted matching poll challenge, bounded discarded additional poll
members, JWT syntax, duplicate response and nested claim authorities, account
binding, expiration, cancellation, deadline, inactivity, cleanup, and no
replay. They reject redirects, malformed or oversized values, unknown device
response members, duplicate poll members, wrong content types, every unexpected
status, expired tokens, account conflicts, late events, and double settlement.

Command tests bind provider selection before credential admission, unchanged
Ollama environment dual-authority behavior, absent and present OpenAI actions,
exclusive lock lifetime, compatibility disclosure, code projection only,
register, replace, local-only removal, cancellation, output failure, input
cleanup failure, and content-free results. No test connects to OpenAI, launches
a browser, uses a real client secret, account, token, code, model, or response.

Provider policy binds decision 0094, `auth-compatible-inactive`, the
`transport-implementation-required` blocker, current command capability,
inactive refresh, revocation, catalog, and Responses runtime, exact device and
token fields, bounds, claims, caller identity, removal semantics, reviewed
source paths, direct Node HTTPS and hash authority, sensitive-state inventory,
and complete CLI source digest. Documentation and publication policy bind the
current auth-only product boundary. The canonical Windows and Linux gates must
pass offline.

## Update, rollback, and removal

Changing the client identifier, origin, route, request or response fields,
optional device-expiration, poll-challenge interpretation, additional poll-
member admission, interval representation or range, pending statuses, first-
poll timing, PKCE, redirect, token
authentication, claim source, account binding, expiration, bounds, deadline,
cancellation, admission, record, caller identity, disclosure, failure family,
refresh posture, revocation posture, or local-removal semantics requires a
successor decision plus provider policy, ownership record, security, privacy,
architecture, maintenance, manual, source policy, and focused tests in the same
change.

Rollback first disables new OpenAI sign-in and sign-in-again while retaining
local removal and the decision-0093 broker. With every OpenAI credential user
closed, remove the committed record through native retirement and prove the
committed, pending, and retired names absent. Because this module never invokes
remote revocation, rollback must not claim that local removal revoked the grant;
the operator revokes through a provider-supported surface when required. Then
remove the device adapter, terminal cancellation monitor, OpenAI command row,
network and hash declarations, policy allowances, tests, and living
documentation together.

Only after all OpenAI records are absent may a later removal retire the OpenAI
broker schema and lock under decision 0093's order. Never recursively delete
`~/.agent/credentials` or `.agent`, touch the Ollama record, import or export a
foreign credential, copy a token into an environment variable, restore retired
material, fall back to an API key, or remove sessions or workspace state.
