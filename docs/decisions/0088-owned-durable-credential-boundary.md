# 0088: Owned durable credential boundary

- Status: accepted
- Date: 2026-08-20
- Domain: security
- Supersedes: none
- Superseded by: none

## Context

Decision 0087 reserves `~/.agent/credentials` for future durable authentication
state but deliberately creates only the `sessions` namespace. Decision 0003
keeps every subscription OAuth provider blocked until `agent` receives an owned
or expressly reusable public-client registration and a complete published
protocol. Ollama Cloud remains the sole enabled provider, and its API key is
process-only.

Durable OAuth sessions will eventually require the minimum provider-issued
material needed to refresh or revoke access without signing in at every launch.
That material is a replay target. An operating-system credential container
would delegate format, access, migration, and removal authority outside the
product. Encrypting a file with a key stored beside it would add no independent
root of trust and would create a misleading protection claim. A passphrase-held
root would be a different product contract with interactive unlock, recovery,
cryptographic-agility, and availability consequences.

The current official provider documentation does not admit an independent
subscription OAuth client. OpenAI documents browser and device login plus local
credential caching for its Codex clients. xAI documents browser and device OIDC
for Grok Build. Anthropic documents subscription login for Claude Code and
subscription-backed use through its Agent SDK. Kimi documents device OAuth for
Kimi Code CLI and directs third-party tools to subscription-backed API keys.
Technical existence of those flows does not transfer the products' client
identities to `agent`.

This decision therefore owns the security boundary and activation gate, not a
dormant generic key store. It creates no credential namespace, record, command,
provider endpoint, or product behavior by itself.

## Decision

Durable provider authentication, when admitted, lives only under the exact
`credentials` child of the decision-0087 native-resolved user root:

