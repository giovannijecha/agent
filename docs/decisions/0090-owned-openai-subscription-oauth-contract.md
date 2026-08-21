# 0090: Owned OpenAI subscription OAuth contract

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0003 blocks subscription providers whose only demonstrated path uses
another application's OAuth registration. Decision 0011 records the unanswered
request for an `agent`-owned OpenAI public-client registration. Decision 0089
activates an owned durable credential boundary only for Ollama Cloud and
requires every later OAuth provider to add its own exact record, admission,
protocol, policy, tests, rollback, and removal route.

OpenAI now publishes two authoritative facts that were not previously captured
as one verifiable provider contract. Its Codex authentication and App Server
documentation expose ChatGPT subscription sign-in through browser and device
ceremonies, and its public authorization-server metadata exposes authorization
code, refresh-token, public-client, and PKCE capabilities. Current first-party
Codex source at the pinned commit in the ownership log supplies the missing
Codex-specific device, token, catalog, and Responses route details needed to
specify an independent implementation. The metadata publishes no dynamic
client-registration endpoint.

Pi and OpenCode source were viewed at the maintainer's request before this
repository recorded a concrete stale-documentation gap. The ownership log
therefore records that inspection as discarded. It supplies no feasibility,
protocol, identity, or implementation authority to this decision and cannot be
revived by a later annotation. The contract below is independently derived
from the official OpenAI authorities described above.

Public endpoints, provider-owned public-client registration, and caller
identity are separate authorities. Decision 0091 now permits OpenAI's
provider-owned non-secret public client as a compatibility registration while
requiring every controllable caller field and local disclosure to identify
`agent` truthfully. This decision retains the complete protocol contract and
keeps runtime admission inactive until a separate implementation series proves
that boundary. It does not add an API-key path, invoke Codex, or change the
currently shipped Ollama behavior.

## Decision

Adopt one non-active, independently authored OpenAI ChatGPT-subscription
contract. The machine provider registry records it as
`specified-compatible-inactive` and continues to record ChatGPT Plus/Pro
eligibility as `blocked` with `compatibility-implementation-required`. No OpenAI workspace, source literal,
credential record, network request, provider menu row, model row, or login
claim may enter product code while those values differ.

The future provider identity is `openaiSubscription`, displayed as `OpenAI`.
It is a backend of the one existing controller, not another agent, runtime, or
conversation. It never selects itself or a model because a credential exists.
Ollama Cloud remains independently removable and retains its exact current
contract.

### Compatibility implementation gate

Runtime activation requires dated first-party OpenAI authority and complete
owned evidence that establish all of the following together:

1. eligible ChatGPT subscriptions may be used by an independently implemented
   native client against the Codex subscription service;
2. the exact non-secret public-client identifier belongs to OpenAI's maintained
   Codex native client or a provider-published interoperability contract, and
   is not a third-party-only registration;
3. the exact device, token, refresh, revocation, catalog, and Responses routes,
   scopes, redirect value, account binding, truthful client-identification
   fields, distribution terms, and entitlement limits are authorized;
4. the client needs no distributable secret, every controllable originator,
   referrer, user-agent, and version field identifies `agent` truthfully or is
   omitted, and the local ceremony displays decision 0091's independent-
   compatibility disclosure; and
5. open-source distribution and local durable refresh-token storage are
   permitted.

Successful third-party login, a third-party-only constant, public endpoint,
public OIDC metadata, forum assertion, absence of an explicit prohibition, or
maintainer risk acceptance does not independently satisfy this gate. The
provider-owned client identifier is not a secret, but its exact value must be
recorded from pinned first-party OpenAI material in the implementation change;
it cannot be copied from Pi, OpenCode, another harness, traffic, or an
operator's foreign credential file. The current metadata has no registration
endpoint, so `agent` neither invents an identifier nor attempts implicit dynamic
registration.

When the gate is satisfied, the enabling change records the non-secret provider-
owned client identifier only in the machine provider policy and the exact owned
auth module, updates the OAuth dossier conclusion and disclosure, and changes
the contract state to `enabled`. Until then, the verifier continues to reject
every OpenAI OAuth literal in product source.

### Device authorization protocol

