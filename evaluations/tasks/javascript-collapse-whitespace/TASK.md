# Collapse repeated slug whitespace

## Goal

Fix `slugify` so one or more consecutive whitespace characters between words
produce one hyphen.

## Constraints

Preserve trimming, lowercase conversion, the export name, and the zero-
dependency module shape. Keep the existing tests unchanged.

## Completion

`node --test` passes, including the repeated-space and tab cases.
