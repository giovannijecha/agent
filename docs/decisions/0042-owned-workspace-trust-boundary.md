# 0042: Owned workspace trust boundary

- Status: accepted
- Date: 2026-08-13
- Amended: 2026-08-14 by decision 0046 for owned handle-relative mutation
  commit

## Context

`agent` gives one model access to bounded filesystem tools and one approved
process capability. Those adapters already reject absolute model paths, parent
traversal, symbolic-link crossing, unsupported file kinds, oversized data,
shell execution, ambient process environment, and uncontained descendants.
Before the privacy tranche, they did not form one complete statement of what
the application may know, send to a provider, approve, mutate, or execute.

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
resolution, read privacy, and mutation effect plans.

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

Tranches 1 and 2 are complete. Decision 0046 completes tranche 3 by placing one
owned Windows/Linux handle-relative native committer behind the existing
concrete stale-safe plans and just-in-time approval binding. The authority,
privacy, mutation, and process-containment distinctions in tranche 4 remain
continuous documentation obligations rather than a claim of machine sandboxing.

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
| Workspace boundary | One canonical root and immutable read-privacy policy | Rejects paths or content before tool execution or provider context. |
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
the selected target around reads. Mutation planning reuses that shared path
module. Decision 0046 invocation then binds the approved parent or file identity
through the owned platform committer without a portable pathname-write fallback.

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
and has one fixed five-second operation deadline followed by one shorter fixed
cleanup deadline after a termination request. The operation settles
content-free when either deadline expires even if the child never emits
`close`; late child events cannot settle twice or mutate accepted roots. It
emits exactly one versioned bounded binary frame. That frame contains only the
two absolute roots as strictly decoded UTF-8. Each path and the complete frame have fixed byte
limits; malformed, truncated, oversized, trailing, empty, relative,
control-bearing, duplicate, timed-out, or unsuccessful output is rejected with
one content-free error. Native diagnostics are discarded.

The Node adapter owns process launch and protocol validation; the existing
`WorkspaceBoundary` continues to own filesystem canonicalization and exact-root
denial. This separation keeps platform discovery independent of boundary
policy. Neither component may silently substitute an environment-derived or
hard-coded user home after discovery fails.

## Read privacy tranche

One immutable CLI-owned `WorkspaceReadPolicy` is bound to the accepted
workspace root. Startup constructs it after root selection and before reading a
provider credential, constructing a provider or runtime, registering tools, or
owning the terminal. The policy combines non-removable built-in sensitive-path
rules with one optional root `.agentignore`; both are deny-only and no later
layer or approval can override either source.

The built-in rules deny `.agentignore`, `.git`, every `.env` or `.env.*` path,
SSH and common cloud credential directories, package-manager and Git credential
files, conventional private-key names, and files ending in `.key`, `.pem`,
`.p12`, `.pfx`, `.jks`, or `.keystore`. These are path rules, not a claim that
content scanning can identify every secret. Changing this inventory requires
privacy documentation and adversarial tests in the same review.

The optional `.agentignore` is at most 16,384 bytes and 128 effective rules.
It must be one regular non-symbolic-link file containing strict Unicode-scalar
UTF-8. Loading rechecks its type, canonical path, and byte size after reading;
absence means built-ins only, while inaccessible, malformed, detectably changed,
oversized, or unsupported input fails startup with one content-free diagnostic.
The compiled policy remains fixed for the session; an on-disk change takes
effect only after restart.

The owned grammar is deliberately smaller than `.gitignore`:

