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

Model and tool text cannot provide styling metadata or terminal escapes. Generic
components and frames validate one closed semantic tone per printable row; only
the owned renderer emits fixed ANSI and resets it during row output and cleanup.

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

## Disclosure

Keep a report private until a fix, regression test, affected-version statement,
and release plan exist. The maintainer decides the coordinated disclosure date.
Publishing a fix never permits publication of a user's credentials or content.
