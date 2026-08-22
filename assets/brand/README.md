# Brand assets

This directory is the distribution and maintenance authority for Agent’s
canonical visual assets.

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

Use assets only for Agent itself, keep adequate clear space and contrast, and do
not imply provider endorsement. Replacement updates the source and raster forms,
manifest metadata and digests, public uses, and verifier tests together. Removal
deletes the complete registered family and every reference in the same change.
