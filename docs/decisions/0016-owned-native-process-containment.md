# 0016: Owned native process-containment proof

- Status: accepted
- Date: 2026-08-09

## Context

Decision 0015 correctly blocks `run_process` until the project proves complete
descendant containment on Windows and Linux. Node process groups, PID discovery,
and `taskkill /T` cannot establish a no-breakaway boundary. The missing unit is
therefore a private platform primitive, not a model-facing tool.

The repository permits external compilers as toolchain substrate but forbids
third-party source, native libraries, SDKs, helper executables, copied snippets,
and committed generated binaries. The implementation must preserve the same
ownership, boundedness, testability, update, rollback, and removal standard as
the TypeScript packages.

## Decision

Add one private process broker owned by `@agent/cli` and authored in C17. Common
modules own its binary protocol and lifecycle entry point. Separate Windows and
Linux modules own only their operating-system containment mechanism. The broker
uses documented operating-system APIs and the C standard library; it links no
project or vendor runtime library.

The broker is proof infrastructure only. Production TypeScript does not spawn
it, no descriptor advertises it, and `run_process` remains in the blocked tool
inventory. A later decision may admit a model-facing adapter only after this
platform matrix is green and the structured input, approval preview, workspace
path, output, privacy, and checkpoint contracts have been reviewed separately.

Clang 18 or newer is registered as external build substrate. Source is compiled
on the matching Windows x64 or Linux x64 host. Generated broker and fixture
binaries live only under `packages/agent-cli/.native-build/`, are deleted by the
owned cleaner, and are never committed.

## Controller protocol

The controller starts the broker directly with no shell. Standard input carries
controller commands and standard output carries broker status. Standard error
is reserved for content-free broker diagnostics. File descriptors 3 and 4 carry
target stdout and stderr independently.

Every command and status is a versioned, little-endian binary frame with a
four-byte magic, version, kind, zero reserved bytes, and bounded payload length.
The launch payload contains only:

- timeout in milliseconds;
- maximum target processes;
- exact UTF-8 executable path;
- exact UTF-8 working directory;
- a bounded UTF-8 argument vector.

Strings reject malformed UTF-8 and embedded NUL. There is no command string,
shell syntax, environment map, ambient configuration, or persistent approval.
The target receives a fixed empty environment and null standard input.

The broker emits `started`, then exactly one `finished` status for normal exit,
cancellation, or timeout. Capability, containment, launch, monitor, cleanup, and
protocol failures use stable numeric categories and retain no path, argument,
output, or operating-system error text. Closing the controller command pipe is
cancellation. A terminal status is valid only after the kernel container is
observed empty.

Linux containment failures may also write a fixed numeric setup-stage marker to
the diagnostic channel. The marker contains no operating-system error, path,
argument, output, process identity, or environment content.

Protocol frames are limited to 65,536 bytes, strings to 8,192 bytes, arguments
to 64, timeouts to 1 through 600,000 milliseconds, and target process limits to
1 through 64. The conformance controller stores at most 65,536 bytes from each
target output by default. On overflow it requests cancellation and continues to
drain and discard until termination, preventing retained output from exceeding
the owned bound.

## Windows backend

The Windows backend creates a private Job Object with
`KILL_ON_JOB_CLOSE` and an active-process limit. Neither breakaway flag is set.
A completion port is associated before target creation. The target is created
suspended with an empty Unicode environment and an explicit inherited-handle
list containing only null input and the two target output pipes. It is assigned
to the job before its first instruction is resumed.

Program and arguments remain separate through validation. The backend owns the
required Windows argument-vector quoting and passes the executable separately to
`CreateProcessW`; it never delegates quoting to a shell. Cancellation and
timeout terminate the job, and completion is reported only after active process
count reaches zero. If assignment fails, the still-suspended process is
terminated directly. Closing the broker closes the sole owning job handle, so
abrupt broker loss invokes kernel cleanup.

## Linux backend

The Linux backend requires cgroup v2 with `pids` and `cgroup.kill`, `clone3`
with `CLONE_INTO_CGROUP`, pidfds, and unprivileged user, mount, PID, and cgroup
namespaces. It never degrades to process groups or discovered PIDs.

The controller must already run in an exclusively delegated `control` cgroup
with an empty, user-owned sibling named `runs`. The delegatee must also have
write access to the common parent's `cgroup.procs`; cgroup v2 requires that
permission in addition to destination access when `CLONE_INTO_CGROUP` crosses
from `control` into a run leaf. The broker discovers this relationship from
`/proc/self/cgroup`, creates a random run leaf, sets `pids.max`, opens the leaf,
and clones a trusted namespace guard directly into it before any target code
can run.

