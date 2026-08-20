# Security policy

## Supported versions

`agent` is pre-1.0 software. Only the latest published `0.x` release is
supported. Older snapshots do not receive security fixes.

## Report a vulnerability

After the public repository exists, report vulnerabilities through GitHub
private vulnerability reporting for `giovannijecha/agent`. Do not open a public
issue, discussion, or pull request containing exploit details, credentials,
personal data, or provider tokens.

Private reporting must be enabled before the first public release. Until that
channel exists, the project is not accepting vulnerability reports and must not
be presented as publicly supported software. No response-time promise is made
during the initial maintainer-only phase.

Include the affected version, platform, reproducible boundary, impact, and the
smallest safe reproduction. Replace all secrets and personal content with inert
sentinels.

## Security scope

High-priority boundaries include terminal-control injection, workspace escape,
symlink traversal, unauthorized tool execution, cancellation and cleanup,
secret retention, credential storage, provider identity, protocol decoding,
and verification bypasses.

Normal startup canonicalizes the exact current directory once and rejects a
filesystem volume root, the exact user home, and the exact shared temporary
directory before credentials or terminal ownership. It also rejects every
workspace containing the native-home `.agent` state root and every workspace
inside that root. An existing `.agent` or `sessions` namespace that is linked
or not a directory also fails at this pre-tool boundary, including for launches
that do not create a journal. It never widens authority
by discovering a parent Git repository. The same immutable absolute root feeds
the footer and every built-in tool. An owned bounded native resolver obtains the
protected roots from operating-system account and known-folder contracts with
an empty inherited environment; `HOME`, `USERPROFILE`, `TMPDIR`, `TMP`, and
`TEMP` cannot relocate those protections.

The same startup sequence fixes one deny-only read policy before credentials,
providers, tools, or terminal ownership. Built-in sensitive-path rules cannot
be overridden; a bounded optional root `.agentignore` can only add denials.
Malformed or unsupported policy input fails closed. The three read tools reject
or prune denied paths before file content is opened or returned,
recheck resolved targets, and reject ambiguous Windows DOS short-name aliases.
This is a disclosure boundary, not content-based secret detection, write
protection, or a sandbox for approved processes.

Optional `read_file` line selection is applied only after that same bounded
complete-file observation and its post-read checks. It changes returned
context, not readable paths, source-size limits, or filesystem authority.

The CLI keeps one memory-only `Allow`, `Ask`, or `Deny` entry for each exact
built-in tool. Reads default to `Allow`; writes and execution default to `Ask`.
Every planned runtime request waits for one exact turn-and-call decision.
`Deny` never invokes the handler, and `Allow` cannot widen schemas, paths,
programs, limits, the read policy, stale-state checks, or native committers.
The policy is not persisted, provider-visible, or model-controlled.
Compact `Read`, `List`, `Search`, `Write`, `Manage`, and `Run` activity labels
are display-only closed data. They cannot dispatch a tool, select a permission,
or replace the canonical tool name and risk validation.

The Ollama Cloud adapter admits one bounded ordered native tool-call batch per
model response. The runtime validates the complete batch and resolves one exact
permission for each plan before its execution. Effects remain sequential. A batch
of two to four explicitly enrolled inspection calls may execute as one bounded
read cohort; all settlements are awaited and exposed in provider order before
the next model decision. This is a scheduling boundary, not an authority
change: schemas, disclosure policy, permissions, effect plans, committers, and
process containment remain exact. A read cohort never overlaps a mutation or
`shell`, and a completed effect is never retried implicitly.

Write calls are schema-validated with the complete batch before observation,
then planned just in time. `apply_patch` binds each authorized plan to one canonical target,
ordered exact-text hunks, target absence or canonical file identity, strict
UTF-8 complete content, and observed/result SHA-256 digests. Existing-file
anchors must each be unique, strictly ordered, non-overlapping, and effective;
creation has one empty anchor whose replacement is the complete new file.
The permission UI projects only the canonical path and bounded human-readable
changed rows. It removes only exact complete logical context shared by both
sides of one hunk; partial rows, separator differences, and the complete
untrimmed effect remain intact. An otherwise ambiguous terminal separator is
escaped inline on its owning direction-prefixed row and cannot collide with a
doubled source backslash. Digests, identities, counters, and tuple metadata
remain inside the immutable plan.
Invocation rejects stale path, identity, absence, or content state before
mutation. Decision 0046 routes the authorized immutable effect through one owned
Windows/Linux native committer.
Linux uses guarded handle-relative lookup, unnamed-file publication, and a write
lease; Windows uses handle-relative opens, exclusive sharing, and delete-pending
creation. Missing platform or filesystem primitives fail closed. This closes
ordinary retargeting and conflicting-content races for the selected object; it
does not provide multi-file atomicity, crash rollback, storage durability, or a
filesystem/network sandbox.

`manage_path` separately binds one exact authorization to one closed
create-directory, move, or remove effect. Planning records canonical source and
destination paths, object kind and identity, parent identities, and destination
absence. A supported invocation rechecks that state before one handle-relative
native namespace commit. Overwrite, merge, recursive or nonempty-directory
removal, implicit parent creation, self-descendant move, and stale state fail closed.
Windows implements all three operations through its object-bound native
protocol. Linux implements only verified-parent directory creation; move and
remove are rejected by the planner before path-specific planning, namespace
observation, or authorization, while the native broker retains the same final
guard. `renameat2` and `unlinkat` cannot condition source selection on the
approved identity. No check-then-mutate or rollback fallback is admitted. Every
successful result is one object-bound namespace commit, not a filesystem
transaction, rollback, durability guarantee, or sandbox.

