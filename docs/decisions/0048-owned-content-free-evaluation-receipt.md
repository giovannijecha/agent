# 0048: Owned content-free evaluation receipt

- Status: accepted
- Date: 2026-08-14

## Context

Decision 0047 introduced reproducible task workspaces and closed result records,
but deliberately left duration and interaction counts to the operator until an
owned observation boundary existed. The first two maintained runs proved the
cost of that omission: one run lost its interaction counts, and the next needed
an external stopwatch plus manual counting while ephemeral activity replaced
itself. That friction weakens comparisons without revealing a missing
model-facing tool.

The product already serializes accepted turns, tool lifecycle events, approval
resolution, and tool handler invocation. Reusing those authoritative events can
produce bounded counts without capturing terminal output, prompts, responses,
tool results, file contents, or credentials. The offline evaluator must still
remain unable to launch `agent`, contact a provider, execute candidate code, or
approve effects.

## Decision

The executable admits one exact opt-in form, `agent --evaluation-receipt`, in
addition to its existing run, help, and version forms. Ordinary `agent` behavior
and output remain unchanged. The option requires interactive TTY input and
output and never changes provider, runtime, tool, approval, workspace, or
terminal authority.

One CLI-owned `EvaluationReceiptRecorder` observes only successful transitions
that already crossed the serialized application boundary:

- a runtime-accepted user turn increments `turns`;
- an application-accepted `toolRequested` event increments `toolCalls`;
- a successfully resolved affirmative approval increments `approvals`; and
- each successful canonical built-in read-target resolution presents one
  bounded request identity to the recorder. A later identical `read_file`,
  `list_directory`, or `search_text` identity increments `repeatedReads`.

Read identities contain the canonical workspace-relative target, the exact
read capability, and the exact search query where one exists. The recorder
immediately converts that bounded identity to an in-memory SHA-256 digest,
retains at most the receipt's 10,000-identity bound, emits no digest, and clears
the set when the receipt closes. It does not observe internal filesystem reads
made by write planners or process infrastructure.

Elapsed time starts immediately before the normal interactive application run,
after credential and platform initialization, and ends after application,
runtime, renderer, and terminal cleanup. The CLI uses its existing monotonic
operating-system clock source. Credential entry and startup construction are
therefore excluded; operator task entry, model work, approvals, and cleanup are
included.

After alternate-screen restoration, the opted-in executable writes one ASCII
JSON line to standard output with exactly:

```json
{"approvals":0,"elapsedMilliseconds":0,"repeatedReads":0,"schemaVersion":1,"toolCalls":0,"turns":0}
```

The line contains no outcome, artifact judgment, primary constraint, manual
correction count, or risky-action count. Those remain operator classifications:
they require task intent and semantic review rather than lifecycle observation.
The operator copies the five observed values into the existing decision 0047
record and completes the remaining closed fields. No receipt is written to the
workspace or evaluation run.

## Bounds and failure behavior

Every count is a non-negative safe integer capped at 10,000. Elapsed time is
capped at 86,400,000 milliseconds, matching the evaluation record. The recorder
accepts only the three exact read capability names, bounded canonical relative
targets, and the existing bounded search query. It rejects invalid construction,
clock regression, overflow, duplicate close, or observation after close with a
content-free error.

The executable rejects `--evaluation-receipt` before credential acquisition
when either standard input or standard output is not a TTY. Receipt formatting
or output failure returns nonzero after ordinary cleanup and emits one fixed
content-free diagnostic. A product run failure still completes cleanup and may
emit the counts observed before failure; it never changes the product failure
classification. Receipt observation cannot approve, deny, cancel, start, stop,
retry, or reorder any operation.

The recorder is memory-only, has no network or filesystem port, creates no
global state, and is constructed once at the CLI composition root. The offline
evaluator does not import product packages and the canonical verifier does not
activate the option.

## Verification

Pure recorder tests cover exact counters, distinct and repeated read identities,
bounded input, overflow, monotonic duration, single close, and closed JSON
shape. Launch parser tests cover the one exact option and reject combined,
duplicated, or unknown arguments. Built-in tool tests prove canonical successful
read observation without exposing paths. Runtime integration tests prove that
accepted turns, accepted tool requests, and successfully resolved affirmative
approvals increment their counters. A focused non-TTY invocation proves the
option fails before startup. Ordinary CLI smoke output remains unchanged because
it does not opt in.

The full Windows and Linux gates remain authoritative. They contact no provider,
create no evaluation run, and execute no candidate workspace.

## Consequences

Maintained evaluations no longer depend on an external stopwatch or memory of
ephemeral tool surfaces. The receipt is evidence about product interaction, not
a quality score, transcript, telemetry stream, or permission grant. It cannot
classify semantic correctness, operator corrections, risky intent, provider
quality, or task ambiguity.

The executable gains one narrowly removable public option but no command, tool,
provider, dependency, controller, persistent state, or ambient instrumentation.

## Update, rollback, and removal

Changing a counter definition, bound, clock interval, read identity, JSON field,
or activation form requires updating this decision, recorder tests, runtime and
tool integration tests, the evaluation guide, privacy and security guidance,
architecture, engineering, maintenance, README, AGENTS, and manual policy in one
change. Evaluation record schema changes remain governed separately by decision
0047.

To disable the feature, remove the launch option and composition-root wiring;
ordinary `agent` remains unchanged. To remove it completely, also delete the
recorder and its tests, read-observation hooks, this decision, and every
documentation and policy registration. The offline corpus, evaluator, record
schema, tool descriptors, runtime protocol, application controller, and TUI need
no replacement.
