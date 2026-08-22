# agent

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/agent-wordmark-dark.png">
    <img alt="agent" src="assets/brand/agent-wordmark-transparent.png" width="512">
  </picture>
</p>

An owned, zero-dependency personal coding agent.

`agent` is an original CLI and conversation-first terminal UI. It keeps one
coding loop, six local tools, explicit permissions, provider adapters, durable
conversation branches, and the terminal experience inside a maintainer-owned
implementation with no third-party runtime packages.

## What it does

- inspects and searches one bounded workspace;
- applies exact text patches, manages paths, and runs approved shell commands;
- asks before writes and execution by default;
- connects to Ollama Cloud and selects a fresh catalog model for the process;
- authenticates an OpenAI subscription for a future runtime integration;
- streams checkpointed model and tool work through one conversation-first TUI;
- retains bounded settled conversation branches and resumes the latest session;
- verifies the complete repository on Windows and Linux.

The product has one identity, one controller, one runtime session, and one model
loop. Providers are interchangeable backends, not additional agents.

## Requirements

- Node.js `>=22.19.0`
- npm `11.16.0`
- TypeScript `5.9.3`, installed outside the repository
- Clang `>=18`, installed outside the repository

Install and start from the intended workspace:

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run install:command
agent
```

The exact launch directory becomes the immutable workspace. Agent does not
search upward for a Git root. Volume roots, the exact user home, shared temporary
storage, and workspaces overlapping `~/.agent` are rejected. A root
`.agentignore` may add deny-only read exclusions.

Resume the newest inactive session for the same workspace with:

```powershell
agent resume --latest
```

## Authentication and models

Manage credentials outside the TUI:

```powershell
agent auth
```

Ollama Cloud accepts a zero-echo API key and is the only active runtime
provider. OpenAI uses a provider-hosted device ceremony; its credential record
and inactive catalog/Responses adapter are installed, but OpenAI does not yet
appear in `/models` or receive conversation traffic.

Inside the TUI, `/models` first selects an authenticated runtime provider and
then one model from that provider’s fresh catalog. Provider, model, catalog,
thinking settings, and permissions are process-only. Provider credentials and
settled session journals use separate owner-protected plaintext records under
`~/.agent`; they are not encrypted vaults.

Read [providers and authentication](docs/manual/05-providers-and-authentication.md)
before connecting an account.

## Commands and tools

| Command | Action |
| --- | --- |
| `/models` | Select an authenticated runtime provider and model |
| `/permissions` | Edit process-only tool permissions |
| `/thinking` | Set reasoning effort and transcript visibility |
| `/timeline` | Select a retained conversation branch |
| `/exit` | Close Agent |

The tool inventory is exactly `read_file`, `list_directory`, `search_text`,
`apply_patch`, `manage_path`, and `shell`. Reads default to `Allow`; writes and
execution default to `Ask`. Each pending request offers `Allow once`, `Allow for
session`, and `Deny`.

Agent serializes permissions and effects. A bounded batch of two to four
independent reads may overlap only after every permission settles, and results
return in provider order. Completed tool checkpoints remain conversation truth
if a later continuation fails; Agent does not retry effects implicitly.

## Local state and safety

- Built-in read rules deny common credential, key, Git, and environment paths.
- File and namespace mutations bind approval to observed state and use owned
  native committers.
- `shell` receives one exact approved command, a fixed platform shell, a
  controlled credential-free environment, and bounded descendant cleanup. It
  retains the launching user’s host authority and is not a sandbox.
- Secret values never belong in command arguments, source, fixtures, logs,
  transcripts, receipts, errors, or documentation.
- Local credentials and sessions are plaintext protected by native ownership
  and access controls. Same-user processes, administrators or root, malware,
  backups, snapshots, memory inspection, and privileged offline access remain
  outside that protection.

See [Privacy](PRIVACY.md) and [Security](SECURITY.md) for the complete operator
boundary.

## Verification

Run the canonical gate before treating a change as complete.

Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

Linux:

```bash
bash tools/verify.sh
```

The owned GitHub workflow runs the same offline gate on pull requests and
`main`, without imported actions or repository secrets.

## Documentation

- [Operator manual](docs/manual/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Engineering](docs/ENGINEERING.md)
- [Privacy](PRIVACY.md)
- [Security](SECURITY.md)
- [Evaluation guide](evaluations/README.md)
- [Brand assets](assets/brand/README.md)

These living documents describe the current product. Source, tests, review, and
Git history preserve the implementation and rationale; the repository does not
maintain a separate decision ledger.

## Identity and license

The canonical repository is `giovannijecha/agent`. Giovanni Jecha is the
maintainer and copyright holder. The project is pre-1.0 and licensed under the
[Apache License 2.0](LICENSE).

Copyright 2026 Giovanni Jecha.
