# 0010: Public project identity and governance

- Status: accepted
- Date: 2026-08-08

## Context

The foundation is intended to become a public open-source project. Publication
needs one stable identity, license, privacy posture, security channel,
contribution boundary, and provider-registration dossier before Git history or
remote hosting exists. Adding those after publication would leave authorship,
provider identity, and user expectations ambiguous.

Automated development tools do not require a repository banner or co-author
trailer in the current product workflow. The project must not add an unrequested
tool signature, but it must also avoid the false assertion that no tool assisted
development. Original source, explicit provenance, maintainer review, focused
tests, and the release gate are the durable evidence.

## Decision

The public project name, repository slug, and executable remain `agent`. The
planned canonical repository is `giovannijecha/agent`. Giovanni Jecha is the
maintainer and copyright holder. The public description is “An owned,
zero-dependency personal coding agent.”

Source is licensed under Apache License 2.0. The repository has no project cloud
service or telemetry. Local session persistence remains disabled until an
opt-in owned contract exists. Provider traffic, when eligible, goes directly
between the local process and the provider.

External issues may open after publication. External code pull requests remain
closed during the initial clean-room phase. Security reporting requires GitHub
private vulnerability reporting to be enabled before the first public release.

No generated-by banner, automated tool signature, or tool co-author trailer is
added. Commit authorship will use the maintainer's configured Git identity when
Git is explicitly initialized. This decision does not claim that development
occurred without tool assistance.

OAuth integrations follow `docs/OAUTH-REGISTRATION.md`: `agent` must receive its
own provider authorization or rely on an expressly reusable independent-client
identity. Publication alone does not grant provider eligibility.

## Verification

An owned publication policy pins the identity, governance posture, public
documents, and exact license text. Its validator rejects identity drift,
license modification, missing public links, automatic attribution markers, and
false no-tool claims. Repository text is fixed to LF so Windows checkout cannot
silently alter the verified license digest. The canonical release gate runs the
validator offline.

## Update, rollback, and removal

Change the name, namespace, maintainer, license, privacy posture, contribution
policy, or attribution convention only through a replacing decision and an
atomic update to public documents, policy, tests, and manual evidence.

Before the remote repository exists, rollback means removing this publication
layer and its validator while leaving product packages unchanged. After
publication, do not rewrite released identity or license history; publish a new
documented version. Removing public distribution requires archiving the remote,
revoking provider registrations, documenting credential deletion, and retaining
license notices required for already distributed versions.