The first admitted login ceremony is device authorization only. Browser
authorization-code login and loopback callback ownership remain out of scope
until a separate decision is necessary. `agent auth` will select the registered
OpenAI provider outside the alternate-screen TUI and perform this exact serial
flow:

1. open one exclusive OpenAI credential admission and validate the complete
   provider-specific namespace before reading a committed secret byte;
2. send one JSON request containing only the admitted client identifier to
   `POST https://auth.openai.com/api/accounts/deviceauth/usercode`;
3. accept one bounded object containing a nonempty device authorization
   identity, a displayable one-time user code, and an integer polling interval;
4. show only `https://auth.openai.com/codex/device` and that one-time code on
   the current auth terminal, with explicit phishing guidance, and never place
   either value in arguments, shell history, logs, errors, receipts, sessions,
   fixtures, or the TUI transcript;
5. issue at most one serial poll at the admitted interval to
   `POST https://auth.openai.com/api/accounts/deviceauth/token` until success,
   explicit denial, cancellation, or the single 15-minute wall-clock deadline;
6. accept only a bounded authorization code, PKCE verifier, and matching S256
   challenge, then exchange them once at
   `POST https://auth.openai.com/oauth/token` using the registered client
   identity, the provider-authorized device redirect value, and form encoding;
   and
7. validate and atomically publish the exact provider record before reporting
   success.

The server-provided poll interval must be an integer from 1 through 30 seconds.
Pending poll outcomes are the exact provider-authorized statuses fixed by the
activation evidence; every other status settles the ceremony. Polling is one
protocol continuation, not an HTTP retry: there is one outstanding request,
no concurrent poll, no exponential policy, and no replay after transport or
decode failure. Machine requests do not follow redirects. Cancellation closes
the request, clears all ephemeral authorization material, publishes nothing,
and releases admission.

Only the device verification URL and user code are intentionally visible.
The device authorization identity, authorization code, verifier, challenge,
access token, refresh token, ID token, account identifier, response bodies,
and lengths are secret or private protocol material and remain non-projectable.
The user code is ephemeral authorization material even though the ceremony
must display it; Agent never calls it a durable credential.

### Token and durable-record contract

The token response must be a bounded JSON object containing one access token,
one refresh token, and the signed identity material needed to derive the
ChatGPT account binding and access-token expiration. `agent` persists no ID
token, email, name, organization list, plan label, browser cookie, API key, or
complete token response. Claims decoded from a token select only the account
header and proactive-refresh time; they grant no local authority. The remote
service still validates the bearer token. Missing, ambiguous, malformed, or
conflicting account or expiration claims fail closed.

The future committed record is exactly
`~/.agent/credentials/openai.oauth`, with recovery names
`.openai.oauth.pending` and `.openai.oauth.retired` and the non-secret admission
file `~/.agent/.openai-oauth-credential.lock`. Its strict UTF-8 plaintext format
is:

```text
agent/openai/oauth/v1
revision=<decimal revision>
access-length=<decimal byte length>
refresh-length=<decimal byte length>
account-length=<decimal byte length>
expires-at=<decimal Unix second>

<access-token bytes><refresh-token bytes><account-id bytes>
```

The ASCII header is ordered exactly as shown, contains no leading zeros, and
ends at the first empty line within 256 bytes. `revision` and `expires-at` are
integers from 1 through 9,007,199,254,740,991. Access and refresh tokens are
each 1 through 32,768 visible ASCII bytes; the account identifier is 1 through
256 bytes and matches the closed activation-time claim syntax. Declared
lengths must partition the complete remaining payload exactly. The complete
record is at most 66,048 bytes. A byte-order mark, alternate newline, extra or
reordered field, unsupported version, whitespace or control byte in a payload,
trailing byte, invalid number, or inconsistent claim fails before the record
becomes provider authority.

This record and its recovery names extend, but do not generalize, decision
0089. The CLI and owned native broker remain the only storage owners and reuse
the same native home, lineage, link, owner, ACL or mode, atomic no-replace
publication, replacement, retirement, synchronization, recovery, and
content-safe failure requirements. The credentials directory inventory becomes
the closed union of the registered Ollama and OpenAI names only. There is no
generic OAuth map, shared token blob, foreign auth-file import, compatibility
reader, operating-system keychain, encrypted-vault claim, or automatic
environment import. No environment variable is an OpenAI OAuth authority in
the first activation.

