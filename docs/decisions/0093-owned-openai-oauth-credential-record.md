# 0093: Owned OpenAI OAuth credential record

- Status: accepted
- Date: 2026-08-21
- Domain: providers
- Supersedes: none
- Superseded by: none

## Context

Decision 0089 activates one provider-specific owned credential store for
Ollama Cloud. Decision 0090 specifies the future OpenAI OAuth record, exclusive
admission, recovery, replacement, and removal contract. Decisions 0091 and
0092 accept provider-owned public-client compatibility and OpenAI's exact
non-secret client identity while leaving runtime inactive. The next delivery
gate is the record itself; combining it with browser interaction or network
transport would make filesystem, secret-projection, and protocol failures
indistinguishable.

OpenAI's official authentication documentation confirms that local login state
is cached, refreshed, and cleared by logout, but it does not own Agent's record
schema or filesystem boundary. Those remain independently specified by
decisions 0089 and 0090. No further reference-project inspection is needed for
this module.

## Decision

Activate the exact OpenAI record implementation inside the existing CLI-owned
native credential broker. The machine OpenAI state becomes
`credential-compatible-inactive`, and its next blocker becomes
`auth-implementation-required`. This state admits storage mechanics only.
Ollama Cloud remains the sole enabled provider.

No current command or TUI path creates, reads, replaces, or removes an OpenAI
record. The broker adapter is a private boundary for the next `agent auth`
module; current application composition does not call it. This module adds no
login action, request, endpoint, provider package, provider row, model row,
catalog, transport, environment authority, client identifier use, browser
operation, refresh request, or runtime provider selection.

### Exact record and private protocol

The committed record is exactly `~/.agent/credentials/openai.oauth`; recovery
uses `.openai.oauth.pending` and `.openai.oauth.retired`; admission uses the
non-secret `~/.agent/.openai-oauth-credential.lock`. The on-disk bytes remain
the exact decision-0090 format:

```text
agent/openai/oauth/v1
revision=<decimal revision>
access-length=<decimal byte length>
refresh-length=<decimal byte length>
account-length=<decimal byte length>
expires-at=<decimal Unix second>

<access-token bytes><refresh-token bytes><account-id bytes>
```

The header ends at the first empty LF-only line within 256 bytes. Every field
is ordered exactly, decimal values have no leading zero, and `revision` plus
`expires-at` are integers from 1 through 9,007,199,254,740,991. Access and
refresh values are each 1 through 32,768 bytes. The account binding is 1
through 256 bytes. All three payload fields use the closed visible-ASCII byte
set `0x21` through `0x7e`; this is the activation-time claim syntax and admits
no whitespace, control, non-ASCII, alternate encoding, or delimiter parsing.
Declared lengths partition the complete payload, and the complete file is at
most 66,048 bytes.

The private broker protocol keeps Ollama request kinds 1 through 6 unchanged
and adds exact OpenAI kinds: snapshot 7, mutation open 8, register 9, replace
10, remove 11, and cancel 12. Response kind 13 is the only OpenAI payload
response. Register, replace, and payload response bodies are one little-endian
binary envelope containing three unsigned 32-bit lengths, one unsigned 64-bit
expiration, then the access, refresh, and account bytes in that order. The
envelope is at most 65,812 bytes. It contains no path, provider string,
arbitrary field, log text, or generic OAuth map. TypeScript validates before
launch; the C broker independently validates before publication or authority.
The C broker constructs the revisioned disk record and never accepts a caller-
chosen revision or serialized record.

### Native authority and inventory

Decision 0089's native home, profile-lineage, ownership, DACL or mode, no-link,
regular-object, synchronization, and atomic-publication proofs apply unchanged.
Windows creates and revalidates the OpenAI lock, credentials directory, and
record with the current account's protected exact DACL. Linux requires the
effective user, `0700` directory, `0600` lock and files, no-follow
directory-relative opens, one link per file, and directory synchronization.
Neither platform uses a Node mode as security authority, a keychain, DPAPI,
Credential Manager, libsecret, a foreign store, or encryption-at-rest claim.

The credential directory accepts only the three Ollama names and three OpenAI
names. A broker holding one provider lock may observe the other provider's
registered committed or recovery name because the locks are deliberately
independent; it never reads, repairs, removes, or interprets that other record.
Unknown names and duplicate or ambiguous selected-provider state fail closed.
A fresh directory descriptor or enumeration is used for every inventory pass,
so recovery cannot reuse an exhausted scan.

### Admission, lifecycle, and recovery

Every OpenAI snapshot and mutation holds the OpenAI lock exclusively until the
private pipe closes. A second OpenAI user fails busy without waiting, polling,
retrying, stealing, or reclaiming an unproven owner. Ollama retains shared
session and exclusive mutation admission. Holding either provider lock grants
no authority over and does not wait for the other lock.

