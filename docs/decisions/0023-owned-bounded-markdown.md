# 0023: Owned bounded Markdown subset

- Status: accepted
- Date: 2026-08-10
- Last amended: 2026-08-15
- Amended by: decisions 0030, 0031, 0032, 0040, and 0045

Decision 0040 makes fenced code and strict table regions transparent while
retaining this decision's grammar, bounds, padding, wrapping, and renderer path.
Decision 0045 preserves Markdown link syntax as literal text but recognizes an
exact visible ASCII HTTPS target after parsing for terminal-owned activation.
No hidden Markdown destination or new Markdown construct is admitted.

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
- same-line italic emphasis delimited by exactly one asterisk that is not part
  of a longer asterisk run;
- same-line strong text delimited by exactly two asterisks that are not part of
  a longer asterisk run; and
- strict pipe tables under decision 0030: at least two non-empty header cells,
  a same-count delimiter row, and zero or more same-count non-empty body rows.

No construct nests. Inline code is recognized before strong text, strong text
before italic emphasis, and recognized contents remain literal to later inline
forms. A delimiter is syntax only when its closing delimiter exists on the same
line. A fence is syntax only when a later exact closing fence exists. Longer
delimiter runs, incomplete syntax, and unsupported syntax remain visible
literally. The
subset does not interpret links, images, rendered HTML, escaped pipes, task
lists, raw ANSI, or extension directives. Decision 0031 later permits only its
bounded internal lexical highlighting for complete recognized fences; there is
still no highlighting dependency or extension path. Decision 0030 defines the
exact table delimiter grammar and literal malformed fallback.

## Visual contract

Replace decision 0019's four-tone vocabulary by adding `emphasis` to the closed
semantic vocabulary. Decision 0027 later adds `success` and `failure` for
authoritative application state. `emphasis` is owned bold
text in the terminal's default foreground. It expresses document hierarchy
without borrowing the cyan product identity role or the yellow approval and
failure role.

Decision 0030 extends Markdown-derived content to the existing `accent` role
without adding a tone. The complete current mapping is:

- headings, strong text, and table headers use `emphasis`;
- italic emphasis retains the surrounding prose tone and selects only the
  closed `italic` slant;
- inline code and fenced language labels use `accent`;
- list markers, quote rails, and table separators use `muted`;
- prose, quoted content, and table bodies use `plain`;
- unknown or unlabeled fenced code content uses `plain`; and
- recognized complete fences may use only the five syntax roles registered by
  decision 0031.

The parser selects these roles and the italic-emphasis slant from syntax. Model,
provider, tool, and user text cannot supply style metadata, color, escape
sequences, or renderer instructions. The restrained hierarchy is
syntax-derived. Assistant prose remains unboxed;
fenced code and strict tables use the generic dark `inset` surface under
decisions 0030 and 0031. A strict table has one muted header rule across its
measured row extent inside that surface, without an outer border or full grid.
The feature introduces no badges, icons, or
product-specific concepts.

## Bounds, security, and failure behavior

Input is rejected before parsing when it exceeds `displayTextCodeUnits`.
Line-ending normalization, tab expansion, control replacement, lone-surrogate
replacement, conservative Unicode cell measurement, wrapping, row retention,
and final frame validation remain owned by the generic TUI under decision 0025.
Parsing is linear
in accepted input size and performs no recursion, network access, filesystem
access, callbacks, or dynamic dispatch.

Each logical line is bounded by the existing structured-row span limit. If
recognized inline syntax would exceed that limit, the complete sanitized line
falls back to one span using the caller-owned prose tone and no parser-selected
slant instead of failing the terminal session or partially applying style.
Oversized or invalid structural inputs return the
existing content-free `ComponentError`; rejected personal content and parser
causes are never retained. Final `RichRow`, `Fragment`, and `Frame` validation
remain independent defenses.

The first product integration replaces the conversation transcript's plain text
component. Each structured user or assistant entry is a separate document, so
user or model syntax cannot consume or style a later message. Role metadata
stays outside Markdown and selects only CLI-owned container composition.
Tool activity, status, input, provider data, and runtime state do not enter the
Markdown parser. Streaming reparses the current bounded message snapshot with no
hidden incremental state. An incomplete construct therefore stays literal until
the closing delimiter arrives within that same message.

## Verification

Focused tests must prove every accepted construct, literal unsupported and
incomplete syntax, precedence, non-nesting, span-limit fallback, input bounds,
line ending and control normalization, lone surrogates, tabs, wide scalars,
word and literal-cell wrapping, structural continuation prefixes, long-token
fallback, head and tail anchoring, tiny viewports, immutable rows, fixed
tone-and-slant mapping, strict-table header-rule extent, ANSI reset,
differential redraw, streaming completion, visible selection without inline
delimiters, and CLI transcript and cross-message isolation. The canonical
verifier remains the Windows and Linux release gate.

## Update, rollback, and removal

Changing syntax, precedence, delimiter completion, document isolation, role
mapping, bounds, fallback, normalization, decision 0025 wrapping, or anchoring
requires parser, component, renderer, CLI view, privacy, manual, and policy regressions
in the same change. A new construct requires a present product need and an
update to this closed list; it is not admitted through an extension hook.

To remove Markdown, first replace the transcript `MarkdownBlock` with the plain
`TextBlock`, then delete the Markdown parser, component, exports, and focused
tests. Remove this decision and its manual and policy registrations in the same
change. If no other component uses `emphasis`, remove that tone with renderer
and structured-row tests. If italic emphasis alone is removed, delete its exact
delimiter branch and display-run slant propagation while retaining the generic
closed `TextSpan` slant used by user prose and tool identity. Decision 0027's
lifecycle tones remain independent.
Structured rows, scroll, tool activity, input, runtime, providers, and core
remain independently buildable.
