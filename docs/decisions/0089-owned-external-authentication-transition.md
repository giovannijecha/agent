# 0089: Owned external authentication transition

- Status: accepted
- Date: 2026-08-20
- Domain: security
- Supersedes: 0088
- Superseded by: none

## Context

Decision 0072 currently owns the shipped Ollama Cloud boundary: `/providers`
accepts one concealed process-memory API key, `/models` queries that active
provider's exact authenticated catalog, and no credential, provider, or model
selection survives process exit. Decision 0087 reserves
`~/.agent/credentials` without creating it. Decision 0088 defines a dormant
OAuth-only plaintext boundary and expressly excludes API keys.

The accepted product direction now moves every authentication lifecycle out of
the alternate-screen TUI, begins durable storage with the existing Ollama Cloud
API key, and later admits independently designed provider-specific OAuth
records. Amending decision 0088 would rewrite its historical OAuth-only
activation gate. Leaving it current beside an API-key store would create two
incompatible credential authorities. This decision therefore supersedes
decision 0088's dormant future contract.

This record changes no shipped behavior. In particular, it does not supersede
decision 0072, activate `~/.agent/credentials`, add `agent auth`, remove
`/providers`, alter `/models`, persist an API key, or change the current
provider policy. Those changes require the later implementation modules and
their source, native, policy, test, manual, privacy, security, maintenance, and
removal evidence. Decision 0087 remains the current user-root authority.

## Decision

Adopt one non-activating transition contract for external authentication,
provider-specific durable credentials, and atomic provider-model selection.
Until an implementation module changes a named product boundary, the current
decision-0072 behavior and the verifier's dormant source gate remain
authoritative.

### External authentication surface

The future exact launch form is `agent auth`. It runs before workspace
resolution and outside terminal alternate-screen ownership. It requires TTY
input and output, performs no session-journal operation, and never starts the
conversation controller, runtime, model loop, workspace tools, or TUI.
`agent auth` accepts no credential or provider identifier in process arguments.
Any option or operand beyond that exact subcommand, and any non-TTY or redirected
standard input or output, fails before credential storage opens.

The command presents only registered provider identities and the closed local
actions available for the selected provider. For Ollama Cloud those actions are
register, replace, remove, or cancel. Register requires settled absence; replace
and remove require one validated committed record. Every other action-state pair
fails without credential input or mutation. Register and replace read the API
key through one zero-echo terminal input owner. No key byte, mask, length, caret
offset, validation detail, provider response, or prior value enters process
arguments, shell history, terminal output, transcript, journal, log, error,
notice, receipt, fixture, or documentation value. Cancellation publishes
nothing. Ollama registration is local admission, not proof that the provider
will accept the key, and performs no network request.

The same implementation module that activates `agent auth` removes
`/providers`, its command-catalog entry, provider selector, concealed TUI
credential mode, application state, projections, tests, and manual guidance.
No published revision may expose both interactive credential authorities.
Environment input is not an interactive authority and follows the separate
dual-authority rule below.

### Owned credential store

The CLI and its owned native C17 broker are the sole storage and platform
owners. The canonical directory is the exact `credentials` child of the
decision-0087 native-resolved account root:

```text
~/.agent/
|-- sessions/
|-- .ollama-cloud-credential.lock
`-- credentials/
    |-- ollama-cloud.api-key
    |-- .ollama-cloud.api-key.pending
    `-- .ollama-cloud.api-key.retired
```

The non-secret lock is the provider-record admission owner and is not a
credential record. It is an exact zero-byte regular file; admission locks byte
offset 0 for length 1 beyond end of file. The first startup or `agent auth`
operation after activation creates it empty and without overwrite under the
native protections below. An already-exists result opens and validates that
exact winning object once; every other creation result fails. The lock is never
replaced and remains until complete removal.

The two dot-prefixed record paths are bounded recovery states and are absent at
settlement. At initial activation, the credentials directory admits only the
exact Ollama committed record and those two recovery names. Every other entry,
nested directory, alternate spelling, provider name, record kind, schema,
version, backup, alias, or legacy path fails closed. A future provider must add
its own exact record name, format, admission, lifecycle, policy entry, decision,
tests, rollback, and removal route. There is no generic provider map, shared
opaque blob, arbitrary key/value record, discovery scan, import, or compatibility
decoder.

