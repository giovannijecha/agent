# Contributing to agent

`agent` is in an initial maintainer-only clean-room phase. Issues that report a
reproducible bug, documentation gap, portability problem, or narrowly scoped
proposal are welcome after the repository is published. External code pull
requests are not accepted during this phase.

Maintainer changes use a protected branch and must pass the owned `verify` job,
which executes the same canonical release gate as local development without
importing third-party GitHub actions.

## Why code contributions are temporarily closed

The project is establishing an independently authored, zero-third-party-package
foundation with strict provenance. Keeping implementation changes under one
maintainer makes ownership, review, rollback, and removal evidence unambiguous
while the public contracts stabilize. This policy can change only through an
explicit project decision and an updated contribution process.

## Issue requirements

- Search for an existing report first.
- State the version, operating system, command, expected behavior, and observed
  behavior.
- Use inert examples. Never include credentials, personal prompts, private file
  contents, provider cookies, tokens, or recovery material.
- Do not paste third-party source, translated snippets, generated foreign code,
  vendor identifiers, or copied tests.
- Report security problems through the private process in `SECURITY.md`, not an
  issue.

## Authorship and provenance

Giovanni Jecha directs, reviews, and maintains the project. Source accepted into
the repository must be original to this project or an explicitly documented
standard artifact such as the license text. Tool assistance does not replace
maintainer review, tests, or provenance records. The project does not add
automated tool signatures, generated-by banners, or tool co-author trailers.
It also does not make an unverifiable claim that no development tool was used.

## License

By intentionally submitting material for inclusion after contributions are
opened, you agree that it may be licensed under the Apache License 2.0, subject
to any separate written agreement with the maintainer.