Register requires absence and publishes revision 1. Replace requires a valid
committed record and publishes exactly the next revision. Remove renames the
committed record to the retired name, synchronizes that authority, and deletes
only the validated bounded retired file. Cancel changes nothing. Publication
writes one same-directory private pending record completely, synchronizes and
revalidates it, then uses the platform-native atomic no-replace or replacement
operation. The published record is reread and compared with the requested
fields before success is returned.

Exclusive admission recovers only a pending record with or without a committed
record by deleting pending, or a retired record without committed by deleting
retired. Pending plus retired, committed plus retired, unsafe metadata,
oversized recovery material, or any other combination fails closed. Shared
recovery does not exist for OpenAI. No recovery path decodes pending or retired
secret bytes, restores older material, or crosses provider boundaries.

There is no OpenAI environment authority. A later auth or refresh caller must
supply one complete bounded successor. Retaining a refresh value when a
provider omits rotation is future auth-module logic; the broker itself never
merges records or infers a field. Local removal is not secure erasure and does
not revoke provider-side authorization.

### Security and privacy

The record is plaintext protected by native owner-only controls, not an
encrypted vault. It does not protect against another process running as the
same account, administrator or root authority, malware, memory inspection,
backup, snapshot, restore privilege, or privileged offline access.

Credential fields cross only the private Node-to-native pipe and process
memory required for this boundary. They never enter arguments, environment,
stdout diagnostics, stderr, logs, errors, notices, transcripts, journals,
receipts, source values, documentation values, or test fixtures. Tests use
synthetic non-credential sentinels and isolated temporary roots. Every failure
is content-free and clears owned buffers before release.

## Consequences

The credential gate is complete without implying that an operator can sign in
or that OpenAI is an enabled provider. The next module can implement the exact
device ceremony against one already verified native transaction instead of
combining storage and network authority.

The private broker surface is larger and its maximum frame grows to carry two
bounded tokens and one account binding. Exact source digests, sensitive-state
occurrence inventories, provider-specific source allowances, and both native
platform fixtures therefore become part of this change. No generic credential
abstraction or second provider runtime is introduced.

## Verification

Protocol tests bind every new request number, the response number, little-
endian field order, bounds, visible-ASCII syntax, safe-integer expiration, and
malformed-frame rejection. Adapter tests bind exclusive snapshot ownership,
absent and present state, exact mutation mapping, one settlement, cleanup, and
content-free failure.

Native Windows and Linux fixtures bind exact disk bytes, register, snapshot,
replace, remove, cancellation, exclusive contention, independent Ollama and
OpenAI locks, coexistence inventory, hard-link rejection, malformed header and
payload rejection, trailing-byte rejection, pending recovery, retired
recovery, and interruption settlement. Existing platform tests retain owner,
DACL, mode, lineage, no-follow, atomic publication, and fresh inventory proofs
through the same implementation paths. No test uses a real account, provider
request, client identifier, or credential.

Provider policy binds decision 0093, `credential-compatible-inactive`, the
`auth-implementation-required` blocker, exact record and recovery names,
exclusive admission, no environment authority, private protocol bounds, and
the reviewed source path set. The source scanner admits OpenAI credential
spellings only in the exact broker, protocol, adapter, and their tests while
continuing to reject endpoints, client identifiers, provider packages,
network authority, foreign stores, and foreign identities everywhere.

The canonical Windows and Linux gates must pass offline.

## Update, rollback, and removal

Changing the record path, names, schema, encoding, payload syntax, bounds,
private frame layout, admission, lock, inventory union, recovery states,
publication order, environment posture, threat model, or removal semantics
requires a successor decision plus provider policy, architecture, privacy,
security, maintenance, manual, source policy, and focused tests in the same
change.

Before the auth module ships, ordinary product operation cannot create an
OpenAI record. Rollback first verifies that no process holds the OpenAI lock
and that the committed, pending, and retired OpenAI names are absent. If any is
present, keep this broker and its exact remove operation until exclusive
admission validates and retires the committed record or recovers a bounded
interruption. Then remove the OpenAI adapter methods, private frame kinds,
schema, paths, lock, inventory entries, policy allowances, tests, and current
documentation together. Never recursively delete the credentials directory or
touch the Ollama record, lock, sessions, settings, `.agent` root, or workspace.

After later authentication exists, rollback first disables new login and
refresh while retaining exclusive snapshot and removal. Complete any specified
provider revocation, remove the local record through retirement, prove the
three OpenAI record names absent, and only then remove the lock and this module.
If validation fails, stop content-free; never copy a token, restore a retired
record, fall back to an API key or foreign store, or claim secure erasure.
