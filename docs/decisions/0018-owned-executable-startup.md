# 0018: Owned executable startup

- Status: accepted
- Date: 2026-08-09
- Amended: 2026-08-13 by decision 0042 for workspace-first startup

## Context

The built CLI can be started through `npm start`, but the repository does not
expose the product name as an executable and has no maintainer development
command. OpenCode Go also requires a manually prepared environment variable.
That workflow is safe but needlessly exposes provider setup details before the
terminal application starts.

Startup must stay useful if OpenCode Go is later removed. A provider-specific
launcher, persistent credential file, shell alias, or copied platform script
would make the executable harder to update and remove.

## Decision

Expose the root product as the `agent` npm binary backed by the compiled CLI
entry point. `npm run install:command` performs the explicit one-time local npm
link after a successful build; it installs no dependency. `npm run dev` is a
deterministic build-and-run command rather than a hidden watcher.

The executable accepts only no arguments, `--help`, or `--version`. Secrets are
never accepted as arguments. In an interactive terminal, a missing OpenCode Go
environment credential triggers one owned bounded prompt with terminal echo
disabled. Enter selects providerless startup and Ctrl+C cancels startup. The
prompt restores cooked input and removes listeners before the TUI takes terminal
ownership. Non-TTY execution never prompts and preserves exact plain output.

For normal startup, decision 0042 resolves the exact current directory into one
canonical immutable workspace boundary before the environment credential is
read or the prompt starts. Unsafe or inaccessible roots fail with one fixed
content-free diagnostic and cannot acquire provider, tool, runtime, or terminal
authority. Help and version remain independent of workspace selection.

The prompt is a CLI platform adapter, not part of core, runtime, tools, TUI, or
the provider wire package. It returns only an in-memory credential or a typed
content-free outcome. It writes no file, environment variable, history entry,
mask character, telemetry event, or diagnostic cause.

## Verification

Focused tests cover exact arguments, hidden input, editing, skip, cancellation,
invalid and oversized input, non-TTY behavior, listener removal, raw-mode
restoration, workspace canonicalization, protected-root rejection, and exact
footer display. The canonical smoke test proves the executable remains
escape-free and providerless when redirected. Manifest verification binds the
binary and script definitions exactly.

## Update, rollback, and removal

Change command arguments, prompt behavior, installation, or terminal ownership
only with this decision, focused tests, manual updates, and the canonical gate.
Never add a command-line secret, persistent store, provider fallback, or
implicit network request.

To remove OpenCode Go, delete its prompt and composition while retaining the
`agent` binary, argument parser, providerless startup, and npm link. To remove
the installed command, run `npm unlink --global agent-workspace`, then delete the
root `bin` and installation script; `npm start` remains available. To roll back
the complete change, also remove `dev`, the argument parser, this decision, and
their tests and documentation.
