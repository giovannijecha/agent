# 0037: Canonical agent brand

- Status: Accepted
- Date: 2026-08-12

## Context

The project needs one durable identity for documentation, provider
registration, authentication surfaces, and future distribution. The maintainer
provided an original logo pack containing a lowercase `.agent` wordmark and an
authentication mark. Visual identity must not create a second product name or
couple generic TUI primitives to product-specific presentation.

## Decision

The canonical product identity is `agent`.

The exact lowercase `.agent` wordmark is a visual signature, not an alternate
product, repository, package, or command name.

The original asset bytes are stored under `assets/brand/`. Their filenames,
roles, dimensions, palette, provenance, and SHA-256 digests are registered in
`assets/brand/manifest.json` and enforced by the canonical verifier.

The brand is used only where identity materially helps: repository
documentation, provider applications, authentication surfaces, and future
distribution metadata. It does not add a persistent terminal banner, welcome
screen, dashboard, or product dependency inside `@agent/tui`.

## Consequences

- Product, repository, executable, and package naming remains `agent`.
- Hosts may select a registered vector or raster variant without altering it.
- Any byte, dimension, filename, palette, or asset-set change is explicit and
  reviewable.
- The terminal remains conversation-first and can evolve independently from the
  brand system.

## Rejected alternatives

- Renaming the product to `.agent`: punctuation is a visual signature, not a
  portable application identity.
- Recreating the assets in code: this would discard the maintainer-provided
  originals and weaken provenance.
- Embedding product branding in generic TUI components: this would prevent
  independent reuse and removal.

## Update and removal

Asset updates follow `docs/BRAND.md` and require provenance, manifest, policy,
test, and documentation changes together. Retiring the complete system requires
a superseding identity decision and removal of all registered assets and public
references.
