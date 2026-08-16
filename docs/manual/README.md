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
- OpenCode Go and OpenCode Zen are optional; without either documented
  memory-only key, startup is providerless.
- Credentials and sessions are not persisted. Subscription OAuth remains
  blocked without an eligible independent-client identity.
- Process execution is limited to the documented `run_process` contract: the
  CLI-registered `node` token, session permission, fixed bounds, and native
  containment.
- `read_file` keeps one canonical name and can return either the complete
  bounded file or an exact bounded logical-line projection with continuation
  metadata.
- Every tool has one canonical name and one independently removable purpose.

## Documentation contract

Every numbered chapter follows the same workflow, guarantees, failure,
maintenance, and evidence structure. The release gate checks its links,
commands, tools, risks, and source evidence against `tools/manual-policy.json`.
Architecture, engineering rules, and decision records remain the deeper change
contract.