OpenAI admission is exclusive for the complete TUI session or `agent auth`
mutation. This intentionally permits only one live OpenAI credential user and
prevents two processes from racing a rotating refresh token. Ollama keeps its
current shared-session/exclusive-mutation admission. The two provider locks are
independent; acquiring one never grants or waits for the other.

Before a catalog or chat request, an access token at or within five minutes of
its validated expiration performs exactly one serialized refresh-token grant
against `POST https://auth.openai.com/oauth/token`. A returned replacement
refresh token replaces the prior value; an absent replacement retains it. A
new access token must preserve the committed account identity. The new record
is atomically durable before the token can authorize a provider request.
Transport, status, decode, account mismatch, or publication failure settles
the operation without retrying the refresh or original request. An unusable
refresh token requires a new `agent auth` ceremony; no API key, stale access
token, foreign store, or alternate endpoint is tried.

Disconnect and removal require exclusive admission. Provider revocation uses
exactly one request to `POST https://auth.openai.com/oauth/revoke` when the
activation evidence defines a supported revocation contract. Failure preserves
the local record so the operator can retry or deliberately choose a separately
documented local-only removal action. Local removal is not secure erasure and
does not prove provider-side revocation.

### Catalog and model transport

After activation, the existing `/models` first stage lists OpenAI only when its
exclusive startup admission produced one valid credential snapshot. Accepting
it performs one bearer-authenticated request to the exact catalog base
`https://chatgpt.com/backend-api/codex/models`, with the truthful Agent version
in the single provider-authorized client-version query. It sends the access
token, validated account identifier, truthful `agent` originator, and owned
Agent user agent. It sends no conversation, workspace path, file content, tool
schema, result, other credential, or foreign product identity.

The future decoder accepts only the bounded activation-time catalog schema and
current entries explicitly marked usable through the Responses service. It
never imports a Codex static model list, model alias, model metadata file, or
minimum Codex-client policy. The fresh authenticated response is availability
authority only. Selecting one row atomically selects OpenAI and that exact
model in the existing process-only transaction. There is no remembered
provider or model, cross-provider aggregation, partial result, concurrent
catalog request, fallback, or implicit default.

Chat turns use one `POST` to exactly
`https://chatgpt.com/backend-api/codex/responses`, authenticated by the same
access-token and account snapshot and identified truthfully as Agent. The
independently authored adapter maps the existing bounded selected-path history,
lean owned instruction, six exact tool schemas, tool results, model choice, and
thinking setting into the public Responses data model with `stream: true` and
`store: false`. It admits only the exact bounded SSE events required for text,
reasoning, function calls, usage, completion, and error settlement. Provider
call identities remain provider data; runtime normalization, permissions,
effects, checkpoints, and provider-order settlement retain their current
owners.

The adapter adds no OpenAI SDK, Codex package, executable, App Server, copied
request builder, browser automation, web search, file upload, hosted tool,
conversation storage, background response, compatibility endpoint, arbitrary
base URL, redirect, retry, replay, router, or fallback. Provider-returned error
bodies remain unread for presentation. Exact status, framing, event, finish,
reasoning, tool-call, cleanup, timeout, and cancellation classifications are
fixed with red-green contract tests in the implementation decision before the
first product request is admitted.

### Security, privacy, and failure boundary

The OAuth record remains plaintext protected by native ownership and
owner-only access controls, not encryption. It does not protect against the
same user, administrator or root, malware, memory inspection, backups,
snapshots, or privileged offline access. OAuth adds account takeover and
refresh-token replay risk: a copied refresh token may outlive an access token
and may invalidate the legitimate rotating lineage. Exclusive admission,
atomic replacement, strict account continuity, closed origins, PKCE, stateful
device settlement, and non-projection reduce ambiguity but do not prevent a
host-authorized attacker from using the credential.

No authorization or provider response body enters an error, log, receipt,
fixture, transcript, journal, or documentation value. Operator-visible
failures are closed families for cancellation, denial, expiry, connectivity,
timeout, rejected identity or entitlement, limit, protocol, unsafe store,
refresh required, and cleanup. They contain no token, account, email, model,
prompt, response, code, verifier, device identity, path, length, provider text,
or numeric status. Agent never claims that local login proves entitlement,
quota, credit, model access, service availability, pricing, retention, or data
use.

