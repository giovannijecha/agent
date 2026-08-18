# 0073: Owned capability-complete shell execution

- Status: accepted
- Date: 2026-08-18
- Domain: tools
- Supersedes: 0036
- Superseded by: none

## Context

The registered `run_process` tool can launch only the current Node executable.
That proves bounded process lifecycle and structured approval, but it cannot
perform ordinary coding work such as invoking Git, npm, a compiler, a linter,
or a project-owned verification command. Adding every executable to a growing
registry would leave the model dependent on repository-specific admission and
would still omit composition, redirection, and pipelines.

The native broker already owns the important lifecycle boundary: it places the
complete target tree in a Windows Job Object or delegated Linux cgroup before
execution, bounds time, process count, output, cancellation, controller loss,
and cleanup, and reports only closed failures. That boundary is containment,
not a filesystem or network sandbox. A truthful full shell must expose that
host authority rather than imply isolation it does not provide.

## Decision

The one execute capability is named `shell`. It atomically replaces
`run_process`; the model-facing inventory never advertises both. Its input is
exactly one `command` string and one workspace-relative `workingDirectory`.
Every call has `execute` risk and binds permission to those two exact values.
The shell, executable path, arguments, environment, limits, containment, and
standard input are fixed by the CLI and cannot be selected by the model.

Where earlier accepted records name `run_process`, this decision replaces only
that execute-tool name, schema, preview, and executable-selection contract.
Their remaining workspace, permission, presentation, evaluation, and
serialization contracts continue unchanged unless this decision says
otherwise.

On Linux the target is `/bin/bash --noprofile --norc -c <command>`. On Windows
the CLI sends one reserved broker program identity; the native broker resolves
the operating-system Windows PowerShell executable below the directory returned
by `GetWindowsDirectoryW`, then starts it with `-NoLogo`, `-NoProfile`,
`-NonInteractive`, and `-Command`. Inherited environment values never select or
verify that executable. A fixed prelude selects strict UTF-8 console and
pipeline encoding before the approved command. No user or system shell profile
is loaded.

The target receives a bounded environment projected from the launching
process. Linux admits only `PATH`, `HOME`, `TMPDIR`, `LANG`, and `LC_ALL`.
Windows admits only `Path`, `PATHEXT`, `TEMP`, `TMP`, `USERPROFILE`, `HOME`,
`APPDATA`, and `LOCALAPPDATA`; the native broker adds the authoritative
`SystemRoot`. Missing optional values remain missing. Names and values are
validated, conflicting platform-case aliases fail closed, and the provider
credential `AGENT_OLLAMA_API_KEY` is never admitted. The model cannot add,
remove, or override environment entries.

The command may use every capability provided by the selected native shell and
the projected `PATH`, including Git, npm, compilers, project scripts, pipelines,
redirection, and shell control flow. This is intentional host-full execution:
after approval, child code retains the launching user's filesystem and network
authority. The canonical workspace fixes the initial working directory but is
not a filesystem sandbox. Operators must inspect the complete command before
granting it.

Each call remains one terminating one-shot execution. Standard input is closed;
background services, retained process handles, interactive programs, implicit
retry, detached work, and model-selected limits remain unsupported. The fixed
limits remain 120,000 milliseconds, 16 processes, and 65,536 bytes each of
standard output and standard error. Command and working-directory text remain
valid Unicode scalar text without NUL, bounded to 2,730 UTF-16 code units and
8,192 UTF-8 bytes each. Output must be valid UTF-8. Exit zero succeeds; a normal
nonzero exit is a checkpointed failed tool outcome with bounded output.

The broker protocol advances to version 2 and carries a bounded ordered
environment vector in addition to program identity, working directory, and
literal arguments. TypeScript and C independently validate the complete frame.
Linux passes the explicit null-terminated vector to `execve`. Windows resolves
the reserved shell identity and constructs one Unicode environment block from
the explicit vector and its broker-owned `SystemRoot`. No parent environment is
inherited implicitly.

This decision changes only the execute domain. Model turns, permission
decisions, handlers, mutations, terminal output, and tool checkpoints remain
serialized. Selective read-only overlap and conversation-tree persistence need
their own accepted decisions and cannot be smuggled into shell execution.

## Security and privacy contract

Approval grants the exact command the host authority described above; process
containment guarantees termination and cleanup, not path or network isolation.
The shell does not receive the provider credential or an unfiltered parent
environment. Command text and bounded output become conversation tool truth;
environment values, executable paths, native causes, broker diagnostics, and
process identifiers do not.

Cancellation, timeout, output overflow, unsupported platform, missing shell,
invalid environment, malformed protocol, containment failure, launch failure,
monitor failure, and incomplete cleanup fail closed. A rejected or failed call
is never retried, translated to another shell, or replayed implicitly.

## Verification

Descriptor tests prove the exact `shell` schema, inventory, risk, approval
projection, and absence of `run_process`. Platform-policy tests prove fixed
shell selection, fixed arguments, UTF-8 setup, environment allowlists,
credential exclusion, bounds, duplicates, and unsupported hosts. Handler tests
prove canonical working-directory resolution and exact runner requests.

Protocol and native tests prove version-2 framing, malformed and oversized
environment rejection, exact target environment, shell command execution,
nonzero exits, output separation, timeout, cancellation, process storms,
controller loss, descendant cleanup, and unrelated-process isolation on both
Windows and Linux. The canonical verifier remains offline and uses no provider
credential.

## Update, rollback, and removal

Changing shell identity, fixed arguments, environment policy, approval fields,
limits, output contract, platform support, broker protocol, or containment
requires this decision, architecture, manual, security and privacy contracts,
maintenance guidance, policy registries, and focused tests to change together.

Rollback restores `run_process`, its closed Node registry, protocol v1, tests,
and documentation in one reviewed revision; it never advertises both execute
tools. Removal first deletes `shell` from the descriptor and permission
inventory, then its planner, platform policy, tests, and broker integration.
The native containment broker may be removed last if no remaining capability
uses it.
