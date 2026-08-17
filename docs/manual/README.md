# Agent operator manual

Use this manual to run, understand, and maintain the behavior that exists today.

## Chapters

1. [Reading this manual](00-reading-this-manual.md)
2. [Running agent](01-running-agent.md)
3. [Turn lifecycle](02-turn-lifecycle.md)
4. [Terminal interface](03-terminal-interface.md)
5. [Tools and permissions](04-tools-and-approval.md)
6. [Providers and authentication](05-providers-and-authentication.md)
7. [Verification and diagnostics](06-verification-and-diagnostics.md)
8. [Publishing and governance](07-publishing-and-governance.md)

## Current product boundary

- The executable owns its CLI, TUI, runtime composition, and local tools.
- Ollama Cloud is the sole optional process-local backend. Startup enters the
  TUI with neither provider nor model selected.
- Credentials and sessions are not persisted. The
  [privacy policy](../../PRIVACY.md) owns retention and removal guarantees.
  Subscription OAuth remains blocked without an eligible independent-client
  identity.
- Process execution is limited to the documented `run_process` contract: the
  CLI-registered `node` token, session permission, fixed bounds, and native
  containment.
- `read_file` keeps one canonical name and can return either the complete
  bounded file or an exact bounded logical-line projection with continuation
  metadata.
- Every tool has one canonical name and one independently removable purpose.

## Documentation contract

Each numbered chapter follows the task-specific section order registered in
`tools/manual-policy.json`. A chapter contains only the guidance needed for its
operator task; it links to the canonical engineering or decision owner instead
of repeating repository-wide evidence inventories.

The release gate checks the exact chapter set, declared section order, local
links, command and tool inventories, and the existence of registered reference
paths. The [documentation map](../README.md) owns document roles, and
[decision 0071](../decisions/0071-owned-task-oriented-operator-manual.md) owns
this manual contract.
