# 0036: Owned structured process execution

- Status: accepted
- Date: 2026-08-11

## Context

The agent needs one bounded way to run a program for coding work. The native
process broker specified by decision 0015 and proven by decision 0016 already
demonstrates complete descendant containment on Windows and Linux, but it was
deliberately unavailable to the model until the product contract, approval
surface, failure semantics, and removal path were complete.

A shell command, PATH lookup, inherited environment, or arbitrary executable
path would create several overlapping tools and would make the displayed
approval differ from the operation enforced by the platform. The capability
must also preserve the single-agent doctrine: the model may request work, but
it cannot create another agent, controller, or persistent worker.

## Decision

The initial product surface adds exactly one tool named `run_process`. Its
structured input contains `program`, `arguments`, and `workingDirectory`.
`program` is an exact token enforced by an owned literal-string schema; the
initial registry has only `node`, resolved internally to the current Node
executable. `arguments`
is an ordered list of literal strings. `workingDirectory` is a
workspace-relative existing directory resolved through the same canonical,
no-symlink boundary as the file tools.

Decision 0050 centralizes that exact current mapping in one CLI-owned
`ProcessProgramRegistry`. The descriptor's literal token and the handler's
absolute executable resolution consume the same authority. This structural
change admits no additional token or argument form. Any future registry entry
changes this decision and decision 0050 together.

The model cannot provide a command string, shell, executable path, PATH,
environment variable, standard-input content, containment option, timeout, or
resource limit. Linux targets receive an empty environment. Windows targets
receive exactly one `SystemRoot` value obtained by the native broker through
the operating system API; they inherit no user environment. This minimum
bootstrap is required for the registered Node executable to initialize its
cryptographic subsystem. The broker is started without a shell and launches
the registered executable directly.
Every invocation has `execute` risk and requires one exact, single-use
approval over the program token, complete ordered argument list, and working
directory. The approval shown to the operator is therefore the operation
encoded for the broker.

Production limits are fixed by the application: 120,000 milliseconds, 16
processes in the contained tree, 65,536 bytes of standard output, 65,536 bytes
of standard error, and 64 arguments. Each model-provided argument and the
relative working directory are limited to 2,730 UTF-16 code units and 8,192
UTF-8 bytes, must contain valid Unicode scalar text, and cannot contain NUL.
The complete exact approval projection is limited to 8,192 UTF-16 code units
before any handler or broker invocation begins.
Program output must be valid UTF-8. A normal nonzero exit is an observed,
recoverable failed tool outcome rather than an infrastructure failure. It
returns `outcome`, `exitCode`, `stdout`, and `stderr`, is checkpointed, and lets
the same model loop diagnose the command without repeating an external effect.
Exit code zero is a successful tool outcome. Cancellation, timeout, output overflow,
unsupported platform, containment failure, launch failure, malformed broker
traffic, and incomplete cleanup remain typed, content-free tool failures.

The existing C17 broker remains the sole platform boundary. Windows uses one
Job Object with kill-on-close. Linux uses the already verified delegated
cgroup-v2 containment. Both assign the target before it can execute, keep the
controller outside the target containment, and terminate the complete target
tree on timeout, cancellation, controller loss, or cleanup. Product support is
limited to x64 Windows and x64 Linux; every other platform fails closed.

The runtime continues to execute one admitted tool call at a time. An ordered
model tool batch may contain several `run_process` calls, but it does not
introduce agents, hidden task queues, persistent approvals, background
processes, or model-controlled parallelism. Future mechanical parallelism
requires a separate decision and must retain one controller and the same
containment contract.

`run_process` is a bounded one-shot capability for terminating commands. It
does not detach, retain, or manage a background process after the tool settles.
A persistent development server requires a separate explicit lifecycle
contract rather than weakening containment or allowing a hidden worker.

## Bounds, failures, and lifecycle

The Node adapter owns one broker subprocess per invocation. It sends exactly
one launch frame and at most one cancellation frame, incrementally validates
all status frames, and separately bounds target stdout, target stderr, and
broker status. Broker diagnostics are drained without retention; diagnostics
and native causes are never returned to the model or rendered to the operator.
The adapter observes the broker control-input channel from spawn through its
first failure or close. A close racing a launch or cancellation write is
reduced through the same invocation state instead of escaping as an unhandled
stream error.

The adapter observes target output while the broker enforces the tree timeout
and process count. Output overflow requests cancellation and returns `limit`.
An operator or runtime cancellation requests broker cancellation and returns
`cancelled`. Timeout returns `limit`. Unsupported host capability returns
`unsupported`; launch, protocol, monitor, or cleanup failure returns `io`.
An asynchronous control-input failure preserves an already recorded failure,
such as output `limit`; otherwise it records `io`. In every case the adapter
still waits for broker settlement, so the channel failure cannot claim
target-tree cleanup that the broker did not prove.
The broker remains responsible for proving target-tree cleanup before it
reports completion.

## Verification

Pure protocol tests cover exact encoding, fragmented status frames, malformed
lengths, unknown kinds, duplicate terminal states, and incomplete streams.
Adapter tests exercise exact arguments, the platform-owned target environment,
real Node cryptographic initialization, working directory, stdout and stderr
separation, nonzero exits, timeout, cancellation, overflow, unsupported
registry tokens, malformed broker output, controller failure, and a broker
control-input close racing cancellation. Tool tests prove the schema, exact
approval preview,
workspace boundary, handler mapping, and absence of command-string or
environment fields. The existing native Windows and Linux containment suite
continues to prove descendant cleanup, process storms, controller loss,
detached descendants, cancellation races, and unrelated-process isolation.
The canonical Windows and Linux verifier remains the release gate.
Focused registry tests reject relative or NUL-bearing executable mappings and
resolve only the exact lowercase `node` token.

## Update, rollback, and removal

Changing the program registry, input fields, approval projection, limits,
failure mapping, output contract, platform support, native protocol, or
containment implementation requires this decision, manual, architecture,
security policy, ownership policy, conformance tests, and native tests to
change together.

To remove process execution, first remove `run_process` from the CLI registry
and provider-visible tool descriptors. Then remove its handler and Node broker
adapter, remove the program registry and admitted manual inventory entry, and
finally remove the native
product build only if no proof or future platform work still uses it. Core,
runtime, provider transport, file tools, TUI, and terminal lifecycle remain
independently usable. Rollback is the same sequence and must leave the tool
absent before any implementation layer is removed.