### Delivery gate

Implementation remains split into reviewable red-green modules after this
compatibility decision:

1. record the exact first-party provider-owned public-client constant, `agent`
   caller fields, disclosure, authorized scopes, and status semantics while
   retaining an inactive machine state;
2. extend the native credential broker with the exact OpenAI record,
   exclusive admission, recovery, refresh replacement, and removal lifecycle;
3. extend `agent auth` with the device ceremony and prove zero projection;
4. add the authenticated catalog and Responses adapter as one removable
   provider module; and
5. integrate the provider into the serial `/models` transaction, update living
   privacy, security, architecture, manual, and maintenance authority, verify
   Windows and Linux, and perform an operator-controlled live smoke.

No protected branch or release may contain a client identifier without the
recorded authority, a credential record without its removal path, an auth row
without a complete ceremony, a catalog row without a transport, two OpenAI
credential users, or living documentation that describes an inactive module
as current.

## Consequences

The project now has an exact OpenAI OAuth direction rather than an API-key
substitute or an unspecified future placeholder. Public endpoint feasibility is
separated from registered identity, and the machine policy prevents the
decision from silently becoming runtime authority. Device-only activation
avoids a local callback server in the first implementation and keeps the
ceremony outside the TUI.

The compatibility implementation gate still delays product connectivity. The
design also accepts exclusive OpenAI use per credential so refresh rotation
remains deterministic; later multi-process token brokering would require a
separate decision rather than weakening admission implicitly.

## Verification

This decision-only module adds no product source or native authority. Red-green
policy tests bind the single `specified-compatible-inactive` contract, exact official
origins and routes, decision ID, record name, exclusive admission, catalog
authority, Responses transport, research date, null registration endpoint, and
provider-owned registration authority, `agent` caller identity, and disclosure.
They reject an enabled state, third-party-only registration, foreign caller
identity, invented registration endpoint, shared refresh authority, alternate
API-key transport, or second subscription contract.

Documentation verification binds this record, current-authority route,
decision metadata and digest, provider-policy schema, OAuth registration
conclusion, primary-source links, one commit-pinned official OpenAI provenance
entry and the separately bound discarded Pi/OpenCode historical record.
Publication verification continues to require that living product documents
say Ollama Cloud is the sole enabled provider and that OpenAI OAuth is inactive.
Existing source scanning continues to reject every OpenAI subscription endpoint,
OAuth field, client identity, token record, foreign credential path, or provider
workspace in product code.

The canonical Windows and Linux gates use no network, real account, client
identifier, token, device code, or provider response.

## Update, rollback, and removal

Changing an origin, route, flow, registered identity, scope, record format,
admission mode, refresh rule, catalog authority, transport, response protocol,
threat model, failure family, delivery order, rollback, or removal path requires
this decision, the machine policy, provenance, privacy, security, architecture,
maintenance, manual, and focused tests to change together. Recheck primary
OpenAI documentation, authorization metadata, and pinned first-party source
before every such change. A future reference-project inspection must first
record the exact stale-documentation gap in a new dated provenance entry. It
may not reuse notes or observations from the discarded Pi or OpenCode
inspection.

Before activation, rollback of decision 0091 restores this decision's original
agent-owned identity gate and `specified-blocked` machine state. Removing this
decision entirely also removes its subscription-contract policy entry and
tests, index routes, dossier update, and OpenAI provenance row. Either path
leaves Ollama source and operator data unchanged because no OpenAI namespace or
request exists.

After future activation, rollback first disables new login and refresh while
retaining an explicit remove path. With every OpenAI Agent session closed, the
operator revokes when available, removes the exact committed record through the
native retirement path, validates absence of pending and retired states, and
removes only the empty OpenAI lock after the provider module is gone. Rollback
never copies tokens to an environment variable or foreign store, restores an
expired token, falls back to an API key, or removes Ollama credentials or
sessions. Complete provider removal deletes the auth ceremony, refresh path,
record schema, lock, catalog and transport adapters, provider row, tests,
policy entry, and living documentation together.
