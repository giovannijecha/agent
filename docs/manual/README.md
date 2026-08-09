# Agent operator manual

This manual is the task-oriented entry point for the current `agent` workspace.
It documents only behavior that is implemented and verified. Architecture,
engineering rules, and decision records remain the deeper contract for changes.

## How this manual is governed

Every numbered chapter follows the same ordered sections: purpose, workflow,
guarantees and limits, failure behavior, maintenance and removal, and evidence.
The release gate checks chapter order, links, commands, canonical tool names,
risk classes, unique capabilities, unique necessity records, and cited source
paths against `tools/manual-policy.json`. Decision 0014 makes semantic alias
absence an explicit review obligation.

## Chapters

1. [Reading this manual](00-reading-this-manual.md)
2. [Running agent](01-running-agent.md)
3. [Turn lifecycle](02-turn-lifecycle.md)
4. [Terminal interface](03-terminal-interface.md)
5. [Tools and approval](04-tools-and-approval.md)
6. [Providers and authentication](05-providers-and-authentication.md)
7. [Verification and diagnostics](06-verification-and-diagnostics.md)
8. [Publishing and governance](07-publishing-and-governance.md)

## Current product boundary

The production executable provides the owned CLI, TUI, runtime composition,
registered local filesystem tools, and one optional direct OpenCode Go model
adapter. It remains providerless unless the operator supplies the exact
documented memory-only API key. It does not persist a credential or session,
perform subscription OAuth, or execute child processes.

The tool inventory is intentionally lean: one canonical name per distinct,
necessary, independently removable capability, with no aliases.

Start with chapter 01 to operate the current build. Read chapter 05 before
evaluating subscription access, and chapter 06 before treating a change as
complete. Read chapter 07 before creating the public repository or release.