Model and tool text cannot provide styling metadata or terminal escapes. Generic
components and frames validate one closed semantic tone per printable row; only
the owned renderer emits fixed ANSI and resets it during row output and cleanup.
Interrupted OSC strings are conservatively closed before later renderer output.
Native root, content-mutation, namespace-mutation, and clipboard helpers have
hard operation and post-kill cleanup deadlines; late events cannot change
settled content-free results.

The project enables exactly `https://ollama.com/api/tags` and
`https://ollama.com/api/chat`. Both requests use bearer authentication through
one process-memory credential. Catalog rows are bounded and selectable only
when their `name` and `model` fields are equal; catalog content cannot change
the registered origin, paths, authentication, chat protocol, or tool schemas.
The adapter never follows redirects, discovers an origin, retries, aliases a
model, or falls back to another backend. The TUI credential context reuses the
bounded editor while projecting zero secret text and zero secret caret offset.
It enables no provider OAuth login, arbitrary network transport, local Ollama
daemon, persistent provider credential or catalog store, or automatic provider
or model selection. The bounded session journal is a separate
CLI-owned local state boundary and never stores those provider values. The
single `shell` capability admits one exactly
approved bounded command through the fixed profile-free platform shell, a
controlled environment that excludes provider credentials, and owned
descendant-tree containment. That containment is not a filesystem or network
sandbox; approved code retains the launching user's operating-system
authority. Reports about provider traffic should identify the
exact CLI transport, wire decoder, or configuration boundary involved.

The conversation tree exposes only one selected root-to-node path to the model.
Alternate branches cannot execute, request permission, or emit output.
Selecting an older checkpoint does not replay its tool call or assert that its
observation is current; any later mutation is planned and authorized again
against current workspace state. Node selection is idle-only and accepts only
an exact retained identity.

Interactive sessions append only complete settled nodes, including optional
separately bounded native reasoning, to one versioned per-user CLI journal
outside the workspace. The state directory is the exact
`~/.agent/sessions` child of the credential-free native-resolved account home,
followed by an irreversible digest of the exact canonical workspace. Exact
`.agent` and `sessions` symlinks or non-directories fail closed. Resume requires
the newest journal to be inactive and
valid before provider composition. Unknown versions, ambiguous locks, unsafe
retirement targets, interior corruption, and all bound failures stop
content-free. One unique never-reused token per launcher serializes scan,
retention, resume-source validation, and publication; any observed live peer
makes the contender report busy, and only an operating-system-proven stale
token's unique pathname may be removed. Publication values advance beyond the
newest validated session despite a tied or regressed wall clock. Required
file synchronization and POSIX directory synchronization fail closed. Only an
incomplete final line may recover its validated prefix. Version-one and
version-two journals have separate exact decoders; new and continued sessions
write only version two, and a version-one source is never rewritten. The
journal requests
owner-only permissions but is not encrypted, tamper-proof, or protected from
host-authorized principals. Credentials, provider/model state, thinking effort
and display settings, permissions, drafts, provisional output, and foreign
causes are never recorded.

Migration from the former platform-state root is limited to the exact accessed
workspace. It reuses the cross-version admission token, rejects active sessions
and any simultaneous legacy/current authority, and performs one same-filesystem
directory rename without copying, merging, overwriting, or deleting conflict
data. The current root remains outside every admitted workspace because
overlapping ancestors and descendants are invalid; built-in workspace tools
cannot traverse to it. An approved shell retains the launching user's ordinary
host authority and is not a filesystem sandbox.

The admission protects the migration itself, not a later downgrade. An older
executable must not run after migration until the exact workspace has been
rolled back. If it recreates legacy state, the current executable detects both
authorities and fails closed rather than selecting one.

The maintainer-only task evaluator is a separate offline tooling boundary. It
accepts only the registered strict-text corpus and regular-file run trees,
rejects linked or secret-shaped corpus paths, and never executes candidate code
or treats a result as trusted product source. Run identifiers determine one
bounded ignored state path; preparation refuses reuse and checks each existing
state-directory component before writing. Evaluation workspaces still contain
untrusted candidate text and must not be executed outside the normal product
approval and process contracts.

The canonical gate may execute a fixed completion command only against
immutable versioned input and expected fixtures when a task decision requires
self-verification. It never substitutes a prepared workspace, candidate path,
model-authored argument, shell, or provider input into that proof.
The red-green recovery proof runs the same fixed Node test against its tracked
input and expected directories. During a live evaluation, both process calls
still cross the ordinary registered-program, permission, containment, output,
and cancellation boundaries.

The optional interactive evaluation receipt does not expand that boundary or
weaken product controls. It observes only already accepted serialized lifecycle
events, cannot approve or reorder work, retains read identities only as bounded
memory-only digests, and emits no content or identifier. The exact flag requires
TTY input and output and is rejected before credentials when redirected.

The versioned failure registry is validated offline against the maintained task
catalog and tracked repository inventory. It admits only closed content-free
evidence and fixture-relative paths that pass the corpus safety bounds. It never
reads ignored runs, executes candidate code, captures model output, or grants
product authority. Unknown fields, task identifiers, resolution targets, or
unsafe paths fail the canonical gate.
Evidence from a task contract whose expected snapshot cannot satisfy its own
check is invalidated and removed before it can justify a security or product
change.

## Disclosure

Keep a report private until a fix, regression test, affected-version statement,
and release plan exist. The maintainer decides the coordinated disclosure date.
Publishing a fix never permits publication of a user's credentials or content.
