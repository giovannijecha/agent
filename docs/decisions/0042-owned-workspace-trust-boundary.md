# 0042: Owned workspace trust boundary

- Status: accepted
- Date: 2026-08-13

## Context

`agent` gives one model access to bounded filesystem tools and one approved
process capability. Those adapters already reject absolute model paths, parent
traversal, symbolic-link crossing, unsupported file kinds, oversized data,
shell execution, ambient process environment, and uncontained descendants.
They do not yet form one complete statement of what the application may know,
send to a provider, approve, mutate, or execute.

Startup currently derives tool authority directly from the process working
directory. Individual handlers canonicalize that string independently, while
the footer shows only a basename-derived label. This permits no path escape, but
it leaves the selected authority implicit and does not prove that display,
filesystem tools, and process working directories share one immutable root.

The initial boundary also received its protected home and temporary roots from
Node's `homedir()` and `tmpdir()` helpers. Those helpers intentionally honor
environment variables. An operator or parent process can therefore move the
protection away from the effective user's real home or the platform temporary
root before `agent` starts. Canonicalizing a mutable answer does not make its
source authoritative.

Process-tree containment is also narrower than a machine sandbox. An approved
`node` program retains the launching user's filesystem and network authority
even though its environment, duration, output, descendants, and cleanup are
bounded. The product must describe that distinction before stronger isolation
is designed.

## Decision

Adopt one CLI-owned workspace trust boundary. It is the sole authority source
for workspace display, filesystem path resolution, process working-directory
resolution, future privacy policy, and future mutation effect plans.

The boundary is implemented in independent delivery tranches:

1. Resolve one canonical immutable workspace root before credentials, provider
   construction, runtime construction, tool registration, or interactive
   terminal ownership.
2. Add a fail-closed read-privacy policy with a small owned `.agentignore`
   grammar and built-in sensitive-path denial.
3. Prepare bounded immutable mutation effect plans, render their concrete
   effects, and bind each approval to the observed target state.
4. Preserve the explicit distinction between workspace authority,
   process-tree containment, and any later filesystem or network sandbox.

Acceptance of this decision does not claim that incomplete tranches already
exist. The initial change implements only tranche 1. Each later tranche requires
its own focused behavior, regression tests, documentation, rollback, and
reviewable commit.

## Threat model

The model and provider output are untrusted. Workspace names, paths, directory
entries, file contents, and filesystem errors may be hostile. A concurrent
local actor may replace a path after it was observed. The operator is the sole
source of write and execute approval, but approval is meaningful only when it
names the exact prepared effect. An approved child process is trusted only for
the explicitly approved invocation; it is not assumed to respect the workspace
boundary voluntarily.

The boundary does not defend against an operating-system administrator, a
compromised Node.js runtime, or arbitrary code already running with the same
user authority. Those remain platform and machine trust assumptions.

## Authority and precedence

| Layer | Authority | Denial rule |
| --- | --- | --- |
| Machine sandbox | Future operating-system filesystem and network isolation | Cannot be weakened by workspace or tool policy. |
| Workspace boundary | One canonical root and future read-privacy policy | Rejects paths or content before tool execution or provider context. |
| Tool schema and handler | One bounded capability and risk class | Cannot broaden the workspace or sandbox. |
| Effect plan | One immutable observed mutation and approval identity | Any stale observation conflicts before mutation. |
| Operator decision | One exact pending write or execute call | Never persists, aliases, or authorizes another effect. |
| Process containment | One approved terminating descendant tree | Governs lifecycle, not general filesystem or network access. |

Denial at an earlier or narrower layer wins. No approval, digest, model text,
provider response, tool result, or later layer may override it. Errors remain
content-free and do not reveal rejected paths, file contents, credentials, or
foreign causes.

## Canonical root lifecycle

The initial boundary uses the operator's exact startup working directory as its
candidate. It does not search upward for a Git repository or otherwise widen
authority automatically. A future explicit root-selection feature may narrow
the candidate, but it requires a replacing or amending decision and cannot
silently broaden it.

