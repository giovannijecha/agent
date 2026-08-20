# 0087: Owned user-scoped state root

- Status: accepted
- Date: 2026-08-20
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

Decision 0076 placed durable session journals under the operating system's
conventional application-state location: `%LOCALAPPDATA%\agent\sessions` on
Windows and `${XDG_STATE_HOME:-$HOME/.local/state}/agent/sessions` on POSIX.
That location keeps personal conversation data outside the workspace, but it
does not provide the one predictable, user-owned product root required for
future independently governed session, credential, and settings state.

Changing the location without a migration contract would make already retained
sessions appear missing, invite an unbounded search across legacy and current
roots, or leave two writable authorities for the same workspace. A global move
would have to scan an unbounded number of workspace directories and could
interfere with an active process. The existing per-workspace digest and
decision-0076 admission protocol provide a narrower migration boundary that old
and new executables both understand.

This decision changes only the user-state root and the physical location of
session journals. It does not persist credentials, settings, provider or model
selection, catalog results, permission state, or thinking controls. It does not
change the session schema, journal contents, retention bounds, resume grammar,
conversation tree, or single-controller contract.

## Decision

`agent` owns one user-scoped state root at the exact `.agent` child of the
operating-system account home returned by the existing credential-free native
platform-root resolver. The location is therefore `%USERPROFILE%\.agent` in
the ordinary Windows profile shape and `${HOME}/.agent` in the ordinary POSIX
profile shape, but inherited environment variables do not select the
authoritative home.

The only child admitted and created by this decision is:

```text
~/.agent/
`-- sessions/
```

`credentials/` and `settings/` are reserved product-intent names only. This
decision neither creates them nor authorizes any value to cross their future
boundaries. Each requires its own accepted decision, owner, schema, privacy and
security contract, verification, migration, rollback, and removal guidance.

The CLI remains the sole state-directory and journal owner. Before any workspace
tool can open, the workspace boundary validates any existing exact `.agent` and
`sessions` namespace and rejects a non-directory or symbolic link. Session
startup validates the resolved home as an absolute platform path and creates
the missing real directories with the existing owner-only request. Workspace digests,
session directories, files, schemas, locks, bounds, synchronization, and
retention otherwise keep decisions 0076 and 0085 unchanged.

### Legacy session migration

At every ordinary interactive launch, before session creation or resume, the
CLI considers only the legacy directory for the exact current workspace. The
legacy root is derived by the previously published rule so existing data is
discoverable; it never becomes the destination for new state.

If the legacy workspace directory is absent, the CLI opens the current
`~/.agent/sessions` authority directly. If it is present and the current
workspace directory is absent, the CLI:

1. acquires one decision-0076 admission inside the legacy workspace directory;
2. validates the bounded session inventory and rejects an active or ambiguous
   session lock;
3. rechecks that the current workspace destination is absent;
4. renames the complete workspace directory into `~/.agent/sessions`; and
5. releases the migrated admission and synchronizes the affected directory
   namespaces before continuing.

The move preserves every journal byte, session identity, publication value,
head, branch, reasoning value, and continuation lineage. It does not decode and
rewrite records. The admission token is the cross-version exclusion boundary:
an older executable attempting the same workspace observes the live token as
busy. Overlapping new launchers may all fail busy; there is no wait, election,
or implicit retry.

Migration is an exact same-filesystem rename. A cross-device move, unexpected
entry, unsafe or linked directory, active session, conflicting live admission,
storage or synchronization failure, or simultaneous legacy and current
workspace directories fails closed without copying, merging, overwriting, or
deleting either authority. A failed rename leaves the legacy authority in
place. The operator must resolve a cross-device or dual-root conflict
explicitly while every `agent` process is closed.

Only the accessed workspace migrates. Other legacy workspace directories remain
untouched until launched, so migration work stays bounded and cannot disclose
or mutate unrelated retained conversations. Empty legacy parent directories are
not recursively removed. There is no permanent read fallback: after a
successful move, creation and resume use only `~/.agent/sessions`. An older
executable does not know that authority and must not run against a migrated
workspace: it could recreate the absent legacy workspace directory. A later
current executable detects the resulting dual authority and fails closed; it
never guesses which side is newer.

## Bounds and security

Migration scans exactly one workspace directory under the existing limits of
64 admission tokens, 64 session entries, 32 retained sessions, and 16,777,216
UTF-8 bytes per journal. It introduces no global workspace scan, copy budget,
schema allowance, provider request, tool execution, or conversation replay.

The user-state root is outside every admitted workspace because startup rejects
any workspace that contains the native-home `.agent` root or is contained by
it; ordinary non-overlapping project descendants of the home remain valid.
Every built-in workspace tool remains confined to the selected workspace. No
`.agent` path enters a prompt, provider
request, transcript, notice, journal value, evaluation receipt, or model-facing
workspace-tool result. An explicitly approved `shell` command still has the
launching user's documented operating-system authority; this decision does not
claim a filesystem sandbox.

Directories request mode `0700` where supported. Session journals remain local
personal content rather than secrets, encrypted storage, or an operating-system
vault. This decision creates no credential file and does not weaken the current
process-only provider boundary.

## Verification

Focused CLI tests prove native-home root resolution on Windows and POSIX,
rejection of missing, relative, linked, or non-directory state paths, and that
no unadmitted sibling namespace is created. Workspace-boundary tests reject
both ancestors and descendants of the user-state root plus linked state
namespaces before interactive or evaluation tools. Migration tests prove exact
per-workspace relocation, preservation of version-one and version-two journals,
continued resume, unrelated-workspace isolation, live-lock and admission
rejection, dual-root conflict rejection, failed-rename preservation, and no
legacy fallback after success.

Composition coverage proves the native resolved home, not inherited home or
state-base environment text, selects the new root before provider composition.
Privacy, security, architecture, engineering, operator, maintenance, decision
index, documentation policy, removal guidance, and regression evidence change
with the implementation. The canonical Windows and Linux verifier remains the
final gate and performs no migration of real operator state.

## Update, rollback, and removal

Changing the root name, home authority, namespace inventory, legacy lookup,
migration unit, admission order, conflict behavior, rename semantics,
synchronization, or removal path requires this decision, decision 0076, the CLI
storage owner, privacy and security policies, operator and maintenance guidance,
documentation registries, and focused tests to change together.

Rollback first disables new journal creation and resume so an older executable
does not silently create a second authority. With every `agent` process closed,
the operator may move exact workspace digest directories back to the documented
legacy root only when the destination is absent. Rollback never merges roots,
rewrites journals, or guesses which copy is newer. Starting an older executable
before that explicit rollback is unsupported.

Complete session removal first closes every `agent` process, then deletes the
exact `~/.agent/sessions` directory. During the migration era, the operator also
deletes the former platform-state `agent/sessions` root to remove legacy
workspaces that have not yet been accessed. Removing sessions does not authorize
removal of the `.agent` root or any future sibling authority.
