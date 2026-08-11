# 01 - Running agent

## Purpose

Use this chapter to install only local workspace links, build owned source, start
the terminal application, and exit without leaving terminal state behind.

## Operator workflow

From the repository root in PowerShell:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run install:command
agent
```

The installation command performs one explicit local npm link and installs no
dependency. It is needed only once per clone or after unlinking. Run `agent`
from the directory that should become the coding-tool workspace. Maintainers
can instead use `npm run dev` from the repository root to rebuild and start, or
`npm start` to start an existing build.

Use `agent --help` for executable help and `agent --version` for the exact
version. Unknown or combined arguments fail; credentials are never accepted on
the command line. Interactive startup asks for a missing OpenCode Go key with
terminal echo disabled. Press Enter to start providerless or Ctrl+C to cancel.

The required toolchain is Node.js `>=22.19.0`, npm `11.16.0`, and TypeScript
`5.9.3` available on `PATH` but installed outside this workspace. This manual
is the command reference. In an interactive terminal, use `/exit` to close.

## Guarantees and limits

The lockfile contains only local workspace topology. Installation is offline,
ignores lifecycle scripts, and cannot fetch a package. Interactive mode requires
both TTY input and TTY output. Redirected execution prints a short plain status
without ANSI sequences. Production starts without a model when the key prompt
is skipped and the exact OpenCode Go environment variable is absent. Normal
text is then discarded after a generic notice and never becomes transcript or
conversation state. Chapter 05 owns provider setup and data-flow details.

## Failure behavior

A missing build means neither the linked command nor npm start can execute. A
missing or mismatched toolchain causes verification to fail. Prompt, startup,
viewport, input, rendering, or cleanup failures return a nonzero process status
and a short category label; private causes, keys, and submitted content are not
printed. The shutdown path still attempts terminal and renderer cleanup
independently.

## Maintenance and removal

Keep root binary metadata, scripts, engine pins, lock topology, setup prose, and
the verifier in sync. Never add TypeScript or runtime dependencies to a
manifest. Remove the global link with `npm unlink --global agent-workspace`.
To replace the entry point, preserve plain-mode behavior, prompt cleanup,
terminal restoration, and the exact offline build path until the new
composition is verified.

## Evidence

- Root scripts and workspace registry: `package.json`
- Local-only install topology: `package-lock.json`
- Executable edge: `packages/agent-cli/src/main.ts`
- Executable decision: `docs/decisions/0018-owned-executable-startup.md`
- Hidden credential prompt: `packages/agent-cli/src/hidden-credential-prompt.ts`
- Exact argument parser: `packages/agent-cli/src/launch-command.ts`
- Application lifecycle: `packages/agent-cli/src/run.ts`
- Toolchain contract: `tools/toolchain.json`
