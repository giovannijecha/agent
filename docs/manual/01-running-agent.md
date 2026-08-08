# 01 - Running agent

## Purpose

Use this chapter to install only local workspace links, build owned source, start
the terminal application, and exit without leaving terminal state behind.

## Operator workflow

From the repository root in PowerShell:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm start
```

The required toolchain is Node.js `>=22.19.0`, npm `11.16.0`, and TypeScript
`5.9.3` available on `PATH` but installed outside this workspace. In an
interactive terminal, use `/help` for the command list and `/exit` to close.

## Guarantees and limits

The lockfile contains only local workspace topology. Installation is offline,
ignores lifecycle scripts, and cannot fetch a package. Interactive mode requires
both TTY input and TTY output. Redirected execution prints a short plain status
without ANSI sequences. Production currently starts without a model, so normal
text is discarded after a generic notice and never becomes transcript or
conversation state.

## Failure behavior

A missing or mismatched toolchain causes verification to fail. Startup,
viewport, input, rendering, or cleanup failures return a nonzero process status
and a short category label; private causes and submitted content are not printed.
The shutdown path still attempts terminal and renderer cleanup independently.

## Maintenance and removal

Keep root scripts, engine pins, lock topology, setup prose, and the verifier in
sync. Never add TypeScript or runtime dependencies to a manifest. To replace the
entry point, preserve plain-mode behavior, terminal restoration, and the exact
offline build path until the new composition is verified.

## Evidence

- Root scripts and workspace registry: `package.json`
- Local-only install topology: `package-lock.json`
- Executable edge: `packages/agent-cli/src/main.ts`
- Application lifecycle: `packages/agent-cli/src/run.ts`
- Toolchain contract: `tools/toolchain.json`
