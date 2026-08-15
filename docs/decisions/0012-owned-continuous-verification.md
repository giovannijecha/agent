# 0012: Owned continuous verification

- Status: accepted
- Date: 2026-08-08

## Context

The public repository protects `main` with pull requests, linear history, review
thread resolution, deletion denial, and force-push denial. The canonical local
release gate is comprehensive, but GitHub does not yet run it automatically.
Requiring an unverified status name would deadlock merges, while importing a
checkout, setup, or verification action would add foreign executable source to
the project workflow.

GitHub-hosted runners, Git, Node, npm, PowerShell, and the externally installed
TypeScript compiler are execution substrate. They are not product source. The
repository must still own every workflow instruction and must not grant a pull
request secrets or elevated repository permissions.

## Decision

`.github/workflows/verify.yml` is the only continuous-verification workflow. It
runs for pull requests targeting `main`, pushes to `main`, and explicit manual
dispatches. It grants only `contents: read`, uses one `windows-latest` job named
`verify`, cancels superseded runs, and has a fixed timeout.

The workflow contains no `uses:` step. Its first owned checkout step validates
the event repository, immutable revision, and ref. The ref admits only the
expected protected-branch or pull-request context; it is never the fetch target.
The step fetches the exact immutable event revision by commit identity, verifies
the resulting commit, and removes the remote. This prevents a rerun from racing
a regenerated pull-request merge ref. The next step provisions only the npm and
TypeScript versions already approved in `tools/toolchain.json`.
The final step invokes the unchanged canonical release gate, whose installation
and verification remain offline.

`tools/ci-policy.json` registers the workflow contract.
`tools/lib/ci-policy.mjs` reconstructs the exact expected workflow from that
registry and the toolchain registry, rejects imported actions, secrets,
`pull_request_target`, permission drift, trigger drift, and command drift, and
runs before build output is trusted. Focused tests exercise both the accepted
workflow and unsafe mutations.

The `verify` status check is added to the GitHub ruleset only after this workflow
has completed successfully on the remote. This ordering prevents an unavailable
check from locking the default branch.

## Consequences

Every proposed default-branch change can be evaluated by the same owned gate used
locally. Bootstrap needs network access to fetch the public revision and approved
toolchain, but product tests and workspace installation remain offline and no
provider, secret, dependency, or external action enters the run.

The hosted image can drift. A missing compatible Node version, unavailable pinned
toolchain, or changed workflow fails the check instead of silently selecting a
different tool. The maintainer still reviews workflow changes because a workflow
cannot independently authorize modifications to its own definition.

## Update, rollback, and removal

Update the workflow, CI policy, validator, tests, affected toolchain facts,
operator manual, and this decision together. Validate locally before pushing,
then prove the changed workflow on a pull request before changing its required
check.

To roll back a broken revision, restore the last verified workflow and policy on
a repair branch and merge it through the existing protected path. To remove
continuous verification, first remove the required `verify` check from the
GitHub ruleset, then delete the workflow, CI registry, validator, tests, manual
references, this decision, and its ownership registration. The local release
gate remains authoritative throughout removal.
