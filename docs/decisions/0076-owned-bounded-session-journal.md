# 0076: Owned bounded session journal

- Status: accepted
- Date: 2026-08-18
- Domain: architecture
- Supersedes: none
- Superseded by: none

## Context

Decision 0075 established one bounded branching conversation tree but left it
in process memory. Exiting the executable therefore discarded every settled
turn and forced an operator to restate the task after an interruption. Keeping
the tree useful across processes requires an owned persistence boundary without
turning the TUI into a session manager, persisting speculative model state, or
creating another controller.

The public executable also needs one unambiguous recovery form. A slash command
would act inside an already-created session and could conflict with its active
runtime, provider, permissions, and transcript. Recovery instead belongs to the
CLI composition root, before provider or tool construction.

This decision narrows the process-only persistence posture in decisions 0010
and 0075 after supplying the opt-in launch, privacy, filesystem, recovery,
schema, verification, and removal contracts those records required. It does
not replace their identity, tree, single-controller, or selection contracts.

## Decision

An explicit interactive `agent` launch creates one new durable local session
for the exact canonical workspace. `agent resume --latest` is the sole recovery
form and creates a new continuation from the newest inactive session for that
same workspace. Resume is not a TUI slash command. Redirected execution and
`agent --evaluation-receipt` create no session journal.

`@agent/core` owns a provider-neutral version-one codec for immutable settled
turn deltas. It has no Node or filesystem dependency and reconstructs the same
bounded conversation tree through normal append and selection validation.
`@agent/runtime` exposes one read-only settled-turn projection. `@agent/cli` is
the sole journal, state-directory, lock, recovery, transcript-restoration, and
launch owner. Journal append, active-node selection, model events, effects, and
terminal output all remain in the existing serialized controller.

Runtime stop returns cleanup truth independently from at most one immutable
checkpointed turn settled while shutdown owns event ordering. The CLI attempts
that turn's append before closing the journal. It records the exact node whose
append was attempted, so cleanup never retries a record already offered to the
journal and never replays its tools or effects.

The per-user state root is `%LOCALAPPDATA%\agent\sessions` on Windows and
`${XDG_STATE_HOME:-$HOME/.local/state}/agent/sessions` on POSIX systems. A
SHA-256 digest of the immutable canonical workspace path selects its directory;
the path itself is not stored. Each session directory contains:

- `journal.jsonl`, beginning with one exact versioned header followed by one
  exact record for every settled turn in insertion order;
- `head.json`, a replaceable versioned pointer to the selected node; and
- `lock`, the owning process identifier while that continuation is active.

Records use an original closed JSON shape. Structured values encode each kind
explicitly, including negative zero, and unknown fields or versions fail
closed. Every tool input and result is decoded against its own exact structured
value budget. A record is appended and synchronized only after the runtime and
CLI have accepted the complete settlement, including settlement delivered by
runtime stop. Completed turns retain their final
assistant message. Checkpointed cancellation retains the fixed cancellation
marker; checkpointed failure retains only its closed content-free failure code
beside already committed conversation entries. Streaming deltas, prospective
turns, drafts, selections in progress, tool activity presentation, notices,
permissions, provider credentials, provider/model selections, catalog results,
foreign causes, and evaluation receipts never enter the journal.

Resume validates the newest exact header, workspace digest, inactive lock,
complete record prefix, tree identities, bounds, presentation classifications,
and selected head before provider composition. An unterminated final line is
treated as an interrupted append and only that line is discarded with a visible
recovery notice. Corruption in the header, any earlier record, the head, or the
tree fails closed. No retry, schema guessing, partial migration, replay,
summary, tool execution, network request, provider selection, or permission
restoration occurs.

Resume never appends to the old directory. It creates a new locked continuation
whose header records only the prior random session identity, then seeds it with
the validated immutable tree and display projection. This preserves one writer
per journal and leaves the prior session inspectable. An active newest session
cannot be resumed. A stale process lock may be removed only after the operating
system reports that its exact process no longer exists.

## Bounds and security

The existing tree limit remains 128 settled turns, 256 provider-message units,
and 1,048,576 code units. One journal is at most 16,777,216 UTF-8 bytes. One
workspace retains at most 32 validated session directories and scans at most
64; before creating another, the oldest unlocked exact session directories are
removed until the bound is restored. Active sessions are never removed. A
limit, ambiguous lock, unexpected entry, unsafe relative removal target, or
storage failure stops creation or resume content-free.

Directories request owner-only mode `0700` and files request `0600` where the
platform honors POSIX modes. The journal is local personal content, not a
secret vault, encryption scheme, tamper-proof log, cross-device sync service,
or filesystem transaction. Host administrators, backup software, malware, and
other principals already authorized by the operating system may still read it.
No journal path is placed inside the workspace, sent to a provider, printed in
the TUI, or exposed to model-authored tools.

The CLI fixes the workspace and read policy before opening session state, then
restores the tree before provider credentials, tools, or terminal ownership.
The journal does not widen workspace authority or restore prior filesystem
state. An old tool result remains historical model context only; every new
effect observes, plans, and authorizes current state through its ordinary
contract.

## Verification

Core tests prove lossless codec round trips, branching identities, independently
bounded structured payloads, exact schemas, impossible parents, and invalid
active heads. Runtime and CLI tests prove that stop returns a checkpointed
settlement and that the controller appends it before journal close. The
controller's attempted-node marker prevents cleanup from retrying an append.
CLI tests also prove platform state-root resolution, workspace isolation,
bounded creation, active-lock rejection, exact append and head updates,
truncated-tail recovery,
corruption rejection, continuation lineage, cleanup, and transcript rebuilding.
One composition test proves that a real runtime settlement is journaled once
through the serialized controller and can be resumed.

Launch tests admit only `agent resume --latest` and reject missing, misspelled,
combined, or extra arguments. Documentation and publication policy tests bind
the durable-local posture, privacy disclosure, manual route, decision
registration, and removal instructions. The canonical Windows and Linux gates
remain required and run without credentials or network access.

## Update, rollback, and removal

Changing the root, workspace identity, schema, codec, record timing, recovery,
lock semantics, retained content, bounds, CLI grammar, or automatic removal
requires this decision, core codec, runtime projection, CLI owner, privacy and
security policies, manuals, executable registries, and contract tests to change
together. A new schema version requires an accepted migration decision; unknown
versions continue to fail closed until then.

Rollback first removes `agent resume --latest` from parsing and help, disables
new journal creation, and leaves existing directories untouched for explicit
operator removal. Then remove journal wiring from the serialized controller,
the CLI storage owner, runtime history projection, core codec, restoration
projection, tests, policies, and documentation. Never silently reinterpret or
delete an unsupported schema during rollback.

Complete removal follows the same order and then permits the operator to delete
the exact `agent/sessions` state root documented in `PRIVACY.md`. Removing a
workspace does not remove its external hashed session directory; deleting the
state root is the authoritative all-workspace cleanup.