The guard is PID 1 in the new PID namespace and is linked to broker death with
`PR_SET_PDEATHSIG(SIGKILL)`. It waits for the parent to install one-entry UID and
GID maps, then creates its cgroup namespace while already resident in the run
leaf. This ordering makes the run leaf the cgroup-namespace root and makes the
cgroup namespace owned by the mapped user namespace. The guard replaces
`/proc`, makes mount propagation private, creates a detached read-only cgroup v2
mount through Linux's file-descriptor mount API, and attaches it over the
inherited host mount at `/sys/fs/cgroup`. A mount namespace owned by the new
user namespace cannot detach individual mounts inherited as a locked unit from
the more privileged host namespace; the new top mount instead exposes the
cgroup-namespace root without a global temporary mount point. The guard then
sets `no_new_privs`, drops ambient, bounding, permitted, effective, and
inheritable capabilities, and forks the target. The trusted guard never
executes target code. It reaps all orphaned descendants and exits only after the
namespace has no child processes. Target code cannot disable the guard's
parent-death signal or become the outer namespace's PID 1.

The broker kills the run leaf through `cgroup.kill`, observes `populated 0`,
reaps the guard through its pidfd, and removes the empty leaf before reporting a
terminal state. Abrupt broker loss kills the guard, and Linux PID-namespace
semantics then kill every remaining member. An empty cgroup directory may remain
after abrupt broker death; the delegated owner may remove that empty artifact,
but no process can remain inside it.

The product never elevates. The owned GitHub Linux job uses `sudo` only in a
pre-verification bootstrap to create the disposable CI subtree, delegate the
`runs` hierarchy and the common-parent process-migration file, and in its
cleanup to remove the subtree. Ubuntu 24.04 restricts unprivileged
user-namespace capabilities through AppArmor by default, so the same bootstrap
verifies that exact default, temporarily disables only that user-namespace
restriction for the isolated proof, and restores it during cleanup. Broker,
fixture, harness, and tests run as the unprivileged runner user. Missing
delegation, namespace policy, cgroup controller, kernel operation, or cleanup
evidence fails the Linux job closed.

The runner policy is documented in the
[Ubuntu 24.04 release notes](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions).

## Verification contract

The exact owned workflow runs matching Windows 2025 and Ubuntu 24.04 jobs. Each
uses a small platform-native wrapper for the same ordered release gate. Both
compile source with C17, warnings as errors, stack protection, and platform link
hardening, then run the same protocol conformance suite. The suite covers exact
arguments, empty environment, working directory, stdout/stderr separation,
nonzero exit, malformed protocol, launch failure, cancellation, controller
loss, timeout, output overflow, process limits, nested descendants, detached or
new-session attempts, signal refusal, parent exit, concurrent spawning during
termination, inherited output pipes, broker loss, and proof that recorded
contained PIDs are gone without selecting an unrelated process. Linux fixtures
record the outermost `NSpid` value so post-termination probes address the host
process rather than a PID-namespace-local number.

No test is skipped when the platform job is admitted. Failure to prepare the
Linux delegation is a failed proof, not an unsupported skip. Local Windows
verification exercises Windows only; Linux evidence is authoritative only from
the registered Linux job.

## Consequences

The repository gains a native compiler input and a conditional Linux deployment
requirement, but no model-facing authority. Core, tools, runtime, TUI, command
handling, approvals, and production startup are unchanged. The private boundary
can be reviewed and removed independently from the existing filesystem tools.

The trusted native surface is intentionally small: one strict frame decoder,
one entry point, two platform backends, one native fixture, one build driver,
one controller harness, and one cross-platform test suite. Platform code does
not share conditional branches beyond the common contract.

## Update, rollback, and removal

Update the protocol only by increasing its version, updating both backends and
the controller together, adding backward-incompatibility tests, and replacing
this decision. Do not retain a dormant compatibility decoder. A compiler,
kernel, runner, cgroup, Job Object, or namespace change requires rerunning the
complete matching platform proof.

Roll back by removing the private broker composition from the verifier, restoring
the previous one-platform CI policy and toolchain registry, deleting native
generated output, and restoring decision 0015 as the sole process-containment
record. `run_process` remains blocked throughout rollback.

To remove the proof, delete `packages/agent-cli/native/process-broker`, the
native build driver, controller harness, platform tests, Linux CI bootstrap,
native cleaner and verifier registrations, compiler registry entry, this
decision, and the Linux verification job. Restore the process-blocking text to
decision 0015 only and verify that every TypeScript package and the providerless
CLI still build unchanged.
