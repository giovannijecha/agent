# 0050: Owned minimal coding capability surface

- Status: accepted
- Date: 2026-08-14
- Permission amended by: decision 0055

Decision 0055 changes authorization without changing this six-domain inventory:
every exact tool has one session mode and every runtime request receives one
turn-and-call decision.

## Context

The first admitted tool harness deliberately exposed six narrow capabilities:
three read tools, two mutation tools, and one process tool. That surface proved
structured calls, exact permissions, bounded execution, workspace read privacy,
and handle-relative mutation commits. Maintained task evaluation now provides a
repeatable way to distinguish model failures from missing capabilities.

The initial names are not the intended permanent decomposition. `create_file`
and `replace_text` split one text-mutation lifecycle while neither can express a
multi-hunk edit. The read tools are intentionally conservative but lack bounded
range, depth, and filtering controls that can avoid repeated calls. Conversely,
adding a separate tool for every filesystem verb, executable, or shell dialect
would increase descriptor selection errors, approval inconsistency, duplicated
policy, and removal cost.

Process execution has a separate tension. An unrestricted shell is concise, but
its command language combines executable discovery, parsing, expansion,
redirection, pipelines, control flow, and multiple partial effects behind one
string. Whole-tree containment from decisions 0016 and 0036 proves lifecycle
cleanup; it is not a filesystem, credential, or network sandbox. Naming a tool
`shell` cannot turn that containment into a sandbox or make a compound command
truthful to approve.

## Decision

The permanent model-facing harness targets six non-overlapping authority
domains:

1. `read_file` reads one bounded regular text file and may expose bounded range
   and line metadata.
2. `list_directory` discovers bounded workspace structure and may expose an
   explicit bounded depth.
3. `search_text` performs bounded textual discovery with explicit closed match
   and file-selection controls.
4. `apply_patch` owns creation and update of regular UTF-8 text through one
   exact, bounded, approval-bound patch plan. It does not remove paths.
5. `manage_path` owns explicit directory creation, move, and removal namespace
   operations. Each operation has one closed input shape and one exact authorization.
6. One execute capability owns terminating external work. During the structured
   phase its canonical name remains `run_process`.

This is now the exact permanent advertised inventory: `read_file`,
`list_directory`, `search_text`, `apply_patch`, `manage_path`, and
`run_process`. The three read domains, text-patch domain, namespace domain, and
execute domain do not overlap. Any future replacement changes one authority
domain atomically and leaves no old alias or dormant implementation.

The execute domain uses one CLI-owned closed program registry. A registered
entry owns one canonical token, exact executable resolution, supported
platforms, argument grammar, fixed non-model inputs, environment policy,
limits, approval projection, failure mapping, tests, rollback, and removal. The
model never selects an executable path, `PATH`, environment, standard input,
resource limit, containment option, or unregistered token. Unknown programs and
arguments fail before approval. Registration is capability admission, not a
convenience alias.

The first migration phase changes no authority: it moves the existing exact
`node` token and absolute current-Node mapping into one independently tested
CLI-owned registry. The descriptor and handler consume that same authority, so
the token cannot drift between schema validation and execution. Later program
entries require evidence from maintained coding evaluations and a change to
this decision and decision 0036. Inline interpreter modes, package-script
indirection, and programs that perform their own executable discovery require
explicit argument and governing-file policies; a nominally registered parent
does not automatically authorize every mode it can launch.

## Shell and sandbox boundary

No unrestricted shell is admitted by this decision. `bash -c`, `sh -c`,
PowerShell command text, `cmd /c`, interactive shells, inherited startup files,
and model-provided shell input remain outside the product contract.

A future shell may occupy the one execute slot only after a separate accepted
decision and adversarial Windows and Linux proof establish an actual sandbox.
That proof must bound the workspace view, writable paths, credential and host
filesystem visibility, network authority, executable discovery, environment,
standard input, resources, descendants, cancellation, controller loss, output,
and cleanup. The approval must bind the exact program or script evidence that
the sandbox executes. Unsupported hosts fail closed, and platform behavior may
not silently weaken.

