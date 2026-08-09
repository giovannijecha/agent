# 0015: Fail-closed process-tree containment

- Status: accepted
- Date: 2026-08-08
- Supplemented by: decision 0016, which adds the private proof architecture

## Context

Decision 0008 defers direct process execution until the project can terminate
an entire descendant tree on Windows and Linux. Terminating only the immediate
child is insufficient: descendants may retain output pipes, ignore cooperative
signals, detach from a process group, fork while cancellation is in progress,
or outlive the controller after an abrupt failure.

The current product boundary is original Node.js and TypeScript code in
`@agent/cli`, with no third-party runtime packages or native executable. The
feasibility review therefore evaluated only documented operating-system and
Node.js primitives that this boundary can use truthfully.

Node.js documents that `subprocess.kill()` signals the child and that Linux
grandchildren may survive. On non-Windows platforms, `detached: true` creates a
new process group and session; a descendant can create another session with
`setsid()` and leave that group. On Windows, `detached: true` provides an
independent console and lifetime rather than a containment object.

Windows Job Objects provide the required kernel-managed, inheritable process
container when neither breakaway limit is enabled. Linux cgroup v2 provides the
equivalent tree boundary when a writable subtree is securely delegated;
`cgroup.kill` kills the subtree while accounting for concurrent forks and
migrations. Linux can operate that delegated filesystem through Node.js, but
delegation is not available on every host. Windows Job Object ownership is the
native capability missing from the public Node.js process API. `taskkill /T`
and process-group signalling are termination operations over discovered
membership, not no-breakaway containment boundaries.

The platform facts are documented by:

- [Node.js 22.19 child processes](https://nodejs.org/download/release/v22.19.0/docs/api/child_process.html)
- [Windows Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Windows `taskkill`](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill)
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Linux `kill(2)`](https://man7.org/linux/man-pages/man2/kill.2.html)
- [Linux `setsid(2)`](https://man7.org/linux/man-pages/man2/setsid.2.html)

## Decision

`run_process` remains blocked. The present pure Node.js platform boundary lacks
Windows Job Object ownership and cannot provide the required guarantee across
both supported operating systems; Linux support is additionally conditional on
a securely delegated cgroup v2 subtree. The project will not substitute process
enumeration, repeated PID kills, `taskkill /T`, shell wrappers, or Unix process
groups for containment, and it will not silently degrade when a required
platform capability is unavailable.

No process runner, native helper, compatibility shim, descriptor, handler, or
approval preview is added by this decision. The verified manual policy records
the blocked capability separately from the advertised tool surface. This makes
accidental admission a release-gate failure without presenting a speculative
tool to the model.

Future admission requires a replacing implementation decision and all of the
following evidence:

1. Windows places the target in a Job Object before target-controlled code can
   run, either through inheritance from an already-contained private spawner or
   create-suspended, assign, and resume. Neither `BREAKAWAY_OK` nor
   `SILENT_BREAKAWAY_OK` may be enabled. A non-inherited owning handle uses
   `KILL_ON_JOB_CLOSE`; the backend terminates the complete job, observes it
   empty, proves owner-loss behavior, and fails closed when an outer job or
   platform policy prevents the required containment.
2. Linux requires a securely delegated cgroup v2 subtree, places the target
   inside it before target-controlled code can spawn, prevents migration out,
   terminates it with `cgroup.kill`, observes `populated 0`, and defines
   recovery after abrupt controller loss. Missing delegation or kernel support
   fails closed.
3. No platform invokes a shell or accepts a command string. Program, argument
   vector, workspace-relative directory, and a fixed owned environment are
   distinct validated values. Model-controlled environment variables are
   forbidden.
4. Timeout, user cancellation, output overflow, launch failure, controller
   shutdown, and cleanup have bounded terminal states. Standard output,
   standard error, inherited descriptors, handles, process containers, and
   helper lifetimes are closed and observable.
5. Windows and Linux tests cover immediate descendant spawning, at least five
   generations, parent exit, signal refusal, concurrent spawning during
   termination, detached or new-session descendants, inherited output pipes,
   excessive output, cancellation at launch, timeout, repeated cleanup, and
   unavailable containment. A test must also prove that unrelated processes
   cannot be selected through PID reuse.
6. The implementation, compiler inputs, binary artifacts, provenance,
   platform matrix, update, rollback, and complete removal path are owned and
   registered before a native component may ship.

Passing only cooperative-child tests is not sufficient. Evidence must exercise
the platform backend actually distributed to users and must run on the matching
Windows and Linux verification environments.

## Consequences

The model-facing harness remains smaller and no unsafe execution authority is
introduced. Filesystem tools, runtime checkpoints, approvals, and the TUI are
unchanged. The current Windows-only verification workflow also remains
unchanged because there is no cross-platform process backend to validate yet.

Decision 0016 accepts an owned native Windows broker and delegated-cgroup Linux
backend as private proof infrastructure, with the required compiler, lifecycle,
capability, crash-recovery, and platform-verification boundaries. It does not
replace this decision's model-facing block. A structured tool, approval surface,
and production composition still require a later replacing admission decision.

## Update, rollback, and removal

Update this decision when a documented platform primitive, Node.js API, or
approved owned backend changes feasibility. Re-run the adversarial proof rather
than inferring safety from platform names or cooperative examples.

To attempt admission, first accept the replacing architecture and its complete
test contract, then implement the private containment backend, run the platform
matrix, and only afterward add `run_process` to the tool inventory. Any failed
case restores the blocked state before release.

To remove the proposed capability permanently, delete its blocked-policy record
and blocked-registry validation, remove the related manual text, update
decisions 0008 and 0014, remove this decision from the ownership registry, and
run the canonical verifier. No production code depends on this decision.
