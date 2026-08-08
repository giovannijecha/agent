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

The project currently enables no provider login, network transport, persistent
session store, or child-process tool. A report claiming one of those behaviors
must first identify the concrete shipped path that enabled it.

## Disclosure

Keep a report private until a fix, regression test, affected-version statement,
and release plan exist. The maintainer decides the coordinated disclosure date.
Publishing a fix never permits publication of a user's credentials or content.