The initial committed record is exactly
`~/.agent/credentials/ollama-cloud.api-key`. It is strict UTF-8 plaintext with
this provider-specific byte format:

```text
agent/ollama-cloud/api-key/v1
revision=<decimal revision>
length=<decimal UTF-8 byte length>

<exact API-key bytes, with no trailing newline>
```

The header is ASCII, ordered exactly as shown, contains no leading zeros, and
ends at the first empty line within 128 bytes. `revision` is an integer from 1
through 9,007,199,254,740,991. `length` is from 1 through 32,768 and must equal
both the remaining file size and the strict UTF-8 re-encoding length. The
decoded key keeps the decision-0072 validation contract: 1 through 8,192
UTF-16 code units, no whitespace or control character, and no normalization.
The complete file is at most 32,896 bytes. A byte-order mark, alternate newline,
extra field, reordered field, trailing byte, malformed number, unsupported
version, invalid UTF-8, or invalid key fails closed.

Before reading any secret payload byte, the native boundary validates the
complete registered directory inventory, absolute account-root lineage,
object kinds, ownership, access controls, link state, record header and declared
payload extent, provider admission, and absence of an ambiguous recovery state.
It reads only the bounded non-secret header needed to validate that schema and
extent. The API-key payload is exposed to the CLI only after the complete
record validates; malformed payload is never returned as a credential.

The store is called the owned credential store. It is not an encrypted vault,
operating-system keychain, Credential Manager, DPAPI, libsecret, or a claim of
tamper resistance. On Windows, the native broker derives the current account
SID from the process token. It creates the lock, directory, committed record,
and recovery records as real non-reparse objects with protected non-inherited
security descriptors, that SID as owner, and one exact allow entry for that
SID. Every open revalidates owner, DACL, object kind, reparse state, and a record
link count of one before payload access. Node mode bits are not a Windows
security boundary.

On Linux, the broker uses native-home directory handles, handle-relative
no-follow opens, effective-user ownership, directory mode `0700`, file mode
`0600`, and a record link count of one. Creation fixes the final mode rather
than trusting umask. Every open revalidates the complete path and object state
before payload access. Unsupported ownership, ACL, mode, no-follow, locking,
atomic-publication, synchronization, or identity primitives fail closed on
either platform. Agent never repairs, broadens, replaces, quarantines, or
deletes an unsafe unknown object automatically.

This boundary protects against ordinary access by another unprivileged account
only while the native filesystem enforces the admitted controls. It does not
protect against same-user processes, administrator or root authority, malware,
backups, snapshots, memory inspection, or offline privileged access. Local
removal is not secure erasure and cannot recall copied, backed-up, or
provider-side material.

### Authority and concurrency

Every process that inspects or uses the Ollama record first acquires one
non-waiting shared or exclusive provider-record admission on the exact
`.ollama-cloud-credential.lock` range `[0, 1)`. Windows uses `LockFileEx` with
`LOCKFILE_FAIL_IMMEDIATELY` and adds `LOCKFILE_EXCLUSIVE_LOCK` only for the
exclusive admission. Linux uses `fcntl(F_OFD_SETLK)` with `F_RDLCK` or
`F_WRLCK` on the validated owner-only file. The owning handle or open file
description remains open for the complete admission; close or process exit
releases it. Lock conflict reports one content-free busy outcome. Agent does not
wait, poll, elect, steal, or retry.

A TUI process takes the shared admission before resolving Ollama credential
authority. It snapshots the chosen credential once and retains that admission
until provider cleanup or process exit, including when the source is the
environment. `agent auth` takes the exclusive admission for register, replace,
remove, or recovery. It therefore cannot replace or remove a credential while
any Agent process can use that provider. A credential added after a running TUI
settled an absent provider is visible only to a new session. There is no hot
reload, partial read, mid-turn substitution, second storage reader, or replay.

