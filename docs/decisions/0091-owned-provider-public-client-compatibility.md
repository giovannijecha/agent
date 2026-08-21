# 0091: Owned provider public-client compatibility

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0003 correctly separated independently authored OAuth code from OAuth
client registration and blocked every subscription provider until `agent`
received its own registration or an expressly reusable identity. Decision 0011
then recorded provider-specific authorization requests. Decision 0090 specified
the complete inactive OpenAI device, credential, catalog, and Responses
contract while retaining that identity gate.

That policy assumes independent native registrations are ordinarily available.
Current evidence shows a different interoperability model. OpenAI publicly
supports open-source maintainers using the coding tools they prefer and names
Pi and OpenCode alongside Codex. OpenAI Codex, Kimi Code, and Grok Build expose
native subscription login, while maintained independent harnesses implement
the same provider-hosted ceremonies through non-secret public clients. OAuth
public clients cannot keep a secret; possession of their client identifier
does not authenticate a caller.

The evidence does not make a provider-owned registration an `agent`
registration. It does establish a compatibility boundary that can be described
truthfully: `agent` may independently implement a provider protocol using the
provider's public native-client registration, identify itself as `agent`
wherever the protocol accepts caller identity, and tell the operator that the
integration is independent and may be withdrawn.

The current public documentation is insufficient for that contract. Pi's
provider guide identifies ChatGPT and xAI subscription login but omits the
public-client and wire details. It lists Kimi For Coding only as an API-key
provider even though the previously admitted Pi v0.84.1 observation established
a direct Kimi flow. The exact gaps were recorded in the ownership log before a
new bounded source inspection. That inspection confirmed that Kimi subscription
OAuth remains technically implemented, that its public client matches Kimi
Code's first-party registration, and that xAI separates its public registration
from a caller-referrer field. The earlier prematurely opened Pi and OpenCode
OpenAI files remain discarded and supply no evidence to this decision.

## Decision

Adopt provider-owned non-secret public-client compatibility as a permitted,
explicitly disclosed authentication category for ChatGPT/Codex, Kimi Code, and
xAI subscription providers. This record partially supersedes decision 0003's
requirement that those three providers obtain an `agent`-owned or expressly
reusable independent registration. It partially supersedes decision 0011's
approval-only activation rule for those providers and decision 0090's
`agent`-owned identity activation gate. Claude remains governed by decisions
0003 and 0011 and is outside this compatibility decision.

No shipped behavior changes in this decision. Ollama Cloud remains the only
enabled provider. No OAuth workspace, product literal, credential record,
network request, login row, provider row, or model row is admitted by this
policy-only module. The provider registry records the compatibility policy as
`accepted-runtime-inactive`; each provider still requires its own accepted
implementation decision and complete red-green evidence.

### Compatibility identity

A compatible provider module may send one exact provider-owned public client
identifier only when all of the following are recorded before implementation:

1. the identifier is non-secret and belongs to a provider-maintained native
   client or a provider-published interoperability contract;
2. the provider documents the subscription product and provider-hosted login
   ceremony to which the identifier belongs;
3. a current independently maintained harness establishes practical protocol
   interoperability without becoming protocol authority;
4. the exact issuer, authorization or device route, token and refresh route,
   scopes, redirect, entitlement transport, account binding, and revocation
   behavior have a pinned provider or public-protocol source; and
5. the provider-specific decision defines disclosure, breakage, credential,
   concurrency, privacy, security, rollback, and removal behavior.

The public client identifies the provider compatibility registration; it is
never called an `agent` client ID. `agent` remains the caller identity. Every
originator, referrer, client-version, user-agent, callback presentation, and
other independently controllable identity field must name `agent` truthfully or
be omitted. A provider that requires `agent` to send `pi`, `opencode`, `codex`,
`kimi-code`, `grok`, or another foreign caller identity remains blocked. The
provider-hosted consent page may identify the provider's registered native
client; the local ceremony must separately state that `agent` is independent,
uses that provider-owned compatibility registration, is not provider-endorsed,
and may stop working if the provider changes or revokes it.

The allowed protocol constant must come from the provider's own maintained
material. A value observed only in Pi, OpenCode, traffic, logs, a binary, a
foreign credential file, or another third-party client is not admissible. No
client secret is accepted. Agent never invents a registration, attempts dynamic
registration without a provider-published endpoint, or claims that a successful
login grants enduring entitlement.

### Current provider conclusions

OpenAI satisfies the research side of this policy: official OpenAI material
documents ChatGPT subscription authentication, identifies Pi and OpenCode as
tools maintainers may prefer, and the pinned first-party Codex authority already
establishes a Codex-owned configurable public client. Decision 0090 therefore
becomes `specified-compatible-inactive`. Its device, record, catalog, transport,
security, and removal contract remains authoritative; only its identity gate
changes. A later implementation module must record the exact non-secret
provider-owned constant and prove that every controllable caller identity is
`agent` before changing runtime state to enabled.

Kimi's current first-party source and the clean-room Pi inspection establish
that the same provider-owned public client supports Kimi Code subscription
device OAuth and refreshable bearer credentials. The private Kimi response that
public third-party OAuth registration is unavailable remains a material risk
record and is not rewritten as approval. Kimi remains inactive until a separate
decision accepts that compatibility risk and independently specifies its exact
credential, transport, model, failure, rollback, and removal contracts.

xAI officially documents Grok Build browser and RFC 8628 device login, and Pi
demonstrates a direct subscription flow with a distinct caller-referrer field.
xAI public-client ownership remains unresolved because no pinned first-party
source or provider contract currently establishes that the observed
registration is provider-owned. xAI therefore remains inactive and cannot enter
product source until its provider-specific decision closes that exact gap.

