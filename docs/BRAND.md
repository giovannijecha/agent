# Brand system

## Identity

The canonical product identity is `agent`.

The exact lowercase `.agent` wordmark is a visual signature, not an alternate product, repository, package, or command name.

The [public README](../README.md) owns the public purpose, repository identity,
installation, and first-run path. This guide owns the visual identity,
registered assets, and presentation constraints.

The canonical palette is black, white, and `#0B0D10`. Brand assets are
maintainer-provided original work and remain independent from provider,
terminal, and model identities.

## Asset registry

`assets/brand/manifest.json` is the machine-verified source of truth for asset
roles, dimensions, digests, provenance, and palette values.

| Role | Preferred asset | Constrained-host fallback |
| --- | --- | --- |
| Authentication mark | `agent-auth-logo.svg` | 256, 512, or 1024 px PNG |
| Wordmark on dark surfaces | `agent-wordmark-dark.svg` | `agent-wordmark-dark.png` |
| Wordmark on transparent surfaces | `agent-wordmark-transparent.svg` | `agent-wordmark-transparent.png` |

Use SVG where the host supports safe vector assets. Use the registered PNG
variant when a host requires a fixed raster size. Never regenerate one format
from another during a build.

Canonical SVG updates pass a fail-closed capability check before their digest
is admitted. Scriptable elements, event-handler attributes, animation,
references, embedded or imported resources, active styling URLs, DTDs,
entities, XML processing stylesheets, and namespace-qualified element or
attribute names are rejected. Colons remain valid inside quoted attribute
values and text content. Update SVG bytes, manifest digest, validator tests,
and this contract atomically.

## Usage rules

- Preserve the registered bytes, proportions, lowercase spelling, and palette.
- Do not recolor, stretch, trace, rebuild, animate, or combine the mark with a
  provider identity.
- Do not use `.agent` as the executable, package, repository, or product name.
- Keep authentication and publication surfaces truthful: the application is
  always identified as `agent`.
- Do not add a persistent brand banner, welcome screen, dashboard, or decorative
  header to the terminal interface. The conversation remains the primary
  surface.
- Keep brand assets outside `@agent/tui`; generic rendering primitives must not
  depend on product identity.

## Updating the system

1. Obtain replacement originals directly from the maintainer.
2. Record their provenance and archive digest in the
   [ownership record](OWNERSHIP.md).
3. Update `assets/brand/manifest.json` with exact filenames, dimensions, and
   SHA-256 digests.
4. Update the brand validator and its tests only when the documented contract
   changes.
5. Run the canonical verifier before publication.

Brand assets are never silently optimized, reformatted, or normalized.

## Removal

Removing an individual format requires removing every reference, its manifest
entry, and its validator expectation in the same change. Retiring the complete
brand system additionally requires an accepted identity decision, removal of
the publication and ownership registrations, and verification that no shipped
surface retains the visual signature.