The CLI resolves the candidate through the operating system once. The result
must be an existing absolute directory. A filesystem volume root, the exact
user home directory, and the exact shared temporary directory fail closed as
over-broad session roots. A symbolic-link candidate may resolve only to its
canonical target; the alias is discarded. Invalid input, inaccessible paths,
unsupported file kinds, and unsafe roots return immutable content-free errors.

The accepted value is immutable and exposes only its canonical absolute root.
That same string is shown in the footer and passed to every built-in tool.
Handlers do not recanonicalize or replace the root. They continue to validate
each model-selected relative path, reject symbolic-link traversal, and verify
the selected target around reads. Root identity changes and stronger
handle-relative path operations remain part of the later stale-safe effect-plan
work.

Workspace resolution occurs before reading a provider credential. A rejected
root therefore cannot cause a key prompt, provider connection, runtime
construction, tool registration, alternate-screen entry, or model-visible
content. Startup emits one fixed diagnostic and exits nonzero.

## Trusted platform roots

The CLI obtains protected roots from one separately removable owned native
resolver before constructing the workspace boundary. It does not read or
inherit `HOME`, `USERPROFILE`, `TMPDIR`, `TMP`, `TEMP`, or any other process
environment value. On Linux, the resolver asks the operating-system account
database for the effective user's home and uses the platform shared temporary
root `/tmp`. On Windows, it asks the Known Folder API for the effective profile
and local application-data roots and derives the user's `Temp` directory from
that operating-system result. Unsupported platforms and architectures fail
closed.

The resolver is not a model-facing tool and never enters the runtime. Its
executable path is derived from the installed CLI package, it accepts no
arguments or input, launches without a shell and with an empty environment,
and has one fixed five-second completion deadline. It emits exactly one
versioned bounded binary frame. That frame contains only the two absolute roots
as strictly decoded UTF-8. Each path and the complete frame have fixed byte
limits; malformed, truncated, oversized, trailing, empty, relative,
control-bearing, duplicate, timed-out, or unsuccessful output is rejected with
one content-free error. Native diagnostics are discarded.

The Node adapter owns process launch and protocol validation; the existing
`WorkspaceBoundary` continues to own filesystem canonicalization and exact-root
denial. This separation keeps platform discovery independent of boundary
policy. Neither component may silently substitute an environment-derived or
hard-coded user home after discovery fails.

## Read privacy tranche

The future privacy tranche will apply before `read_file` returns content and
before `search_text` traverses or returns matches. Built-in sensitive-path rules
will deny common credential material independently of repository ignore files.
One optional `.agentignore` file will use an owned bounded grammar; no third-party
glob engine or complete `.gitignore` implementation is admitted. `.gitignore`
may provide evidence for a later design but cannot be the only secret boundary.

Denied content must not enter provider requests, tool results, transcript,
activity, notices, errors, logs, tests, or documentation. That tranche will
define exact rule precedence, traversal limits, update behavior, and removal
before implementation.

## Effect-plan tranche

The future mutation tranche will separate preparation from invocation. A
bounded immutable effect plan will include the canonical relative target, the
observed target identity or absence, a bounded content digest, and a bounded
concrete preview. `replace_text` will show its exact delimited change;
`create_file` will show a bounded new-file preview. Approval will name that plan,
not merely the original input sizes.

Invocation must revalidate the observed file, directory, symbolic-link state,
and content before any mutation. Replacement, rename, or content drift after
preparation returns `conflict` without applying the write. Multi-file atomic
patches remain outside this decision.

## Process containment and machine isolation

`run_process` continues to accept only the registered `node` token, literal
arguments, one workspace-relative directory, exact approval, fixed limits, and
the owned native whole-tree containment broker. The canonical workspace root
constrains only selection of the initial working directory. It does not prevent
approved JavaScript from addressing other filesystem paths or the network with
the user's operating-system authority.

