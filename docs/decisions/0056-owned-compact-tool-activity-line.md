# 0056: Owned compact tool activity line

- Status: accepted
- Date: 2026-08-15
- Presentation amended by: decisions 0057 and 0060

Decision 0057 keeps the action table, status marks, split priority, and latest-only
lifecycle below while making the surface transparent, removing repeated canonical
name and risk from the visible head, and admitting one optional useful safe subject.
Decision 0060 retains the compact hierarchy while giving validated removed and
inserted patch rows separate non-bold direction foregrounds.

## Context

The latest-only activity surface correctly keeps tool lifecycle outside the
transcript, but its shared head and separate risk row make even a read or
settled call occupy a broad two-row color block. The presentation is truthful
yet visually heavier than the surrounding conversation and does not establish
the compact scan line expected from the current conversation grammar.

The refinement must not retain an activity history, expose tool arguments or
results, invent duration or count metadata, change permission authority, or add
tool-specific components. It must continue to use the one CLI-owned lifecycle
snapshot and the generic TUI composition path.

The operator-provided screenshot is treated only as an observable preference
for compact scan rhythm and aligned facts. No foreign source, component
hierarchy, identifier, literal, timing, or rendering algorithm is inspected or
reused.

## Decision

Project every current tool snapshot through one pure CLI-owned presentation
table. The table covers exactly the six advertised tool names and risks and
assigns these display-only action labels:

- `read_file` becomes `Read`;
- `list_directory` becomes `List`;
- `search_text` becomes `Search`;
- `apply_patch` becomes `Write`;
- `manage_path` becomes `Manage`; and
- `run_process` becomes `Run`.

These labels are presentation text only. They are not tool aliases, command
names, model-visible identifiers, or dispatch inputs. An unknown tool or risk
mismatch fails the presentation invariant rather than receiving a fallback
label.

Every visible snapshot begins with one compact main line inside the existing
stage-wide borderless `Surface`. Under decision 0057 it is transparent. The left
side contains, in order, one status mark, the action label, and an optional useful
safe subject. The right side contains the written lifecycle state. Canonical tool
name and risk validate the projection but do not repeat in the visible head. One
shared `SplitLine` owns the alignment and gives the written state retention
priority. Left-side clipping retains the mark and action label before the
optional safe subject.

The exact registered one-cell bullet `U+2022 BULLET` marks non-negative states.
The ASCII `x` marks `failed`, `denied`, and `cancelled`. The mark never carries
truth alone: the lifecycle state remains written and its matching restrained
foreground remains authoritative. No activity-specific width
rule, icon registry, animation, border, rail, or panel is added.

Queued, running, cancelling, succeeded, failed, denied, and cancelled snapshots
occupy exactly the compact main line and never replay a preview. Pending
`permission` uses the same main line and may append the exact bounded
human-readable effect preview beneath it. A read permission has no preview and therefore stays
one line. The separate transparent permission selector remains below activity.
When height is constrained, the main line and the required contextual decision
survive before optional preview rows.

The current snapshot is still the only activity projection. A next tool replaces
it, turn settlement removes it, and no tool activity enters the transcript.
The presentation adds no timing, path, result, line-count, hit-count, output, or
call-identity field. Future trustworthy metadata requires its own owned source,
privacy contract, bounds, lifecycle, and decision before it can appear.

## Verification

Pure projection tests bind the six display entries to the exact permission
catalog, cover every lifecycle truth class and status mark, and reject unknown
names and risk drift. Chat rendering tests cover compact success, active,
negative, and read-permission states; expanded mutation permission; exact
preview wrapping; wide and narrow alignment; constrained-height retention;
latest-only replacement; transcript exclusion; transparent surfaces; and
semantic mark/state foregrounds.

Canonical verification continues to prove the closed glyph width, generic
component path, manual evidence, build, tests, and CLI smoke behavior.

## Rollback and removal

Rollback removes the presentation table and restores one reviewed generic
activity projection without changing the lifecycle log or permission engine.
Removing or replacing a tool updates its display entry in the same change as
its descriptor, permission entry, tests, manual inventory, and removal record.
Removing activity presentation entirely follows decisions 0008 and 0022 and
does not leave a transcript fallback.