### Clean-room protocol research

Reference-project source may be inspected only when current public
documentation is demonstrated stale or incomplete for the exact
interoperability fact. Before opening source, the ownership log must record the
date, commit, public-documentation gap, intended paths or bounded subsystem, and
allowed facts. After inspection, the same entry records the actual material and
narrows the allowed influence.

Such source may establish only protocol existence, fixed wire facts,
provider-owned public-client correspondence, failure families, and feasibility.
It may not supply implementation structure, algorithms, abstractions, retries,
fallbacks, code, tests, fixtures, prompts, error text, model lists, credential
paths, foreign headers, foreign caller identity, UI, or product organization.
Agent's modules and tests are designed from the accepted contract and provider
specifications after the reference material is closed.

### Provider and credential isolation

Compatibility is not a generic OAuth adapter. OpenAI, Kimi, and xAI require
separate decisions, packages or cohesive CLI-owned adapters, credential records,
admission locks, schemas, refresh transactions, catalogs, transports, failures,
tests, and removal paths. Credentials never cross providers, import from a
foreign store, or select a provider or model. No provider SDK, CLI, App Server,
ACP process, plugin, executable, package, browser automation, arbitrary origin,
redirect following, discovery, router, retry, replay, or fallback is admitted.

The existing owned credential store remains plaintext protected by native
ownership and ACL or mode boundaries. Every future OAuth record remains
provider-specific and must fail closed on links, ownership, access control,
schema, inventory, concurrency, recovery, or account ambiguity before reading
secret bytes. Refresh authority is exclusive and serialized for the complete
provider use defined by its decision.

### Security, privacy, and operator disclosure

Compatibility adds revocation and account risk beyond ordinary API keys. A
provider may reject the registration, change its routes, narrow entitlements,
ban third-party use, display a provider-client name during consent, or invalidate
refresh lineages without notice. A successful ceremony proves only that the
provider issued the returned credential at that time. Agent makes no claim of
official endorsement, guaranteed plan access, pricing, quota, retention, data
use, availability, or future compatibility.

Passwords, cookies, browser sessions, provider session exports, foreign auth
files, device identities, authorization codes, access tokens, refresh tokens,
account identifiers, response bodies, and their lengths never enter source,
tests, fixtures, logs, errors, receipts, transcripts, journals, documentation
values, command arguments, or shell history. The future ceremony may display
only the provider-owned verification address, one-time user code, the truthful
compatibility disclosure, and content-safe status.

### Delivery order

Delivery remains serial and reviewable:

1. accept this compatibility, provenance, policy, and documentation module with
   no runtime behavior;
2. implement OpenAI through decision 0090 in separate credential, auth,
   transport, integration, and operator-smoke modules;
3. research and decide xAI independently after proving provider ownership of
   its public client;
4. decide Kimi independently, preserving the recorded provider response and
   its compatibility warning; and
5. run Windows and Linux verification, provider-controlled live smoke, pull
   request CI, and review for every provider module before the next begins.

## Consequences

The project no longer waits indefinitely for registrations that providers do
not ordinarily issue, while remaining honest about which identity it owns. It
can implement the same public compatibility class used by maintained harnesses
without importing their code or pretending their caller identity is ours.

This deliberately accepts a less stable boundary than an `agent`-owned client
registration. Provider-side changes may require immediate disablement. The
benefit is direct, zero-dependency, user-authorized subscription connectivity;
the cost is explicit compatibility, revocation, and account risk.

## Verification

The machine provider policy binds the single `accepted-runtime-inactive`
compatibility rule, exact provider set, provider-owned registration authority,
`agent` caller identity, disclosure, prohibition on foreign credentials and
runtimes, and provider-specific owned implementation requirement. OpenAI is
`specified-compatible-inactive`; Kimi and xAI remain blocked behind their own
decisions. Claude retains its independent-authorization blocker.

Documentation tests bind this decision, the pre-inspection and completed
provenance sequence, the current provider conclusions, and the unchanged living
runtime. Source scanning continues to reject every subscription endpoint,
client identifier, OAuth field, foreign identity, credential record, or new
provider workspace from product code until its implementation module changes
the exact allowlist.

The decision and policy tests use no network, real account, client identifier,
token, user code, provider response, or private correspondence. The canonical
Windows and Linux gates must remain green.

## Update, rollback, and removal

Changing the admitted provider set, identity rule, evidence threshold,
disclosure, source-inspection prerequisite, credential isolation, delivery
order, or risk posture requires this decision, provider policy, ownership
policy, privacy, security, maintenance, decision index, provenance, and focused
tests to change together. Every provider-specific protocol change requires new
dated official research and, when reference source is necessary, a new
pre-inspection gap entry before source access.

Before any runtime activation, rollback requires a successor decision that
marks this record superseded, removes its current-authority route, machine
compatibility rule and tests, OpenAI compatible-inactive state, and living
documentation routes, and restores decisions 0003, 0011, and 0090 as the
complete current identity gates. It retains this decision and both completed
provenance rows as immutable design and clean-room audit history, and leaves
Ollama credentials and runtime untouched.

After a future provider activation, rollback first disables new login and
refresh, closes every admission, preserves an explicit local removal path,
attempts provider revocation only when specified, retires the exact provider
record atomically, verifies recovery-state absence, and then removes the auth,
catalog, transport, model, policy, documentation, and tests together. It never
falls back to a foreign runtime, credential store, API key, origin, or provider.
