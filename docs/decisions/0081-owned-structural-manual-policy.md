# 0081: Owned structural manual policy

- Status: accepted
- Date: 2026-08-19
- Domain: documentation
- Supersedes: none
- Superseded by: none

## Context

The operator manual is a maintained authority whose observable behavior must
remain aligned with source, tests, and durable decisions. The initial selector-
dismissal gate tried to protect that alignment by classifying free-form English
sentences and by projecting a subset of operator-visible CommonMark. Each new
phrase, context split, HTML form, or fence edge case expanded a second prose and
Markdown interpreter inside maintainer tooling. Correcting one vocabulary or
rendering gap therefore exposed another equivalent bypass without increasing
confidence in the product behavior.

The repository admits no third-party Markdown parser, and a new owned parser
would duplicate the TUI renderer while still assigning semantic approval to a
mechanical verifier. A checksum over the complete chapter alone is also too
coarse: repinning it can silently absorb the loss or relocation of the few
clauses that state the protected behavior. The gate needs a closed structural
contract that is honest about what offline verification can prove.

## Decision

Manual-policy schema 12 protects the terminal-interface authority through three
independent structural layers:

- one SHA-256 digest binds the complete normalized chapter;
- one ordered SHA-256 digest binds every declared section body; and
- three bounded exact clauses are assigned to their canonical sections and
  must each occur exactly once after whitespace normalization.

The section inventory must equal the chapter's registered heading order. The
clause inventory is closed, unique, and limited to the accepted selector-
dismissal statements: ordinary input remains inert, Escape or Ctrl+C cancels,
and other typing and editing input remains ignored. Changing unrelated prose
requires explicit chapter and affected-section digest updates. Changing,
removing, duplicating, or relocating a protected clause also requires an
explicit clause-contract update.

The verifier does not parse CommonMark, determine rendered visibility, classify
English vocabulary, inspect adjacent sentences, or infer semantic equivalence.
A digest update identifies the exact reviewed artifact; it never constitutes
semantic approval. Decisions, regressions, maintainer review, and the canonical
verification gate remain the authorities for meaning and behavior.

## Bounds and failures

The contract admits exactly one chapter, its eight existing sections, and three
clauses. Paths, keys, headings, digests, clause text, section ownership, order,
cardinality, character classes, and bounded lengths are validated before use.
The verifier reads only already-registered repository text, allocates bounded
maps and arrays, performs no network or runtime product work, and adds no
dependency or alternative manual view.

Missing or reordered sections, stale digests, absent or duplicate clauses,
unknown fields, and malformed values fail closed with content-free maintainer
errors. Markdown syntax, including malformed or adversarial fence-like text,
has no special treatment and therefore cannot create an exclusion region in
the verifier.

## Verification

Focused regressions prove that chapter-only repinning cannot admit changes in
any section, including comment and fence-like inputs; removing a protected
clause still fails after both chapter and section repinning; an unrelated prose
revision succeeds only after the chapter and affected section are repinned; and
malformed section or clause inventories fail closed.

Documentation-policy tests bind this record, its metadata, domain membership,
current-authority route, and complete record digest. The canonical Windows and
Linux verification gates remain mandatory.

## Update, rollback, and removal

Changing section coverage, normalization, digest algorithm, clause count,
clause ownership, or bounds requires this decision, the manual policy,
validator, focused tests, maintenance guidance, decision index, documentation
policy, and ownership inventory to change together.

Rollback restores the previous schema, contract, validator, tests, and guidance
as one reviewed change. Removing the structural gate deletes all three layers
together after removing its publication requirement. Never retain or introduce
a parallel natural-language classifier, partial CommonMark parser, or private
manual projection.
