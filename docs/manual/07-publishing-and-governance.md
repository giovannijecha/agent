# 07 - Publishing and governance

## Prepare publication

Use this chapter to prepare `agent` for public distribution without changing
its identity, leaking secrets, inventing provider authorization, or adding
automatic tool attribution.

1. Read the [license](../../LICENSE), [privacy policy](../../PRIVACY.md),
   [security policy](../../SECURITY.md),
   [contribution policy](../../CONTRIBUTING.md), and
   [ownership record](../OWNERSHIP.md).
2. Run the canonical release gate and resolve every failure.
3. Confirm publication is explicitly authorized. Only on explicit instruction,
   initialize Git or create a remote repository.
4. Enable GitHub private vulnerability reporting before the first release.

## Preserve identity and attribution

Confirm the public identity is `agent`, the namespace is `giovannijecha/agent`,
and the maintainer is Giovanni Jecha. Configure commits with the maintainer's
real Git identity. Do not add a generated-by banner, automated tool signature,
or tool co-author trailer.

The project does not claim that development occurred without tool assistance;
it proves quality through original source, provenance, focused tests, explicit
decisions, and the canonical release gate.

Before publication, inspect `assets/brand/manifest.json` and
[the brand guide](../BRAND.md); confirm every published logo digest and the
exact visual-only `.agent` wordmark. The canonical identity remains `agent`.
Brand drift, an unregistered asset, a digest mismatch, or identity ambiguity
fails publication. Update or remove assets only with their manifest entry,
documentation, decision record, validator, tests, and every published use.

## Protect runtime and provider boundaries

The Apache-2.0 text, public identity, privacy posture, initial contribution
boundary, and public document links are checked offline. The project has no
telemetry, backend, persistent credential or provider selection, or eligible
provider login. Interactive launches retain only the bounded settled local
session journal documented by the [privacy policy](../../PRIVACY.md).
Publication does not widen that journal or authorize OAuth access.

The product is single-agent: providers are interchangeable backends for one
active runtime session, not additional agent identities. The sole controller
may overlap only an explicitly registered cohort of two to four independent
inspection handlers after all permissions settle. That cohort is not an atomic
filesystem snapshot and cannot overlap an owned effect. Model turns, permission
decisions, writes, process execution, conversation commits, and terminal output
remain serialized. The public workflow is also owned project code; it imports
no action and receives no repository secret.

No Git repository or GitHub remote is created by documentation or verification.
Keep the version on `0.x` until one direct provider integration is complete and
eligible.

## Verify the release

1. Scan the complete history for secrets and inspect the rendered public files.
2. Require the owned `verify` job only after it has completed successfully on
   GitHub; never require a status name that has not run.

## Handle publication failures

Identity drift, altered license text, missing public documents, automatic tool
attribution, or a false no-tool claim makes publication verification fail. A
missing private security channel blocks the first public release. A missing
provider registration keeps that provider blocked even when the repository is
public.

## Roll back or remove publication

Replace public identity or governance only through decision 0010's documented
path. Before publication, the complete public layer can be removed without
changing product packages. After release, preserve distributed license history,
archive rather than erase the repository, revoke provider registrations, and
publish any required security notice.

## References

The public [README](../../README.md), [license](../../LICENSE),
[security policy](../../SECURITY.md), [privacy policy](../../PRIVACY.md),
[contribution policy](../../CONTRIBUTING.md), and
[ownership record](../OWNERSHIP.md) own their respective public contracts.
Release mechanics remain in the [maintenance guide](../MAINTENANCE.md). The
repository [publication policy](../../tools/lib/publication-policy.mjs) and its
[offline regressions](../../tools/test/publication-policy.test.mjs) verify
publication metadata and documentation markers. Lasting identity, verification,
single-agent, brand, and motion rationale remains in the
[decision index](../decisions/README.md); OAuth registration conclusions remain in the
[OAuth registration dossier](../OAUTH-REGISTRATION.md).