No `restricted`, `networked`, or `full-access` profile is introduced here.
Filesystem and network sandboxing require a later platform decision with
Windows and Linux proofs, explicit degradation policy, resource limits,
approval presentation, tests, rollback, and removal. Unsupported isolation
must fail closed rather than being presented as active.

## Consequences

- Startup, footer, filesystem tools, and process working directories share one
  authoritative canonical root.
- Root selection is explicit and cannot widen itself through repository
  discovery.
- Over-broad roots fail before credentials or terminal ownership.
- Mutable inherited environment values cannot relocate the protected home or
  temporary roots.
- No new model-facing tool, provider, dependency, package, or TUI primitive is
  introduced.
- The full trust-boundary milestone remains incomplete until privacy and
  stale-safe effect-plan tranches are delivered.
- TUI density is an independent visual contract and is not changed by this
  security boundary.

## Rejected alternatives

- Keep passing `cwd()` as an ordinary string: display and execution would still
  lack one proven authority object.
- Use `homedir()` or `tmpdir()` as security authorities: their documented
  environment precedence lets inherited variables relocate the protections.
- Trust environment values only when they name existing directories:
  canonicalization proves identity, not authority, so an attacker-selected
  directory can still pass.
- Derive Windows profile paths from account-name strings or registry guesses:
  redirected and non-default profiles require the operating-system Known Folder
  contract.
- Automatically select the nearest Git root: walking upward can silently widen
  access beyond the directory chosen by the operator.
- Treat `.gitignore` as a secret policy: repository publication intent is not a
  complete provider-disclosure boundary.
- Describe process containment as a sandbox: descendant cleanup does not remove
  filesystem or network authority.
- Implement all tranches in one change: root selection, privacy parsing,
  approval semantics, and filesystem race resistance have independent failure
  and rollback contracts.
- Add an XML, path-policy, glob, or sandbox package: all admitted behavior
  remains owned and zero-dependency.

## Verification

Tranche 1 tests invalid candidates, files instead of directories, volume roots,
exact protected roots, symbolic-link canonicalization, immutable results,
content-free errors, one canonical tool-engine root, and exact footer display.
The platform-root amendment adds native protocol tests, malformed and bounded
output tests, adapter failure tests, and process-level startup regressions with
all relevant home and temporary environment variables redirected to unrelated
existing directories. Those regressions must still reject the actual
operating-system home and temporary roots before credential or TUI ownership.
Startup and built-in tool tests must continue to prove providerless behavior,
path containment, symlink denial, process working-directory containment, and
cleanup.

Later privacy and effect-plan changes add their own adversarial matrices before
they are described as current behavior. The canonical Windows and Linux gate
must pass for every tranche.

## Update, rollback, and removal

Changing root selection, platform discovery APIs, protocol, limits, protected-
root classes, resolution order, display, or tool consumption requires updating
this decision, native and startup tests, boundary tests, built-in tool tests,
architecture, manual, maintenance guidance, and ownership policy together. The
native resolver is rebuilt with the registered C17 and Clang toolchain on every
supported platform; generated binaries remain ignored.

The platform resolver can be rolled back independently only by replacing it
with another accepted environment-independent source for both protected roots.
Removal deletes its native sources, protocol decoder, Node launch adapter,
tests, generated-artifact registrations, and current-behavior documentation as
one change. Falling back to environment-derived roots is forbidden.

Rollback of tranche 1 removes the boundary module and its tests, restores the
prior raw-working-directory composition, removes current-behavior claims, and
retains this decision as historical evidence or replaces it explicitly. Do not
leave one tool or footer path on a separate root source.

Removing the complete workspace boundary requires first removing every
filesystem and process capability that consumes it, or replacing it with a
stronger accepted authority contract. Privacy rules and effect plans remain
independently removable only while their earlier denial guarantees are not
weakened silently.
