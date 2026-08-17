# Contributing to agent

## Current contribution boundary

`agent` is in an initial maintainer-only clean-room phase. Issues that report a
reproducible bug, documentation gap, portability problem, or narrowly scoped
proposal are welcome after the repository is published. External code pull
requests are not accepted during this phase.

This boundary keeps ownership, review, rollback, and removal evidence
unambiguous while the public contracts stabilize. The
[ownership record](docs/OWNERSHIP.md) owns clean-room provenance. Opening
external code contributions requires an accepted project decision plus matching
changes to this guide and the
[publication policy](tools/publication-policy.json).

## Report an issue

- Search for an existing report first.
- State the version, operating system, command, expected behavior, and observed
  behavior.
- Use inert examples. Never include credentials, personal prompts, private file
  contents, provider cookies, tokens, or recovery material.
- Do not paste third-party source, translated snippets, generated foreign code,
  vendor identifiers, or copied tests.
- Report security problems through the private process in the
  [security policy](SECURITY.md), not an issue.

## Prepare a maintainer change

Read the [repository change contract](AGENTS.md), follow the
[engineering workflow](docs/ENGINEERING.md), and finish with the
[maintenance release gate](docs/MAINTENANCE.md). Those authorities own branch,
implementation, evidence, verification, review, rollback, and removal practice;
this guide does not duplicate them.

## Authorship and licensing

Giovanni Jecha directs, reviews, and maintains the project. Source accepted into
the repository must be original to this project or an explicitly documented
standard artifact such as the license text. The
[ownership record](docs/OWNERSHIP.md) defines the provenance process. Tool
assistance does not replace maintainer review, tests, or provenance records.
The project does not add automated tool signatures, generated-by banners, or
tool co-author trailers, and it does not claim that no development tool was
used.

By intentionally submitting material for inclusion after contributions are
opened, you agree that it may be licensed under the Apache License 2.0, subject
to any separate written agreement with the maintainer.
