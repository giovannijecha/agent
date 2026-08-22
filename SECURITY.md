# Security policy

## Supported versions

`agent` is pre-1.0 software. Only the latest published `0.x` release is
supported; older snapshots do not receive security fixes.

## Report a vulnerability

Use GitHub private vulnerability reporting for `giovannijecha/agent`. Do not
open a public issue, discussion, or pull request containing exploit details,
credentials, provider tokens, personal data, prompts, or private file content.

Include the affected version, platform, smallest inert reproduction, impacted
boundary, and expected/observed behavior. Private reporting must be enabled
before a public release; no response-time promise is made during the initial
maintainer-only phase.

## Security model

Agent protects bounded authority and content flow. It is not a virtual machine,
filesystem sandbox, network sandbox, encrypted vault, malware defense, or host
account boundary.

High-priority boundaries are:

- workspace and sensitive-path containment;
- schema, permission, and effect-plan integrity;
- object-bound filesystem mutation;
- native process containment and cleanup;
- terminal-control injection and clipboard framing;
- credential ownership, admission, recovery, and non-disclosure;
- exact provider identity, origins, and protocol decoding;
- settled conversation and session-journal integrity; and
- verification, source, dependency, and workflow bypasses.

## Workspace and reads

Startup resolves the exact current directory once with native account and
known-folder authority. It rejects a volume root, exact user home, shared
temporary storage, and any workspace containing or located beneath the
native-home `.agent` state root. It never widens scope by discovering a parent
Git repository.

One deny-only read policy is fixed before credentials, providers, tools, and
terminal ownership. Built-in sensitive-path rules cannot be overridden; a root
`.agentignore` may only add denials. Linked, malformed, changed, inaccessible,
or oversized policy input fails closed. Read tools reject or prune denied paths
before content is opened and recheck resolved targets, including ambiguous
Windows short-name aliases.

This boundary reduces automatic model disclosure. It does not scan file
contents, protect writes, or constrain an approved shell process.

## Tools and effects

Every model-selected call is bounded and schema-validated. The complete batch
is admitted in provider order, each successfully planned call receives one
exact permission, and effects remain serialized. One cohort of two to four
independent reads may overlap only after all permissions settle and never with a
write or shell command.

`apply_patch` binds approval to the canonical file, exact hunks, identity or
absence, strict UTF-8 content, and digests. `manage_path` binds approval to one
canonical namespace operation and its observed identities. Native Windows/Linux
committers recheck the authorized state and fail closed when the platform cannot
preserve it. These are single-object commits, not transactions, durability
guarantees, rollback mechanisms, or sandboxes.

`shell` runs one exact approved command through the fixed profile-free platform
shell, a controlled credential-free environment, fixed bounds, and owned
descendant-tree cleanup. Approved code retains the launching user’s filesystem
and network authority. Inspect commands as host-full execution.

## Terminal boundary

Model and tool text cannot supply styling or terminal controls. The owned
renderer emits a closed ANSI vocabulary, resets styles, frames OSC strings, and
restores raw input, mouse, paste, cursor, and alternate-screen state on cleanup.
Paste is atomic and control-looking pasted bytes remain text.

Visible `https://` hyperlinks use the same visible destination. Clipboard
payloads are bounded and cross only the owned Windows helper or one OSC 52
terminal request; later clipboard handling is controlled by the host.

## Provider boundary

The active runtime permits only Ollama Cloud’s exact HTTPS catalog and chat
origins. Requests use one immutable bearer credential snapshot. Catalog text
cannot alter origins, paths, authentication, protocol, tools, or model aliases.
Redirects, discovery, implicit retry, routing, and fallback are forbidden.

The streaming decoder fails permanently on the first rejected transport,
framing, envelope, message, tool-call, finish, or terminal record. It releases
partial state and never accepts later bytes as recovery. Provider failures expose
only a stable content-free operation/family/phase classification.

OpenAI device authentication uses fixed OpenAI HTTPS paths, a provider-owned
non-secret public client, PKCE, bounded polling, one overall deadline, and
terminal cancellation. Requests omit client secrets, cookies, foreign caller
identity, discovery, redirects, retry, and fallback. Only the verification URL
and one-time user code are displayed.

The OpenAI catalog and Responses adapter remain unreachable from production
composition. Offline injected tests prove request bounds, strict decoding,
cleanup, callback reentry handling, terminal-state precedence, and release of
partial provider data. No OpenAI record can currently create a `/models` row or
send task content.

## Credentials and durable state

Provider records and session journals are strict plaintext under the native-
resolved user `.agent` root. Owner-only filesystem controls reduce ordinary
cross-account access and ambiguous authority. They do not protect against
same-user processes, administrators/root, malware, backups, snapshots, memory
inspection, tampering by an already authorized principal, or privileged offline
access.

A TUI holds shared credential admission and one immutable snapshot for its
lifetime. `agent auth` holds exclusive admission across recovery, input,
mutation, publication, and cleanup. Links, unexpected inventory, unsafe
ownership/access, invalid schema, concurrency, or ambiguous recovery fail before
secret bytes are read. Ollama durable and environment credentials together fail
as dual authority.

Session admission uses one unique never-reused token per launcher and refuses a
live peer. Journals publish only complete settled nodes, enforce fixed size and
retention bounds, and fail on unknown versions, ambiguous locks, unsafe paths,
interior corruption, or required synchronization failure. Timeline selection
cannot execute or replay a historical tool.

## Supply chain and verification

The repository contains no third-party runtime dependencies, install scripts,
SDKs, frameworks, vendored source, or imported CI actions. Product imports,
package edges, Node built-ins, source trees, native helpers, manifests, lockfile,
brand assets, provider constants, and documentation inventory are checked
offline by the canonical gate.

Tests and evaluation fixtures use inert original data. They never contain real
credentials, captured provider responses, personal prompts, foreign source, or
private workspace content. The owned evaluator neither executes candidate code
nor contacts a provider.

## Limitations

- An approved shell command can access or transmit anything the launching user
  can access.
- Same-user or privileged host actors can read or alter plaintext local state.
- Provider-side retention, account security, billing, availability, and
  revocation are outside Agent’s control.
- Local deletion is not secure erasure and local OpenAI removal is not remote
  revocation.
- Native containment bounds owned process lifecycle; it does not make hostile
  code safe.

## Disclosure

Keep a report private until a fix, regression, affected-version statement, and
release plan exist. The maintainer decides coordinated disclosure timing.
Publishing a fix never permits publishing user credentials or content.
