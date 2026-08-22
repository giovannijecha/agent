# 01 - Running Agent

## Install

Agent requires Node.js `>=22.19.0`, npm `11.16.0`, external TypeScript `5.9.3`,
and external Clang `>=18`.

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run install:command
```

`npm run dev` rebuilds and starts the repository command. `npm start` runs an
existing build. Use `agent --help` for launch forms and `agent --version` for
the installed version.

## Choose a workspace

Start Agent inside the exact directory it should control. That canonical path
is fixed for the process, shown in the footer, and passed to every built-in
tool. Agent does not search upward for a Git root.

A volume root, exact user home, shared temporary directory, or workspace
containing or located within the native `~/.agent` state root is rejected before
credentials or terminal ownership. A root `.agentignore` may add deny-only read
rules; invalid, linked, changed, inaccessible, or oversized policy input blocks
startup.

## Start or resume

Start a new interactive session:

```powershell
agent
```

Resume the newest inactive session for the same canonical workspace:

```powershell
agent resume --latest
```

Resume validates the journal and creates a separate continuation. It does not
append to the source journal, replay tools, restore old files, or restore
provider/model/permission settings. A live peer, missing session, unsafe state,
interior corruption, or ambiguous legacy/current storage fails content-free.
One incomplete final journal line may be discarded while retaining its valid
prefix.

## Authenticate and select a model

Exit the TUI before managing credentials:

```powershell
agent auth
```

The command requires interactive input/output and accepts no operands. It can
register, replace, or remove Ollama Cloud authentication and can sign in, sign
in again, or remove the local OpenAI record. OpenAI authentication does not yet
create a runtime provider row.

Every TUI process starts without a provider or model. Run `/models`, select an
authenticated runtime provider, then select one current catalog model. Use
`/permissions` for tool policy and `/thinking` for reasoning Effort and Stream;
both settings default to `Off`.

## Exit

Use `/exit`, Ctrl+D, or terminal EOF. Ctrl+C cancels active work and exits while
idle. Shutdown restores terminal modes and attempts runtime, native, credential,
and session cleanup even after another failure.

Interactive launch requires TTY input and output. Unknown, duplicated, combined,
or redirected launch options fail. Credentials are never accepted as arguments.

## Evaluation mode

`agent --evaluation-receipt` runs the normal interactive product without a
session journal and prints one content-free JSON receipt after terminal cleanup.
It is maintainer evaluation evidence, not a different runtime. See
[Verification and diagnostics](06-verification-and-diagnostics.md).

## Common startup failures

- `agent rejected the workspace root`: choose a narrower ordinary project
  directory outside the protected state root.
- `agent rejected the workspace privacy policy`: repair or remove the root
  `.agentignore`, then restart.
- Resume failure: close other Agent processes and verify the exact workspace’s
  session state; do not merge or rewrite journals manually.
- Authentication busy: close the TUI or other `agent auth` process holding the
  provider admission, then run the complete command again.
- Ollama dual authority: unset `AGENT_OLLAMA_API_KEY` before managing or using a
  durable record.

Continue with [providers and authentication](05-providers-and-authentication.md)
and [Privacy](../../PRIVACY.md) for retained-state details.
