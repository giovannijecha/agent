# 07 - Publishing and governance

## Purpose

Use this chapter to prepare `agent` for public distribution without changing
its identity, leaking secrets, inventing provider authorization, or adding
automatic tool attribution.

## Operator workflow

1. Confirm the public identity is `agent`, the namespace is
   `giovannijecha/agent`, and the maintainer is Giovanni Jecha.
2. Read the [license](../../LICENSE), [privacy policy](../../PRIVACY.md),
   [security policy](../../SECURITY.md), and
   [contribution policy](../../CONTRIBUTING.md).
3. Run the release gate and resolve every failure.
4. Only on explicit instruction, initialize Git and create the remote repository.
5. Configure commits with the maintainer's real Git identity. Do not add a
   generated-by banner, automated tool signature, or tool co-author trailer.
6. Enable GitHub private vulnerability reporting before the first release.
7. Scan the complete history for secrets and inspect the rendered public files.
8. Require the owned `verify` job only after it has completed successfully on
   GitHub; never require a status name that has not run.
9. Keep the version on `0.x` until one direct provider integration is complete
   and eligible.

## Guarantees and limits

The Apache-2.0 text, public identity, privacy posture, initial contribution
boundary, and public document links are checked offline. The project has no
telemetry, backend, persistent sessions, or eligible provider login. Publication
does not change those facts and does not authorize OAuth access.

The product is single-agent: providers are interchangeable backends for one
active runtime session, not additional agent identities. One controller may
eventually overlap bounded mechanics only over immutable snapshots during a
read-only phase; those mechanics cannot enter the tool engine or overlap a
mutation. Current runtime remains sequential. Model turns, writes, process
execution, approvals, and terminal output remain serialized. The public
workflow is also owned project code; it imports no action and receives no
repository secret.

No Git repository or GitHub remote is created by documentation or verification.
The project does not claim that development occurred without tool assistance;
it proves quality through original source, provenance, focused tests, explicit
decisions, and the canonical release gate.

Before publication, inspect `assets/brand/manifest.json` and `docs/BRAND.md`;
confirm every published logo digest and the exact visual-only `.agent`
wordmark. The canonical identity remains `agent`.

Brand drift, an unregistered asset, a digest mismatch, or identity ambiguity
fails publication. Update or remove assets only with their manifest entry,
documentation, decision record, validator, tests, and every published use.

## Failure behavior

Identity drift, altered license text, missing public documents, automatic tool
attribution, or a false no-tool claim makes publication verification fail. A
missing private security channel blocks the first public release. A missing
provider registration keeps that provider blocked even when the repository is
public.

## Maintenance and removal

Replace public identity or governance only through decision 0010's documented
path. Before publication, the complete public layer can be removed without
changing product packages. After release, preserve distributed license history,
archive rather than erase the repository, revoke provider registrations, and
publish any required security notice.

## Evidence

- Public entry point: `README.md`
- License terms: `LICENSE`
- Security reporting: [SECURITY.md](../../SECURITY.md)
- Privacy posture: [PRIVACY.md](../../PRIVACY.md)
- Contribution boundary: [CONTRIBUTING.md](../../CONTRIBUTING.md)
- Public identity decision: `docs/decisions/0010-public-project-identity.md`
- OAuth application dossier: `docs/OAUTH-REGISTRATION.md`
- Publication registry: `tools/publication-policy.json`
- Publication validator: `tools/lib/publication-policy.mjs`
- Publication validator tests: `tools/test/publication-policy.test.mjs`
- Canonical Git line endings: `.gitattributes`
- Continuous-verification decision: `docs/decisions/0012-owned-continuous-verification.md`
- Single-agent decision: `docs/decisions/0013-single-agent-execution.md`
- Brand asset registry: `assets/brand/README.md`
- Brand manifest: `assets/brand/manifest.json`
- Authentication SVG: `assets/brand/agent-auth-logo.svg`
- Authentication PNG, 256 px: `assets/brand/agent-auth-logo-256.png`
- Authentication PNG, 512 px: `assets/brand/agent-auth-logo-512.png`
- Authentication PNG, 1024 px: `assets/brand/agent-auth-logo-1024.png`
- Dark wordmark PNG: `assets/brand/agent-wordmark-dark.png`
- Dark wordmark SVG: `assets/brand/agent-wordmark-dark.svg`
- Transparent wordmark PNG: `assets/brand/agent-wordmark-transparent.png`
- Transparent wordmark SVG: `assets/brand/agent-wordmark-transparent.svg`
- Brand contract: `docs/BRAND.md`
- Brand decision: `docs/decisions/0037-canonical-agent-brand.md`
- Motion decision: `docs/decisions/0038-owned-deterministic-tui-motion.md`
- Brand validator: `tools/lib/brand-policy.mjs`
- Brand validator tests: `tools/test/brand-policy.test.mjs`
