# 01 - Running agent

## Install

Agent requires Node.js `>=22.19.0`, npm `11.16.0`, TypeScript `5.9.3`, and
Clang `>=18` installed outside this repository. From the repository root:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run install:command
```

`npm run install:command` creates the local command link. It is needed once per
clone and again after unlinking. Maintainers can use `npm run dev` to rebuild
and start, or `npm start` to run an existing build. Use `agent --help` for the
accepted launch forms and `agent --version` for the installed version.

## Choose a workspace

Run `agent` from the directory that should become the workspace. Agent
canonicalizes that exact directory once; it does not search upward for a Git
root. The accepted absolute path appears in the footer and is shared by every
built-in tool.

A volume root, the exact user home, the shared temporary directory, and any
workspace containing `~/.agent` or located inside it are rejected before
credentials, providers, tools, or terminal ownership. An ordinary project
directory elsewhere under the home remains valid. Startup then loads the
built-in sensitive-path denials and the optional root
`.agentignore`. Its deny-only grammar is documented in
[Tools and permissions](04-tools-and-approval.md). The policy remains fixed
until restart.

## Start or resume a session

Run `agent` to start a new durable local session. Agent stores only settled
conversation turns and the selected timeline node under
`~/.agent/sessions`, outside the workspace. Run this exact form from the same
canonical workspace to continue the newest inactive session:

```powershell
agent resume --latest
```

Resume is a CLI launch form, not a TUI slash command. It reconstructs the
bounded branch tree and visible transcript, then creates a new continuation;
it does not append to the previous journal or rerun tools. If the previous
process is still active, the latest journal is corrupt, or no journal exists
for this workspace, startup fails content-free.

Creation and resume briefly publish one unique workspace session-admission
token while validating retention and publishing the continuation. A launch
proceeds only when no other live token exists. Simultaneous launches for the
same workspace may all fail content-free as busy instead of waiting or
exceeding the retained-session bound; run again after the other admission has
finished. A token whose exact process no longer exists may be removed through
its never-reused pathname during a later launch.

A crash during the final append may leave one incomplete last line. Resume
discards only that line, restores the validated complete prefix, and shows a
recovery notice. Any earlier corruption fails closed. See the
[privacy policy](../../PRIVACY.md#local-sessions) for retained data, locations,
bounds, and deletion.

On the first launch of an existing workspace after this storage change, Agent
moves only that workspace's inactive session directory from the former Windows
LocalAppData or POSIX XDG state location into `~/.agent/sessions`. It does not
copy or merge session trees. If a legacy session is active, both locations hold
that workspace, or the move crosses filesystems or otherwise fails, startup
stops without changing the retained journals. Close every Agent process and
resolve the exact directory conflict before trying again.

## Configure the session

Every new or resumed session starts without a selected provider or model. Use
`/providers` to enter a process-only Ollama Cloud credential. Then use
`/models` to load and select one exact model exposed by the provider's
authenticated catalog. The key is concealed, never enters the transcript, and
is discarded on exit.

Provider eligibility, model discovery, and failure behavior are covered in
[Providers and authentication](05-providers-and-authentication.md). Tool modes
can be changed with `/permissions`. Native reasoning effort and its transcript
stream both remain `Off` by default; after selecting the provider and model,
use `/thinking` to configure either for later turns in this process. Both values
remain unchanged if another model is selected.

## Exit

Use `/exit`, Ctrl+D, or terminal EOF. Shutdown restores terminal modes, releases
the session lock, and attempts cleanup even when another operation has failed.

Interactive mode requires TTY input and output. Redirected execution prints a
short plain status without ANSI. Unknown, duplicated, or combined launch
options fail; credentials are never accepted as command-line arguments.

## Evaluation mode

Use the exact `agent --evaluation-receipt` launch form only for a maintained
interactive evaluation. It runs the same product with unchanged tools and
permissions. After terminal cleanup it prints one content-free JSON line with
elapsed time and accepted turn, tool-call, approval, and repeated-read counts.
It creates no session journal and writes no evaluation state to the workspace.

The evaluation workflow and interpretation rules live in
[Verification and diagnostics](06-verification-and-diagnostics.md) and the
[evaluation guide](../../evaluations/README.md).

## Failures

- A missing build or command link prevents startup; rebuild and reinstall the
  link from the repository root.
- An invalid, inaccessible, non-directory, or over-broad root prints
  `agent rejected the workspace root` and exits nonzero.
- An invalid, linked, inaccessible, changed, or oversized `.agentignore`
  prints `agent rejected the workspace privacy policy` and exits nonzero.
- A missing, active, corrupt, oversized, or inaccessible latest session makes
  `agent resume --latest` fail without printing its path or content.
- A simultaneous session admission for the same workspace reports that session
  admission is busy and exits without opening a journal.
- An active legacy session, dual-root workspace, cross-filesystem move, or
  failed legacy rename reports that Agent could not migrate legacy session
  state and exits without copying, merging, or overwriting either location.
- A linked or non-directory `.agent` or `sessions` namespace is rejected with
  the content-free workspace-root diagnostic before any tool opens.
- Do not run an older Agent executable after a workspace has migrated. Roll its
  exact session directory back first using the maintenance procedure; otherwise
  the older executable can recreate legacy state and the current executable
  will reject the resulting dual-root conflict.
- Credential, provider, input, rendering, and cleanup failures expose only a
  short content-safe classification and return a nonzero status when startup
  or shutdown cannot complete.

## References

- [Executable lifecycle decision](../decisions/0018-owned-executable-startup.md)
- [Workspace trust-boundary decision](../decisions/0042-owned-workspace-trust-boundary.md)
- [Evaluation-receipt decision](../decisions/0048-owned-content-free-evaluation-receipt.md)
- [Durable-session decision](../decisions/0076-owned-bounded-session-journal.md)
- [User-scoped state-root decision](../decisions/0087-owned-user-scoped-state-root.md)
- [Architecture](../ARCHITECTURE.md)
- [Maintenance and removal](../MAINTENANCE.md)
