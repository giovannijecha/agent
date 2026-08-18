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
- The [provider policy](../PROVIDERS.md) owns admission, exact network
  boundaries, and subscription eligibility. Ollama Cloud is the sole optional
  process-local backend; startup enters the TUI with neither provider nor model
  selected.
- Credentials, catalogs, provider/model selection, permission policy, drafts,
  and active turns are not persisted. Explicit interactive launches retain
  only the bounded settled session journal documented by the
  [privacy policy](../../PRIVACY.md), which owns retention and removal guarantees.
- Process execution uses the documented `shell` contract: one exact approved
  command, a fixed profile-free native shell, controlled credential-free
  environment, fixed bounds, and native whole-tree containment.
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
