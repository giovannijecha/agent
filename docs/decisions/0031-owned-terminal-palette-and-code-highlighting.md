# 0031: Owned terminal palette and code highlighting

- Status: accepted
- Date: 2026-08-11
- Updated: 2026-08-13
- Amended by: decisions 0032 and 0040

Decision 0040 removes the structured-region background while retaining this
decision's closed foreground roles, lexical roles, bounded language profiles,
and renderer contracts. The 2026-08-13 visual refinement replaces the earlier
indexed SGR values below with one fixed RGB mapping; the earlier values remain
the historical baseline for the original decision.

## Context

Decision 0030 separated assistant prose from fenced code and strict tables, but
the first implementation reused the same bright gray surface as user turns and
rendered every code body as plain text. Human review found both choices too
flat: the structured background was visually heavy, while identifiers,
keywords, strings, comments, and literals had no scan hierarchy. The existing
bold-cyan `accent` also read as louder and colder than the quiet interface.

The improvement must remain an owned terminal primitive. It cannot import a
syntax library, execute or parse code as a compiler, expose arbitrary theme
values, add language plugins, or create a second Markdown and wrapping path.

## Decision

The renderer keeps one closed semantic palette. `accent` becomes muted steel
blue without bold weight. Decision 0032 later refines its mapping from
`38;5;110` to the quieter `38;5;67`. Lifecycle truth remains unchanged:
`attention` is bold yellow, `success` is bold green, and `failure` is bold red.
`plain`, `muted`, and `emphasis` retain their existing meanings.

Five code-only foreground roles are added:

- `syntaxKeyword`: clear blue (`38;5;75`) for language keywords and operators
  that define structure;
- `syntaxName`: pale blue (`38;5;117`) for tag, attribute, property, command,
  and data-key names;
- `syntaxString`: warm sand (`38;5;180`) for quoted strings;
- `syntaxLiteral`: muted sage (`38;5;150`) for numeric and fixed literals; and
- `syntaxComment`: quiet green (`38;5;108`) for comments.

These are renderer-owned semantic roles, not arbitrary RGB values or a public
theme registry. Markdown may derive them only from a complete recognized fence.
They never express lifecycle state, and untrusted text cannot name a role.

The current renderer mapping is one closed 24-bit SGR palette:

- `accent`: `102,155,210`;
- `muted`: `112,124,137`;
- bold `attention`: `230,191,95`;
- bold `success`: `134,203,146`;
- bold `failure`: `232,112,112`;
- `syntaxKeyword`: `105,184,255`;
- `syntaxName`: `131,213,245`;
- `syntaxString`: `221,184,134`;
- `syntaxLiteral`: `166,213,123`; and
- `syntaxComment`: `127,157,135`.

The current closed surfaces are `subtle` at `31,38,47`, retained `inset` at
`18,24,31`, `success` at `22,55,34`, `attention` at `62,50,19`, and `failure`
at `62,24,27`. `plain`, bold `emphasis`, and italic slant retain their existing
non-color semantics. The renderer emits these only through `38;2` and `48;2`
SGR sequences; there is no theme registry, terminal probe, environment-driven
palette, or model-selected value. A terminal without 24-bit color support may
degrade the colors, but text, geometry, semantic state, and cleanup remain
authoritative.

The closed surface vocabulary adds `inset`. `subtle` keeps the existing user
turn background. `inset` maps to dark anthracite (`48;5;235`) and is used by
fenced code and strict tables. Foreground tone, slant, and surface remain
independent validated dimensions.

The Markdown compiler delegates fenced bodies to one internal, original,
line-oriented lexical highlighter. It recognizes exactly these aliases:

- markup: `html`, `xml`, `svg`;
- script: `js`, `jsx`, `javascript`, `ts`, `tsx`, `typescript`, `mjs`, `cjs`;
- data: `json`, `jsonc`;
- style: `css`, `scss`;
- shell: `sh`, `shell`, `bash`, `zsh`, `powershell`, `ps1`, `cmd`, `bat`.

Aliases are normalized to lowercase. Empty and unknown language labels keep the
body plain. The highlighter recognizes comments, quoted strings, fixed and
numeric literals, and a deliberately small language-specific structural
vocabulary. Markup tracks tags and attributes and switches to the registered
style or script profile inside complete `<style>` and `<script>` regions. It is
lexical display assistance only: it does not claim grammar correctness, perform
name resolution, execute code, or alter the displayed bytes.

The highlighter returns immutable semantic runs to the existing display-line
pipeline. That pipeline still owns control replacement, Unicode cell width,
literal code wrapping, clipping, surface padding, structured rows, final frame
validation, and ANSI emission. No public extension point or product-specific
code component is added.

This decision amends decisions 0027, 0028, and 0030. Their traffic-light truth,
conversation grammar, structured-region grammar, and single renderer path stay
in force.

## Bounds, security, and responsive behavior

Highlighting is a deterministic linear scan over already bounded sanitized
lines. State is one immutable closed value carried only between lines of the
same complete fence. Adjacent equal tones are merged. If one highlighted line
would exceed the existing span limit, the whole line falls back to one `plain`
run without losing its `inset` surface. Unknown aliases also fail closed to
plain text.

The scanner performs no I/O, dynamic import, regular-expression backtracking,
code evaluation, language discovery, or callback dispatch. Tokens never retain
secret metadata and failures never include source content. ANSI remains absent
from components and is generated only from validated renderer roles. Surface
padding still drops before content on viewports narrower than three cells.

## Verification

Focused tests prove exact renderer sequences for every closed role and surface,
the unchanged traffic-light mappings, the unchanged user `subtle` surface,
plain fallback for empty and unknown languages, bounded span fallback, and
representative markup with embedded style/script, script, JSON, CSS, and shell
tokens. Tests also prove multiline comment state, source-byte preservation,
control replacement, table inset rendering, wrapping, clipping, and document
isolation. Existing CLI, runtime, tool, provider, privacy, resize, scroll, and
non-interactive tests remain required. The canonical Windows and Linux verifier
is the release gate.

## Update, rollback, and removal

Changing an alias, lexical rule, semantic role, RGB value, SGR mapping, surface mapping,
fallback, or bound requires this decision, tone and style guards, highlighter,
Markdown compiler, renderer tests, manual, architecture, policy, and removal
guidance to change together. A new language profile needs a concrete current
display need and representative adversarial tests; it cannot arrive through a
runtime registry.

To roll back only 24-bit color, restore one reviewed fixed indexed mapping and
its exact renderer, decision, manual, and policy tests without changing semantic
roles. To remove highlighting while keeping structured surfaces, replace highlighted
fence rows with one `plain` run and delete the internal highlighter and its
tests. To remove the technical palette, map structured regions back to
`subtle`, remove `inset` and the five syntax roles from validation and the
renderer, then update exact byte tests and this decision. Markdown parsing,
generic surfaces, user turns, structured rows, wrapping, scrolling, tools,
runtime, providers, and core remain independently buildable.
