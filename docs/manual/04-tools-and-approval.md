# 04 - Tools and permissions

## Permission policy

`/permissions` edits one process-only mode per tool:

- `Allow`: run a valid plan without pausing;
- `Ask`: show the exact request for an operator decision; and
- `Deny`: reject it without invoking the handler.

Reads start as `Allow`; writes and execution start as `Ask`. A pending `Ask`
offers `Allow once`, `Allow for session`, and `Deny`. Session allowance changes
only the exact tool, not paths, argument patterns, schemas, bounds, platforms,
or stale-state rules.

All tool paths are relative to the canonical workspace shown in the footer.
Permission cannot turn that boundary into a machine sandbox. An approved shell
command retains the launching user’s filesystem and network authority.

## Tool inventory

Agent advertises exactly these names and no aliases:

| Tool | Capability |
| --- | --- |
| `read_file` | Read one bounded file, optionally by one-based logical line range |
| `list_directory` | Enumerate one directory without recursion or file content |
| `search_text` | Search bounded text while pruning denied paths |
| `apply_patch` | Create or update one text file through ordered exact hunks |
| `manage_path` | Create one directory, move one object, or remove one file/empty directory |
| `shell` | Run one exact approved command through the fixed native shell |

The read tools share built-in sensitive-path denials and root `.agentignore`.
Rules are root-relative, use `/` between segments, allow `*` inside a segment,
at most one complete `**` segment across directories, and a trailing `/` for a
directory. Negation, absolute paths, backslashes, surrounding whitespace,
duplicate rules, and `.`/`..` segments are invalid. Invalid policy blocks
startup rather than dropping a rule.

`apply_patch` rejects ambiguous, reordered, overlapping, ineffective, oversized,
or stale hunks. Permission binds to observed object/content state. One successful
invocation is one object-bound file publication, not a multi-file transaction,
rollback mechanism, durability guarantee, or sandbox.

`manage_path` never creates parents, overwrites, merges, or removes recursively.
Only `move` supplies `destination`. Windows supports directory creation, move,
and removal. Linux currently supports verified directory creation only; move and
remove fail before path-specific planning or permission.

`shell` accepts one command and one workspace-relative working directory. Linux
uses profile-free `/bin/bash`; Windows uses profile-free non-interactive Windows
PowerShell with a fixed UTF-8 prelude. The model cannot choose the shell,
executable path, environment, stdin, timeout, process bound, or output bound.
The environment excludes provider credentials and unfiltered parent values.

Pipelines, redirection, PATH-discovered coding tools, and shell control flow are
part of the approved command. Interactive programs, retained background
services, and work surviving settlement are unsupported. Agent bounds and
cleans the entire descendant tree before reporting completion.

## Ordering

One model-selected batch is validated before any call executes. Plans and
permissions settle in provider order. Effects and dependent reads remain
sequential. Two to four independent sibling read calls may execute as one
cohort after every permission settles; Agent awaits them all, returns results in
provider order, and creates one checkpoint. A cohort is not an atomic filesystem
snapshot and never overlaps a write or shell command.

## Previews and activity

A pending `apply_patch` permission shows the canonical path and a bounded human-
readable projection of exact removed/inserted rows. Omission is explicit; the
complete effect stays in the immutable plan. `manage_path` previews contain only
the closed operation, canonical paths, object kind, and stale-state identity.

The activity area shows only the current tool and safe bounded subject. It is
released when the turn settles and does not become transcript or log content.

## Failure categories

- `permission`: session policy or read-disclosure policy rejected the call.
- `conflict`: observed state changed; reassess and plan a new exact effect.
- `unsupported`: the operation or required platform guarantee is unavailable.
- `limit`, `not found`, `I/O`, or cancellation: the call settled without
  widening or silent retry.
- A nonzero shell exit is a truthful failed result with bounded output; launch,
  containment, timeout, overflow, protocol, and cleanup failures expose stable
  content-free categories.

A later model failure does not erase a completed checkpoint. Never repeat a
settled effect merely because the continuation failed.

See [Security](../../SECURITY.md) for the threat boundary and
[Architecture](../ARCHITECTURE.md) for implementation ownership.