`AGENT_OLLAMA_API_KEY` may remain a temporary automation input. It is validated
without normalization, never imported into the store, and never selects a
provider or model. If the admitted committed pathname and
`AGENT_OLLAMA_API_KEY` are both present, startup and `agent auth` fail with one
content-safe dual-authority classification before the durable payload is read;
payload validity is not needed to establish the conflict. An unsafe durable
envelope remains a store-boundary failure and never falls back to the
environment. With no committed record, an invalid environment value fails
explicitly. `agent auth` never registers or replaces a record while the
environment variable is present. Neither source has precedence or is imported;
the operator must remove one authority and start a new process.

Credential availability never selects a backend. Each new or resumed TUI
session still begins with no selected provider and no selected model. The CLI
keeps only the validated process-memory snapshot required by transports and
does not expose its source kind to the model, transcript, footer, or provider.

### Native mutation and recovery

All Ollama record mutations hold the exclusive provider admission. Settled
inventories are exactly absence or one committed record. The only recoverable
inventories are one `.pending`, one committed record plus `.pending`, or one
`.retired` without a committed record. Both recovery names, committed plus
`.retired`, an unsafe recovery object, or any unknown entry are ambiguous and
fail closed.

Recovery-file admission validates exact pathname, root lineage, regular
non-link object kind, owner, access, link count, and the maximum record size; it
does not assert credential-record validity. A metadata-safe `.pending` may
contain zero, partial, complete, or malformed record bytes. Recovery reads none
of those bytes, removes only that exact uncommitted file, and retains the
committed record or absence. A metadata-safe `.retired` without a committed
record means removal already committed; recovery deletes only that exact retired
file without decoding it. Recovery never guesses record contents, restores a
retired key, or selects between committed candidates.

Register validates the new key and encodes revision 1 only after settled
absence. Replace first validates the committed record, fails without mutation at
revision 9,007,199,254,740,991, and encodes the previous revision plus one. Both
create `.pending` without overwrite under the exact native protections. The
broker writes all bytes, synchronizes the file, revalidates it, and publishes it
from the same directory. Initial publication is an atomic no-replace rename;
replacement is one atomic native replacement. The previous committed record
remains authoritative until publication commits, so no partial record is ever
visible.

Removal atomically renames the committed record without overwrite to
`.retired`, making absence the committed authority, then deletes only that exact
retired file. It does not retain a backup or claim secure erasure. Ollama Cloud
has no admitted programmatic revocation endpoint in decision 0072; local removal
does not revoke the external API key, and the operator uses Ollama's own account
surface when remote invalidation is required.

On Linux, creation and retirement use same-directory `renameat2` no-replace,
replacement uses same-directory `renameat`, every record is synchronized before
publication, and the containing directory is synchronized after staging,
publication, retirement, and cleanup. Missing directory synchronization fails
closed. On Windows, initial and retirement publication use a same-volume native
no-replace move, replacement uses `ReplaceFileW` without a backup path, and
record handles are flushed before publication. Windows claims atomic namespace
visibility and recoverability from the exact named artifacts, not POSIX
directory-fsync durability. Every native result is content-free.

A failed or interrupted operation settles as one validated predecessor,
successor, settled absence, or metadata-safe `.pending` or `.retired` recovery
state. The next exclusive `agent auth` operation resolves only the admitted
recovery inventories above. Any other state is ambiguous and blocks payload
access. No mutation is retried implicitly, no superseded key is restored, and
no failed response is replayed.

### Provider and model selection

After the later selector module, `/models` is the sole in-TUI backend selector.
It operates from the immutable startup snapshot of providers with exactly one
credential authority. With none, it shows one content-safe notice directing the
operator to run `agent auth` after exit. It performs no catalog request.

Otherwise `/models` uses two serial stages in the existing interaction dock.
The first stage lists only those credential-bearing registered providers and
stages the provider choice without changing the active backend. Acceptance
issues exactly one authenticated catalog request for that staged provider.
Failure or cancellation preserves the previously selected provider and model.
The second stage lists only the fresh bounded identifiers returned by that one
catalog. Accepting a model atomically replaces both active provider and model;
cancel or failure replaces neither.