If that contract preserves structured one-shot execution, the sandbox may
replace the backend and registry policy behind `run_process`. If it introduces
a genuinely different public command-language contract, `shell` replaces
`run_process` atomically. The harness never advertises both overlapping execute
tools. Until the proof exists, commands outside the closed registry remain
operator work or motivate a reviewed registry addition.

## Bounds, failures, and lifecycle

Every target tool retains the existing tool-engine batch bound, sequential
provider order, just-in-time planning, and one exact runtime decision for each
request. Consolidation cannot create a multi-file transaction, hidden task
queue, persisted permission, background worker, or second agent.

Read improvements remain subject to the immutable workspace read policy and
must reduce rather than bypass bounded traversal. Patch and namespace tools
must retain canonical workspace paths, stale-state rejection, owned native
commit semantics, content-free infrastructure failures, and one complete
effect per approval. Execute entries retain whole-tree containment and the
fixed process, time, argument, and output limits unless a later decision
replaces them with equally closed limits.

Invalid operation variants, unsupported registry tokens, disallowed argument
forms, stale plans, absent sandbox primitives, and platform divergence fail
closed before effects. A normal nonzero program exit remains an observed tool
outcome. No fallback may reinterpret a rejected structured request as shell
text or ask another tool to emulate the denied authority implicitly.

## Verification

Each migration phase includes descriptor and schema tests, handler or planner
contract tests, approval projection tests, platform adversarial tests where an
effect crosses the CLI boundary, provider serialization tests, activity
presentation coverage, exact manual inventory updates, and the complete
canonical Windows and Linux gates.

The first phase specifically proves that the registry accepts only one absolute
NUL-free Node executable, resolves only the exact lowercase `node` token, and
is the single mapping consumed by `run_process`. It also proves that the public
descriptor inventory and runtime behavior are unchanged.

Maintained task evaluation measures whether range reads, bounded discovery,
patching, namespace operations, or additional registered programs remove
observed tool constraints. Evaluation evidence never auto-registers a tool or
weakens approval and sandbox requirements.

Decision 0051 completes the first `read_file` range-projection phase under the
existing descriptor. It adds optional bounded inputs and exact result metadata,
not another capability or filesystem authority.

Decision 0053 completes the text-mutation convergence phase. The final registry
replaces `create_file` and `replace_text` with one structured `apply_patch`
descriptor while retaining the two internal native commit primitives behind one
approved effect plan.

Decision 0054 completes namespace-mutation convergence. The final registry adds
one `manage_path` descriptor for create-directory, move, and nonrecursive
file-or-empty-directory removal through a separate approved native committer;
every supported successful effect is one object-bound namespace commit.
Decision 0058 makes platform capability explicit: Windows supports all three
operations, while Linux retains verified-parent directory creation and fails
move or remove closed before namespace observation.

## Update, rollback, and removal

Change the target inventory only when a capability has distinct necessity,
closed authority, focused evaluation evidence, and independent removal. Update
this decision, decision 0014, affected security decisions, manual inventory,
architecture, engineering guidance, maintenance guidance, schemas, tests, and
platform proofs together with the behavior.

Roll back a migration by restoring the previous canonical descriptor before
removing the replacement implementation. Never retain dormant aliases,
registries, schema variants, native backends, or documentation for an absent
capability.

To remove program registration while retaining process execution, first reduce
the descriptor schema and approval projection to the remaining exact tokens,
then remove the entry, resolver, policy, and focused tests. To remove process
execution, follow decision 0036.

To remove this inventory decision entirely, first record a new permanent
inventory decision covering every remaining authority domain, update its exact
manual and policy records, and only then delete this decision. Never infer a
fallback inventory or keep an unadvertised registry or backend.
