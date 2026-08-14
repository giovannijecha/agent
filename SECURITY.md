# Security policy

## Supported versions

`agent` is pre-1.0 software. Only the latest published `0.x` release is
supported. Older snapshots do not receive security fixes.

## Report a vulnerability

After the public repository exists, report vulnerabilities through GitHub
private vulnerability reporting for `giovannijecha/agent`. Do not open a public
issue, discussion, or pull request containing exploit details, credentials,
personal data, or provider tokens.

Private reporting must be enabled before the first public release. Until that
channel exists, the project is not accepting vulnerability reports and must not
be presented as publicly supported software. No response-time promise is made
during the initial maintainer-only phase.

Include the affected version, platform, reproducible boundary, impact, and the
smallest safe reproduction. Replace all secrets and personal content with inert
sentinels.

## Security scope

High-priority boundaries include terminal-control injection, workspace escape,
symlink traversal, unauthorized tool execution, cancellation and cleanup,
secret retention, credential storage, provider identity, protocol decoding,
and verification bypasses.

Normal startup canonicalizes the exact current directory once and rejects a
filesystem volume root, the exact user home, and the exact shared temporary
directory before credentials or terminal ownership. It never widens authority
by discovering a parent Git repository. The same immutable absolute root feeds
the footer and every built-in tool. An owned bounded native resolver obtains the
protected roots from operating-system account and known-folder contracts with
an empty inherited environment; `HOME`, `USERPROFILE`, `TMPDIR`, `TMP`, and
`TEMP` cannot relocate those protections.

The same startup sequence fixes one deny-only read policy before credentials,
providers, tools, or terminal ownership. Built-in sensitive-path rules cannot
be overridden; a bounded optional root `.agentignore` can only add denials.
Malformed or unsupported policy input fails closed. The three automatic read
tools reject or prune denied paths before file content is opened or returned,
recheck resolved targets, and reject ambiguous Windows DOS short-name aliases.
This is a disclosure boundary, not content-based secret detection, write
protection, or a sandbox for approved processes.

Write calls are schema-validated with the complete batch before observation,
then planned just in time. `create_file` binds approval to target absence,
canonical parent identity, complete proposed content, and its SHA-256 digest.
`replace_text` binds approval to canonical file identity, strict UTF-8 complete
content, one exact match, and observed/result digests. Invocation rejects stale
path, identity, absence, or content state before mutation. Decision 0046 routes
the approved immutable effect through one owned Windows/Linux native committer.
Linux uses guarded handle-relative lookup, unnamed-file publication, and a write
lease; Windows uses handle-relative opens, exclusive sharing, and delete-pending
creation. Missing platform or filesystem primitives fail closed. This closes
ordinary retargeting and conflicting-content races for the selected object; it
does not provide multi-file atomicity, crash rollback, storage durability, or a
filesystem/network sandbox.

Model and tool text cannot provide styling metadata or terminal escapes. Generic
components and frames validate one closed semantic tone per printable row; only
the owned renderer emits fixed ANSI and resets it during row output and cleanup.
Interrupted OSC strings are conservatively closed before later renderer output.
Native root, mutation, and clipboard helpers have hard operation and post-kill
cleanup deadlines; late events cannot change settled content-free results.

The project enables one exact outbound HTTPS path for an operator-configured
OpenCode Go API key. The owned startup prompt disables echo, bounds input, and
restores terminal state before TUI startup. It enables no provider OAuth login,
arbitrary network
transport, persistent credential or session store, or redirect policy. The
single `run_process` capability admits only an exactly approved bounded `node`
invocation through owned descendant-tree containment. That containment is not a
filesystem or network sandbox; approved code retains the launching user's
operating-system authority. Reports about provider traffic should identify the
exact CLI transport, wire decoder, or configuration boundary involved.

The maintainer-only task evaluator is a separate offline tooling boundary. It
accepts only the registered strict-text corpus and regular-file run trees,
rejects linked or secret-shaped corpus paths, and never executes candidate code
or treats a result as trusted product source. Run identifiers determine one
bounded ignored state path; preparation refuses reuse and checks each existing
state-directory component before writing. Evaluation workspaces still contain
untrusted candidate text and must not be executed outside the normal product
approval and process contracts.

The optional interactive evaluation receipt does not expand that boundary or
weaken product controls. It observes only already accepted serialized lifecycle
events, cannot approve or reorder work, retains read identities only as bounded
memory-only digests, and emits no content or identifier. The exact flag requires
TTY input and output and is rejected before credentials when redirected.

The versioned failure registry is validated offline against the maintained task
catalog and tracked repository inventory. It admits only closed content-free
evidence and fixture-relative paths that pass the corpus safety bounds. It never
reads ignored runs, executes candidate code, captures model output, or grants
product authority. Unknown fields, task identifiers, resolution targets, or
unsafe paths fail the canonical gate.

## Disclosure

Keep a report private until a fix, regression test, affected-version statement,
and release plan exist. The maintainer decides the coordinated disclosure date.
Publishing a fix never permits publication of a user's credentials or content.
