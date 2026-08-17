# 04 - Tools and permissions

## Review permissions

Run `/permissions` to review the six tool modes for the current process. Up and
Down select a tool without wrapping, Left and Right change its mode, and Enter
closes the editor.

The available modes are:

- `Allow`: run a valid planned call without stopping;
- `Ask`: show the exact call for an operator decision; and
- `Deny`: reject the call without invoking its handler.

`read_file`, `list_directory`, and `search_text` start as `Allow`.
`apply_patch`, `manage_path`, and `run_process` start as `Ask`. Changes apply
only to the current Agent process and are discarded on exit.

## Decide a request

An `Ask` request offers exactly `Allow once`, `Allow for session`, and `Deny`.
Use Up and Down to select an action and Enter to apply it. `Allow once` covers
only the current call. `Allow for session` changes only that exact tool and
also allows the current call. It does not grant a path pattern, argument
pattern, or broader workspace capability.

Review the operation, useful subject, and any effect preview before deciding.
A failed plan asks for no permission because no valid effect exists. Permission
never widens path checks, schemas, limits, stale-state validation, process
containment, or platform support.

All paths are relative to the canonical workspace shown in the footer; `.` is
the workspace root. The workspace boundary is not a machine sandbox. In
particular, approved Node code still runs with the launching user's filesystem
and network authority.

## Know the tools

Agent advertises one name for each admitted capability and no aliases:

| Tool | Unique capability | Risk | Current necessity |
|---|---|---|---|
| `apply_patch` | `patch-one-text-file` | `write` | Creates or updates one file through ordered exact-text hunks without broad overwrite or shell authority. |
| `list_directory` | `enumerate-one-directory` | `read` | Discovers one directory without reading file contents or recursing. |
| `manage_path` | `manage-one-workspace-path` | `write` | Creates one directory, moves one file or directory, or removes one file or empty directory without shell or recursive authority. |
| `read_file` | `read-one-file` | `read` | Inspects one known file without traversing unrelated workspace paths. |
| `run_process` | `run-one-contained-process` | `execute` | Runs one terminating structured process inside owned whole-tree containment without shell, PATH, stdin, or inherited user-environment authority. |
| `search_text` | `search-bounded-text` | `read` | Locates exact text with bounded traversal instead of many model-directed reads. |

The read tools apply built-in sensitive-path denials and an optional root
`.agentignore`. Empty lines and lines beginning with `#` are ignored. Other
lines are root-relative deny patterns: `/` separates segments, `*` stays within
one segment, one complete `**` segment may span directories, and a trailing `/`
means a directory. Negation, absolute paths, backslashes, surrounding
whitespace, empty, `.` or `..` segments, duplicate rules, and unsafe control or
format characters are invalid. The file admits at most 128 rules in 16,384
bytes; each rule admits at most 256 code units and 32 segments. Linux matching
is exact, while Windows folds ASCII letters and rejects ambiguous DOS short
names.

`read_file` may return a one-based bounded line range through `startLine` and
`lineCount`; omitting both returns the complete bounded file. `list_directory`
omits denied children, and `search_text` prunes denied files and directories
before reading them.

`apply_patch` creates or updates one text file from ordered exact-text hunks. It
rejects ambiguous, overlapping, reordered, no-op, oversized, or stale changes.
It is one object-bound file commit, not a multi-file transaction, rollback
mechanism, durability guarantee, or filesystem sandbox.

`manage_path` creates one directory, moves one file or directory to an absent
destination, or removes one file or empty directory. It never creates parents,
overwrites, merges, or removes recursively. Windows supports all three
operations. Linux currently supports only `create_directory`; `move` and
`remove` fail as `unsupported` before path-specific observation or permission.

`run_process` accepts only the registered `node` token, literal arguments, and
one workspace-relative working directory. It accepts no shell, executable
path, PATH lookup, stdin, inherited user environment, background service, or
model-selected limit. The process and its descendants are bounded and cleaned
up before settlement.

Calls from one model decision are validated as a batch, planned just in time,
and executed sequentially in provider order. Each valid plan receives its own
permission decision and becomes a conversation checkpoint after settlement.

## Read previews and activity

Only a pending permission may show an effect preview. An `apply_patch` preview
shows the canonical path and bounded changed rows: removed rows use a visible
`- ` prefix and red text, while inserted rows use `+ ` and green text. Omitted
content is reported explicitly. The complete authorized effect remains bound
to the plan even when the preview is shortened.

The activity area shows only the latest tool while a turn is active. Its mark,
display action, optional safe subject, and written state distinguish permission,
queued, running, cancelling, succeeded, failed, denied, and cancelled work. The
next tool replaces it, and turn settlement removes it. Tool activity and effect
previews never become transcript history.

## Handle failures

- `permission` means the session policy or read-disclosure policy rejected the
  request. Review `/permissions` or the workspace policy; do not bypass it.
- `conflict` means the approved filesystem state became stale. Reassess and
  plan a new exact effect instead of reusing the old approval.
- `unsupported` means the requested program, platform, operation, or required
  native guarantee is not admitted. Changing permission cannot enable it.
- `limit`, `not found`, `I/O`, and cancellation failures settle without
  widening or silently retrying the call.
- A nonzero `run_process` exit is failed tool activity, but its bounded output
  remains available to the model for diagnosis. Containment, timeout, overflow,
  launch, protocol, or cleanup failures expose only stable categories.

An invalid `.agentignore` blocks startup instead of dropping a rule silently.
Its diagnostic does not reveal the rejected pattern or path, and edits to the
file take effect only in a new Agent process.

After any completed tool checkpoint, a later model or runtime failure retains
that completed tool truth. Check the reported category before retrying so a
settled effect is not repeated.

## References

- [Current tool and permission architecture](../ARCHITECTURE.md#lean-tool-harness)
- [Interactive permission flow](../ARCHITECTURE.md#interactive-terminal-flow)
- [Tool-engine maintenance](../MAINTENANCE.md#update-or-remove-the-tool-engine)
- [Permission maintenance](../MAINTENANCE.md#update-or-remove-session-tool-permissions)
- [Privacy policy](../../PRIVACY.md)
- [Current authority by domain](../decisions/README.md#current-authority-by-domain)
- [Minimal capability decision](../decisions/0050-owned-minimal-coding-capability-surface.md)
- [Text-patch decision](../decisions/0053-owned-structured-text-patch.md)
- [Namespace decision](../decisions/0054-owned-workspace-namespace-management.md)
- [Session-permission decision](../decisions/0055-owned-session-tool-permissions.md)
- [Linux namespace boundary](../decisions/0058-owned-linux-namespace-fail-closed-boundary.md)
