# 0053: Owned structured text patch

- Status: accepted
- Date: 2026-08-15

## Context

Decision 0050 converges the two model-facing text mutation tools into one
`apply_patch` capability. The existing `create_file` and `replace_text`
planners already bind approval to canonical workspace state and cross the
handle-relative committer from decision 0046. They nevertheless split one
authority domain, and one-match replacement makes a coherent multi-location
edit require several calls, approvals, and intermediate file states.

Importing a general patch parser or accepting an unbounded diff language would
add syntax, path-selection, and failure behavior that the product does not own.
Sending complete replacement files for every update would be simple but would
make small edits expensive in provider context and easier to apply against the
wrong source. The replacement must therefore retain exact source anchors,
bounded planning, one approval, and one native commit without adding a second
write path.

## Decision

Replace `create_file` and `replace_text` atomically with one model-facing
`apply_patch` tool. Its closed input contains:

- one workspace-relative `path`; and
- an ordered list of one through 32 `hunks`, each with exact `oldText` and
  `newText` strings.

This is an owned structured patch, not unified diff, JSON text, shell input, or
a pathname-bearing patch document. The descriptor schema owns the structure;
the patch never selects another path.

For an absent target, the list must contain exactly one hunk whose `oldText` is
empty. Its `newText` is the complete new file, including the valid empty-file
case. Planning binds the effect to target absence, the canonical parent path,
and parent identity.

For an existing target, every `oldText` is non-empty and differs from its
`newText`. Each anchor must occur exactly once in the same complete observed
UTF-8 source snapshot. Hunks must already be in strictly ascending,
non-overlapping source order. Planning applies them to that one snapshot, not
to the result of preceding hunks. Insertions use an exact non-empty surrounding
anchor whose replacement retains the anchor plus inserted text; deletions use
an empty `newText`. Ambiguous, repeated, missing, reordered, overlapping, or
no-op hunks fail before approval.

The final registry exposes `apply_patch` and exposes neither old name. Internal
native protocol operation kinds remain `create` and `replace`: they describe
the selected filesystem commit primitive, not model-facing aliases. One
approved patch plan maps to exactly one of those commits and crosses the owned
committer exactly once.

## Bounds, preview, and failures

The complete structured input remains within the core structured-value bound.
The planner additionally admits at most 524,288 aggregate hunk code units and
2,097,152 aggregate hunk UTF-8 bytes. The observed and resulting file retain
the existing 262,144-code-unit and 1,048,576-byte bounds. NUL and invalid
Unicode scalar text fail schema validation or strict source decoding.

Approval shows one bounded concrete patch preview containing the canonical
path, create or update effect, observed state or digest, resulting digest,
hunk count, aggregate changed-line counts, and one ordered structured hunk
list. The preview declares its tuple fields once; every remove and insert text
is escaped as an independent structured value and carries its complete
code-unit length, so retained text can never imitate a field or hunk boundary.
Exact text is shown when the list fits. Larger fields use deterministic prefix
and suffix excerpts with an exact per-field omitted-code-unit count. If no text
excerpt fits, the final closed projection retains every ordered hunk as its
exact remove and insert code-unit lengths plus matching omitted counts. It
never drops, merges, or reorders a hunk to fit the preview bound. Terminal
activity may summarize this preview under the shared lifecycle surface, but
settlement never replays it.

Invalid structure, an absent target without the creation form, a present target
with an empty anchor, ambiguous or overlapping anchors, oversized input or
result, unsupported source text, and stale state settle through the existing
content-free tool failures. A failed plan requests no approval. The disclosure
read policy remains separate and does not inspect or restrict approved writes.

## Lifecycle and platform boundary

Planning is a pure structured-patch application over one immutable observed
snapshot. Invocation retains that snapshot, canonical relative path, identity,
and complete proposed content. Creation and replacement then reuse decision
0046 unchanged: Linux and Windows select the approved object through their
owned handle-relative primitives, reject stale identity or content, and never
fall back to a portable pathname write.

One patch changes one regular file. It is not multi-file atomicity, rollback,
filesystem sandboxing, path removal, directory creation, rename authority, or
storage durability. Missing parent directories remain a planning failure;
future namespace work belongs only to `manage_path`.

## Verification

Pure patch tests cover creation, empty creation, multiple ordered hunks,
insertion through a retained anchor, deletion, Unicode, mixed line endings,
missing and repeated anchors, reorder, overlap, no-op updates, aggregate bounds,
and result bounds. Tool tests cover the one public descriptor, schema rejection,
bounded approval previews, exact output, no approval on failed planning, stale
content and identity, target appearance, parent replacement, unsupported
source text, read-policy independence, the maximum admitted hunk batch with a
long path, and one committer call per approved effect.

Provider, runtime, activity, manual-policy, and canonical inventory tests use
only `apply_patch`. Both platform gates retain the complete native create and
replace regression suite because those are the two internal commit primitives.

## Update, rollback, and removal

Change the structured hunk grammar, limits, preview, planner, descriptor,
manual, security text, or tests together. A grammar extension must preserve
one path, one observed snapshot, one approval, and one native commit; otherwise
it requires a new decision.

Rollback is atomic: restore both previous descriptors and their planners before
removing `apply_patch`. Never advertise either old tool beside `apply_patch`.
Complete removal deletes the descriptor, structured patch planner and preview,
focused tests, documentation, and policy entry. If no automatic mutation tool
remains, also remove the native committer by following decision 0046 rather
than leaving dormant write authority.
