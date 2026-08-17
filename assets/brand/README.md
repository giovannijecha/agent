# Brand assets

This directory is the scoped distribution entry point for the canonical visual
assets registered by the [brand guide](../../docs/BRAND.md).

The product, repository, executable, and package identity is always `agent`.
The exact lowercase `.agent` form is a visual wordmark only; it is not an
alternate product or command name.

Use the raster files for stable published rendering. The SVG files remain
available for controlled scaling, but their text uses a system font and can
render differently across environments. Do not silently convert, redraw,
recolor, crop, decorate, or add missing variants.

The files, roles, dimensions, provenance, palette, and digests are registered
in [`manifest.json`](manifest.json). The canonical verifier rejects unregistered
files, byte drift, unsafe SVG content, and dimension drift.

The brand guide owns allowed uses and the replacement and removal procedure.
