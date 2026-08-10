# 0023: Owned bounded Markdown subset

- Status: accepted
- Date: 2026-08-10

## Context

The owned TUI now has one immutable structured-row carrier, one bounded
component path, and one differential renderer. Conversation text is still
presented as uniformly plain text, so model answers cannot express even the
small document hierarchy needed for explanations and code. Importing a
Markdown implementation or adding a parallel rich-text engine would violate
the ownership boundary and duplicate normalization, wrapping, clipping, and
terminal-safety rules.

Decision 0020 reserved a bounded owned Markdown subset after structured rows
and the unified tool surface. This decision supplies that increment without
claiming CommonMark compatibility or creating a general document framework.

## Decision

Add one Node-free `MarkdownBlock` component to `@agent/tui`. It parses bounded
untrusted text with an original, pure, immutable, line-oriented parser and
compiles directly into the same `TextSpan`, `RichRow`, `Fragment`, `Frame`, and
renderer path used by every other component. `TextBlock` and `MarkdownBlock`
share one span-preserving normalization, cell measurement, wrapping, anchoring,
and padding implementation. There is no legacy string renderer, hidden parser
state, retained AST, extension registry, or alternate screen engine.

One block snapshots zero through 512 isolated documents before parsing. Their
combined text and literal blank separators share `displayTextCodeUnits`. Parser
state restarts at each boundary, and the block inserts exactly one blank row
between documents. Collection count and total text are validated before parser
iteration; rejected collections retain no content in failures.

The exact accepted syntax is:

- ordinary printable lines and blank lines;
- ATX headings with one through six `#` characters followed by one space;
- one-level unordered items beginning `- `;
- one-level ordered items beginning with one through nine decimal digits and
  `. `;
- one-level block quotes beginning `> `;
- fenced code opened by exactly three backticks followed immediately by an
  optional zero-to-32-character ASCII language label containing letters,
  digits, `_`, `+`, `.`, `#`, or `-`, and closed by a line containing exactly
  three backticks;
- same-line inline code delimited by exactly one backtick that is not part of a
  longer backtick run; and
- same-line strong text delimited by exactly two asterisks that are not part of
  a longer asterisk run.

No construct nests. Inline code is recognized before strong text, and its
contents remain literal. A delimiter is syntax only when its closing delimiter
exists on the same line. A fence is syntax only when a later exact closing
fence exists. Longer delimiter runs, incomplete syntax, and unsupported syntax
remain visible literally. The
subset does not interpret links, images, HTML, tables, escapes, task lists,
syntax highlighting, raw ANSI, or extension directives.

## Visual contract

Replace decision 0019's four-tone vocabulary with five closed semantic tones:
`plain`, `muted`, `emphasis`, `accent`, and `attention`. `emphasis` is owned bold
text in the terminal's default foreground. It expresses document hierarchy
without borrowing the cyan product identity role or the yellow approval and
failure role.

Markdown-derived content may select only `plain`, `muted`, and `emphasis`:

- headings, strong text, and inline code use `emphasis`;
- list markers, quote rails, fence language labels, and code rails use `muted`;
- prose, quoted content, and fenced code content use `plain`.

The parser selects these roles from syntax. Model, provider, tool, and user text
cannot supply a tone, color, escape sequence, or renderer instruction. The
quiet rails and restrained bold hierarchy are the complete visual signature;
the feature introduces no boxes, badges, icons, or product-specific concepts.

## Bounds, security, and failure behavior

Input is rejected before parsing when it exceeds `displayTextCodeUnits`.
Line-ending normalization, tab expansion, control replacement, lone-surrogate
replacement, conservative Unicode cell measurement, wrapping, row retention,
and final frame validation remain owned by the generic TUI. Parsing is linear
in accepted input size and performs no recursion, network access, filesystem
access, callbacks, or dynamic dispatch.

Each logical line is bounded by the existing structured-row span limit. If
recognized inline syntax would exceed that limit, the complete sanitized line
falls back to one plain span instead of failing the terminal session or
partially applying style. Oversized or invalid structural inputs return the
existing content-free `ComponentError`; rejected personal content and parser
causes are never retained. Final `RichRow`, `Fragment`, and `Frame` validation
remain independent defenses.

The first product integration replaces the conversation transcript's plain text
component. Each `you` or `agent` role-labelled message is a separate document,
so user or model syntax cannot consume or style a later message or role label.
Tool activity, status, input, provider data, and runtime state do not enter the
Markdown parser. Streaming reparses the current bounded message snapshot with no
hidden incremental state. An incomplete construct therefore stays literal until
the closing delimiter arrives within that same message.

## Verification

Focused tests must prove every accepted construct, literal unsupported and
incomplete syntax, precedence, non-nesting, span-limit fallback, input bounds,
line ending and control normalization, lone surrogates, tabs, wide scalars,
cell wrapping, head and tail anchoring, tiny viewports, immutable rows, fixed
tone mapping, ANSI reset, differential redraw, streaming completion, and CLI
transcript and cross-message isolation. The canonical verifier remains the
Windows and Linux release gate.

## Update, rollback, and removal

Changing syntax, precedence, delimiter completion, document isolation, role
mapping, bounds, fallback, normalization, wrapping, or anchoring requires
parser, component, renderer, CLI view, privacy, manual, and policy regressions
in the same change. A new construct requires a present product need and an
update to this closed list; it is not admitted through an extension hook.

To remove Markdown, first replace the transcript `MarkdownBlock` with the plain
`TextBlock`, then delete the Markdown parser, component, exports, and focused
tests. Remove this decision and its manual and policy registrations in the same
change. If no other component uses `emphasis`, remove that tone and restore
decision 0019's four-tone contract with renderer and structured-row tests.
Structured rows, scroll, tool activity, input, runtime, providers, and core
remain independently buildable.
