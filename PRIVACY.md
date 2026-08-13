# Privacy policy

## Current product

`agent` is local-first software maintained by Giovanni Jecha. It has no project
cloud service, analytics, advertising, crash-reporting endpoint, or telemetry.
The production executable is providerless by default and persists no chat
session or credential.

Without a configured runtime, submitted text is discarded after a generic
notice. It is not added to conversation state, displayed in the transcript,
written to disk, or sent over a network.

## Local tools

The five filesystem tools share the one canonical workspace selected at
startup, and `run_process` starts in one selected directory beneath it.
Filesystem handlers do not use ambient network access. Read operations are
automatic; each write or execute operation requires its own explicit approval.
The terminal UI avoids placing raw prompts, file contents, tool outputs,
credentials, and foreign error causes in notices or logs.

The current release has no `.agentignore` or built-in sensitive-path filter.
Supported files anywhere beneath the selected root may therefore be returned by
a read tool and sent to the configured provider as a tool result. Start `agent`
from the narrowest intended directory and do not place credentials or unrelated
personal content inside it. Decision 0042 records the separate future privacy
tranche; its acceptance is not a claim that filtering already exists.
An approved `run_process` invocation is lifecycle-contained but not filesystem-
or network-sandboxed; its Node code retains the launching user's authority.

## OpenCode Go connection

When the operator enters an OpenCode Go key through the owned hidden prompt or
configures the exact environment variable and submits a turn, `agent` sends the
system instruction, bounded conversation,
owned tool schemas, user input, and necessary checkpointed tool calls and
results directly to `https://opencode.ai/zen/go/v1/chat/completions`. Provider
processing is governed by OpenCode's terms and privacy policy; requests never
pass through a project-owned backend. The official Go page currently states
zero-day retention and no training for Kimi K2.7 Code. Those terms can change
and are not guarantees made by this project.

`agent` never asks for provider passwords, cookies, recovery codes, payment
details, or one-time codes. The OpenCode Go API key is accepted only through the
documented hidden prompt or environment variable and remains in process memory.
The prompt disables terminal echo and writes no key or mask characters.
Persistent storage requires a separate accepted operating-system vault design.
The four subscription OAuth connections remain disabled.

## Future local sessions

Local session persistence is disabled. If implemented, it must be opt-in,
versioned, bounded, inspectable, removable, and documented before release. It
must not silently upload or synchronize session data.

## Removal

Closing the current process releases its in-memory conversation, display state,
and key reference. The operator must also remove the environment variable from
any still-running parent shell. Removing the workspace removes all owned source and generated artifacts;
installed toolchain software remains outside the project. Future persistence or
credential features must add exact deletion instructions here before they ship.