```text
~/.agent/
|-- sessions/
`-- credentials/   # absent until the first admitted OAuth provider activates it
```

The CLI is the sole credential-storage and native-platform owner. Core, runtime,
tools, TUI, provider packages, workspace tools, and models receive no credential
pathname or storage capability. The CLI does not place credentials or their
paths in an approved shell's environment, but an approved command retains the
launching user's ordinary host authority and could name the directory itself.
`settings` remains a separate uncreated authority.

### Activation gate

The first provider that satisfies decisions 0003 and 0011 must activate this
boundary in the same replacing provider decision and implementation change.
That change must register the exact provider identity, authorization and token
origins, client identity authority, grants, scopes, entitlement transport,
refresh and revocation semantics, durable record identity, closed schema,
encoding, byte and entry bounds, concurrency unit, error mapping, operator
commands, privacy effects, rollback, and deletion procedure.

Until then:

- `~/.agent/credentials` remains absent;
- no generic credential blob, arbitrary provider name, token field, credential
  reader, simulated login, or placeholder `agent auth` surface is admitted;
- no official client's registration, executable, credential file, user agent,
  endpoint, or identity may be borrowed; and
- API keys, including the Ollama Cloud key and any future third-party key route,
  remain process-only and may never enter this boundary.

One admitted provider authorizes only its own exact record. It does not create a
generic provider framework or permit a second credential kind.

### Protection contract

Activated credential records are local plain text protected by an owned native
filesystem boundary. `agent` does not call an operating-system keychain, label
the directory a vault, or claim encryption at rest. A later passphrase or other
independent root of trust requires a separate accepted decision and migration;
cosmetic encryption with a colocated key is forbidden.

On Windows, an owned C17 broker must derive the current account SID from the
process token, create the real directory and each real record with protected,
non-inherited security descriptors, and grant access only to that SID. Every
open revalidates the owner, exact DACL, regular-file or directory kind, and
absence of a reparse point before reading secret bytes. Node file modes are not
treated as a Windows access-control boundary.

On Linux, an owned C17 broker must create the real directory with mode `0700`
and records with mode `0600`, require ownership by the effective user, and use
directory-handle-relative, no-follow opens. Every open revalidates ownership,
mode, regular-file or directory kind, and an exact link count of one for each
record before reading secret bytes. Creation fixes the final mode explicitly
rather than trusting the process umask.

An absent namespace is ordinary before the first login. A linked object,
unexpected kind or entry, wrong owner, broader access, malformed record,
unsupported filesystem behavior, ambiguous authority, or failed security
inspection fails closed without reading, repairing, replacing, quarantining, or
deleting secret material. No fallback path or legacy credential discovery is
allowed.

The boundary protects against ordinary access by other unprivileged operating-
system accounts when the host filesystem enforces the admitted controls. It
does not protect against another process running as the same account,
administrator or root authority, enabled backup or restore privileges, malware,
memory inspection, filesystem snapshots, or offline privileged access.

### Lifecycle and atomicity

Login, refresh, rotation, revocation, logout, and removal are serialized by one
exact provider-record admission across local processes. An activation decision
must define a bounded, never-reused admission identity and stale-owner proof; it
may not wait, elect a winner, steal an unproven lock, or retry implicitly.

Only a completely validated provider response may become durable. New or
rotated material is written completely to a same-directory private staging
record, synchronized, revalidated, and published by one platform-native atomic
replacement while admission is held; the containing directory is synchronized
where the platform exposes that contract. The previous committed record remains
authoritative until publication succeeds. Temporary authorization codes, device
codes, PKCE verifiers, browser callbacks, response bodies, and superseded
material never enter journals, transcripts, logs, notices, diagnostics,
fixtures, or documentation values.

Network exchange and local publication cannot form one transaction. If a
provider may have rotated or revoked a credential but the validated successor
cannot be committed, `agent` fails explicitly and requires the provider-defined
recovery or a new login. It never retries a refresh, replays an authorization
exchange, restores an older record, or silently falls back to another credential
or provider.

Logout first performs the provider's documented revocation when one exists and
reports its exact bounded outcome, then removes only the exact admitted local
record under admission. Local removal is not secure erasure and does not claim
to remove backups, snapshots, provider-side grants, or material already copied
by another same-user process. The provider activation decision must define how
operators complete remote revocation when the network path is unavailable.

## Verification

This dormant decision is verified by repository policy: all subscription OAuth
providers remain blocked, the current product creates no `credentials`
namespace, Ollama credential persistence remains forbidden, and no auth package,
command, endpoint, token field, or generic credential reader enters source.
The gate maintains a closed inventory of current sensitive-state identifiers and
the exact production CLI filesystem import authorities. A new sensitive
identifier, filesystem-capable CLI module, or expanded filesystem binding fails
closed until the owning decision and policy evidence are updated together.
The identifier inventory grants no global spelling allowance: each
case-sensitive spelling is bound to one reviewed path and exact occurrence
count. Adding a known spelling at a new use or removing an admitted occurrence
fails closed until that path record and its evidence change together.
Both inventory key sets are bidirectional: every registered path must remain in
the canonical product-source set, and each approved CLI filesystem path must
retain its exact import statement and bindings. A rename, deletion, or reduced
filesystem import fails closed rather than preserving a dormant path allowance.
Before applying dormant literal markers, the gate projects values reconstructed
only from bounded non-interpolated literals, parentheses, literal `+`, and
literal arrays joined with a static separator. It never evaluates product code;
an unscannable or over-bound candidate fails closed.

An activating provider change must add Windows and Linux native contract tests
for secure creation, exact access validation, reparse and symlink rejection,
unexpected entries, wrong ownership, broad permissions, partial writes,
publication and synchronization failures, simultaneous processes, stale
admission evidence, rotation, lost-response recovery, cancellation, revocation,
logout, rollback, and complete removal. Offline provider tests must prove that
secrets never cross output, errors, journals, fixtures, shell environments, or
model-facing boundaries. Both canonical platform verifiers must pass without a
real credential or network request.

## Update, rollback, and removal

Changing the root, native trust proof, plaintext posture, admitted credential
class, activation gate, concurrency unit, publication order, failure policy, or
threat-model claim requires this decision, the activating provider decision,
architecture, provider, privacy, security, engineering, manual, maintenance,
ownership, publication, and verifier contracts to change together.

Before activation, rollback removes this decision and its documentation routes;
there is no credential data or directory to migrate. After activation, rollback
first disables new login and refresh, revokes the exact provider grant when
possible, removes the exact local record under the admitted native boundary,
and only then removes provider composition and storage code. It never converts
durable OAuth material into an API key, environment variable, foreign credential
file, or another provider's record.

Complete removal closes every `agent` process, completes provider-side
revocation through the documented route, and deletes only the exact
`~/.agent/credentials` authority after its bounded contents validate. Removing
credentials never removes `sessions`, `settings`, the `.agent` root, or any
workspace content. If validation fails, removal stops and reports the exact
unsafe boundary instead of recursively deleting an ambiguous tree.