Catalogs are never aggregated, overlapped, cached across processes, partially
combined, or treated as fallback authority. The selector issues no concurrent
provider requests and retains decision 0072's exact Ollama origin, paths,
transport, status classification, no-redirect, no-retry, no-alias, no-router,
and no-fallback contracts. Provider and model selection remain process-only,
and the footer continues to show the settled pair.

### Delivery gate

Implementation proceeds in bounded red-green modules: the exact Ollama record
and native lifecycle; `agent auth` plus complete `/providers` removal; the
two-stage `/models` replacement; then Windows and Linux contract verification
and an operator-controlled Ollama smoke. OpenAI and xAI are outside this
decision and require separate official research, provenance, decisions,
provider contracts, adapters, and tests. No OAuth field, placeholder provider,
fake login, or speculative adapter enters these modules.

No intermediate implementation module may be published while it leaves a
dormant shipped storage owner, two interactive credential authorities, an
unreachable removal path, or living documentation that describes future
behavior as current. Each module may exist on the protected implementation
branch only while the next module remains in progress; the complete activation
changes source, native policy, provider policy, tests, living documentation,
privacy, security, maintenance, rollback, and removal together before release.

## Consequences

The future credential boundary is owned, plaintext, inspectable, provider-
specific, and removable without a dependency or operating-system secret
container. Authentication no longer competes with conversation input, while
backend selection remains an explicit process-only TUI action. Shared usage and
exclusive mutation give one exact credential snapshot to each running process
and make external changes visible only after restart.

The design deliberately accepts that a host-authorized same-user or privileged
principal can read the key. Native access checks and atomic publication prevent
ordinary cross-account disclosure and partial product reads; they do not create
a sandbox or cryptographic root of trust. The staged delivery costs additional
native and policy work but avoids generic storage, dual authority, silent
precedence, and ambiguous catalog aggregation.

## Verification

This decision-only module adds no product source or native authority. Its red-
green evidence binds the stable record, the reciprocal 0088 supersession edge,
the current non-activation statements, and the living-document distinction
between decision 0072 behavior and this future transition. The existing
provider gate must continue to require memory-only Ollama credentials and reject
`agent auth`, the credentials namespace, persistent readers, new Node effects,
and native source drift.

Activation requires offline Windows and Linux native tests for exact root and
object validation, SID/DACL or UID/mode enforcement, link rejection, bounded
header-before-payload parsing, unexpected entries, shared/exclusive contention,
environment dual authority, create, replace, remove, every recovery state,
atomic visibility, synchronization failure, process death, cancellation, and
secret non-projection. CLI tests cover exact launch grammar, zero-echo input,
no workspace or journal ownership, `/providers` absence, startup snapshots, and
new-session visibility. Selector tests cover no-credential notice, both serial
stages, one catalog request, atomic pair selection, cancellation, stale results,
and absence of aggregation, overlap, retry, or fallback. Canonical verification
uses synthetic keys and no network.

## Update, rollback, and removal

Before activation, rollback restores decision 0088 as accepted, removes this
record and its policy/index/test routes, and changes no operator data because no
credential namespace exists. Changing the root, record name or bytes, native
trust proof, threat model, admission unit, environment conflict, publication or
recovery state, command grammar, selector transaction, staged order, rollback,
or removal path requires a replacing decision and synchronized evidence.

After activation, rollback first disables register and replace while retaining
remove-only `agent auth`. The operator closes every TUI process, removes each
exact provider record under the current native boundary, completes any desired
provider-side key revocation, validates that no pending or retired state remains,
and removes the exact credentials directory and non-secret provider lock. Only
then may an older process-only implementation run. Rollback never imports a
durable key into an environment variable, restores `/providers` beside
`agent auth`, or leaves a credential that the restored executable cannot
manage.

Complete removal closes every Agent process, acquires the exact exclusive
admission, validates the bounded registered inventory, removes the committed
record through the admitted retirement path, and deletes only the empty
`~/.agent/credentials` directory and exact
`~/.agent/.ollama-cloud-credential.lock`. It never recursively deletes an
ambiguous tree and never removes `sessions`, `settings`, the `.agent` root,
workspace content, backups, snapshots, or provider-side credentials. Validation
failure stops with a content-safe boundary instead of widening deletion.