- empty lines and lines beginning with `#` are ignored;
- every other line is one root-relative deny pattern using `/` separators;
- leading or trailing whitespace, absolute paths, `!` negation, `\`, NUL,
  controls, format characters, empty segments, `.` segments, and `..` segments
  are invalid;
- `*` matches zero or more code units inside one segment;
- one optional segment equal to `**` matches zero or more complete segments;
- a trailing `/` is the exact shorthand for an appended `**` segment;
- a matched path and every descendant beneath it are denied;
- each line is at most 256 code units and 32 segments, and duplicate normalized
  rules are invalid.

Matching is case-sensitive on Linux. Windows matching folds ASCII `A` through
`Z` only; non-ASCII names remain exact so the policy does not claim to reproduce
undocumented filesystem collation. Windows target components containing a DOS
short-name suffix such as `~1` fail closed because Node's path canonicalization
can preserve that alias spelling instead of recovering the long name needed by
the deny rules. This deliberately rejects an otherwise valid long component
with the same spelling rather than allowing an ambiguous disclosure path. Rule
and target work is bounded by the file, rule, line, segment, tool-path, and
traversal limits already enforced.

`read_file` checks the normalized lexical path before observing the filesystem
and returns `permission` for a denial. Every accepted read target is checked
again under the same policy after canonical resolution and at the existing
pre- and post-observation identity checks. `list_directory` rejects a denied
target and omits denied children from its bounded result. `search_text` rejects
a denied starting directory, prunes denied directories before traversal, and
never opens or returns a denied file; its resolved directories and files pass
the same shared canonical-policy check before observation. Denied entries still
count against the existing raw enumeration limits so exclusions cannot create
unbounded work. No denied path or content enters tool results, provider
requests, transcript, activity, notices, errors, logs, fixtures, or
documentation.

Decision 0051 adds optional exact logical-line projection only after these same
`read_file` checks and the existing bounded complete-file observation. It does
not alter disclosure policy, readable targets, source bounds, or canonical
read identity.

The read-privacy policy does not broaden or override `create_file`,
`replace_text`, or `run_process`. Writes use the separate effect-plan contract
below, and approved Node code remains capable of reading outside this policy
because process containment is not a filesystem or network sandbox. Effect
planning and machine isolation remain separate.

## Effect-plan tranche

Pure tool preparation still validates every call in the complete ordered batch
before any planner observes the filesystem. After that preflight succeeds, the
runtime plans only the next call. A later call is not planned until every prior
call has settled. This keeps observations fresh, preserves sequential effects,
and prevents an invalid suffix from triggering planner I/O.

One optional non-read planner replaces the registration's direct handler. The
generic Node-free tool engine owns the hostile planner boundary and accepts only
an owned immutable `ToolEffectPlan`. A successful plan carries one bounded safe
preview and one exact invocation closure. A normal planning failure becomes a
content-free failed tool result without approval and without a mutation. A
thrown or malformed planner is a contract failure and blocks the remaining
batch exactly like a malformed handler. `execute` accepts only an owned planned
call; prepared model input cannot bypass planning.

`create_file` records the canonical relative target, target absence, parent
directory identity, complete bounded proposed content, its SHA-256 digest, and
a bounded new-file preview. `replace_text` records the canonical relative
target, file identity, complete bounded original content, original and result
SHA-256 digests, the unique exact occurrence, and a delimited remove/insert
preview. Short text is shown completely. Longer text uses explicit prefix,
suffix, and omitted-code-unit fields; omission is never presented as complete
content. Preview line positions and counts treat CRLF as one boundary and lone
CR or LF as one boundary. Paths, input text, and previews must be Unicode-scalar
UTF-8, and unsafe terminal scalars remain escaped by the shared structured
projection.

The one pending approval names the immutable planned call, not the original
input sizes. Denial discards that plan. Invocation opens and checks the observed
object through the decision 0046 committer, compares file or parent identity,
rejects guarded path changes, and compares complete original replacement bytes
before the first write. A created target, removed or replaced parent, renamed
or replaced file, symbolic-link or reparse swap, content drift, or conflicting
open returns `conflict` without applying a stale effect. A plan failure requests
no approval because no mutation handler exists to authorize.

Linux uses guarded `openat2`, complete unnamed-file publication, and a write
lease. Windows uses handle-relative opens, exclusive sharing, and delete-pending
creation settlement. Unsupported platform or filesystem primitives fail closed
instead of returning to Node writes. This closes ordinary namespace-retargeting
and conflicting-content races for the selected object. Multi-file atomicity,
crash rollback, storage durability, and machine sandboxing remain outside this
decision.

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
- Automatic content-bearing reads and directory discovery share one immutable
  built-in and workspace-local denial policy.
- Windows DOS short-name aliases fail closed, and every resolved read path is
  rechecked by the same policy before observation.
- No new model-facing tool, provider, dependency, package, or TUI primitive is
  introduced.
- Write approvals now name concrete immutable effects and reject state that
  became stale before mutation.
- Approved mutation invocation is bound to the selected object through one
  owned handle-relative platform committer with no direct-write fallback.
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
- Plan calls while validating the batch: an invalid later call could otherwise
  cause filesystem observation, and later plans would become stale while prior
  approvals wait.
- Continue approving only field sizes: the operator would authorize model
  intent rather than the concrete observed effect.
- Claim that repeated path checks are an atomic sandbox: they reject stale
  approvals but cannot replace a platform handle-relative commit primitive.
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

Tranche 2 adds pure grammar tests for every admitted and rejected form, exact
limits, matching, descendant denial, and platform case behavior. Loader tests
cover absence, strict UTF-8, file type, symbolic links, size, canonical
rechecks, immutable session snapshots, content-free errors, and invalid
boundaries and platforms. Built-in tool tests prove pre-observation denial,
resolved-path policy rechecks, Windows DOS-alias denial, filtered listings,
pruned search, unchanged enumeration bounds, and absence of denied path and
content in outputs. Process-level startup tests prove malformed policy rejection
before credentials and terminal ownership.

The complete mutation delivery proves that batch validation precedes
all planner calls, plans are just in time and sequential, approvals carry the
concrete preview, planning conflicts skip approval, and planner failures remain
contained. Built-in mutation tests cover exact and truncated previews, digests,
ambiguous replacement, invalid scalar input, strict-UTF-8 rejection, target
appearance, content drift, file-identity replacement, parent replacement, and
symbolic-link swaps without an applied stale write. Decision 0046 adds exact
protocol, adapter lifecycle, complete large-write, no-overwrite, conflicting-
handle, forced-termination, malformed-input, and native Windows/Linux evidence.
Runtime tests prove cancellation during planning cannot expose a late approval.
The canonical Windows and Linux gate must pass for every tranche.

## Update, rollback, and removal

Changing root selection, platform discovery APIs, protocol, limits, protected-
root classes, resolution order, display, or tool consumption requires updating
this decision, native and startup tests, boundary tests, built-in tool tests,
architecture, manual, maintenance guidance, and ownership policy together. The
native resolver is rebuilt with the registered C17 and Clang toolchain on every
supported platform; generated binaries remain ignored.

Changing read-path canonicalization, Windows alias handling, or the points at
which the policy is rechecked requires this decision, all three read-tool
regressions, privacy and security prose, manual, maintenance guidance, and both
platform gates to change together. No handler may substitute a private matcher
or treat canonicalization as an authorization decision.

The platform resolver can be rolled back independently only by replacing it
with another accepted environment-independent source for both protected roots.
Removal deletes its native sources, protocol decoder, Node launch adapter,
tests, generated-artifact registrations, and current-behavior documentation as
one change. Falling back to environment-derived roots is forbidden.

Changing planner order, plan identity, preview bounds, digest algorithm,
committer protocol, platform exclusion/publication primitive, or planning-
failure behavior requires updating this decision, decision 0046, tool-engine
tests, runtime batch tests, built-in and native mutation tests, approval reducer
tests, architecture, manual, and maintenance guidance in the same review.
Removing the effect-plan or native commit delivery first removes every automatic
mutation capability; approval may not silently return to size-only intent or a
portable direct write.

Rollback of tranche 1 removes the boundary module and its tests, restores the
prior raw-working-directory composition, removes current-behavior claims, and
retains this decision as historical evidence or replaces it explicitly. Do not
leave one tool or footer path on a separate root source.

Removing the complete workspace boundary requires first removing every
filesystem and process capability that consumes it, or replacing it with a
stronger accepted authority contract. Privacy rules and effect plans remain
independently removable only while their earlier denial guarantees are not
weakened silently.

To remove tranche 2, first disable automatic content-bearing read tools or
replace this policy with a stronger accepted disclosure boundary. Then remove
policy injection from the tool registry, delete loader and grammar modules and
tests, remove `.agentignore` and built-in-rule documentation, and restore the
privacy warning in the same change. Removing only workspace rules while leaving
the built-in claim, or bypassing the policy from one read handler, is forbidden.
