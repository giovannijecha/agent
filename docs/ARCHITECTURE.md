# Architecture

## Scope

This document describes the current product shape: package boundaries, authority
flow, runtime composition, capabilities, provider integration, terminal
ownership, and security boundaries.

It does not explain why those boundaries were chosen or how maintainers change
them. Use:

- [decisions](decisions/README.md) for accepted rationale;
- [engineering](ENGINEERING.md) for change and evidence requirements;
- [maintenance](MAINTENANCE.md) for update, rollback, and removal procedures;
- the [operator manual](manual/README.md) for visible behavior.

## Single-agent execution model

`agent` is one local process with one identity, one application controller,
one active runtime session, and one active model decision loop. It
does not create sub-agents; providers are replaceable backends, not additional
agents.

Single-agent is an identity and authority contract, not a claim that every
mechanical operation must be synchronous. Reduction is deterministic. Bounded
independent mechanics may overlap only over immutable snapshots during a
read-only phase. Any mutation excludes concurrent mechanics. Model turns, tool
handlers, writes, process execution, permissions, and
terminal output remain serialized. Current runtime remains sequential.

```text
terminal
   |
@agent/cli
   +-- canonical workspace and read policy
   +-- session provider, model, permissions, and tools
   +-- @agent/runtime
   |      +-- @agent/core
   |      +-- @agent/tools
   |      +-- model port
   +-- @agent/tui
   +-- @agent/provider-ollama-cloud
```

Startup does not select a provider or model. The operator configures both
inside the running TUI. Credentials, provider choice, catalog results, and
model choice live only for that process.

## Dependency graph

The workspace contains six shipped packages:

```text
@agent/core
   ^
   |
@agent/tools
   ^
   |
@agent/runtime <----- @agent/provider-ollama-cloud
   ^                              ^
   |                              |
   +------------ @agent/cli ------+
                     |
                  @agent/tui
```

Direct package edges are exact:

| Package | Direct local dependencies |
| --- | --- |
| `@agent/core` | none |
| `@agent/tools` | `@agent/core` |
| `@agent/runtime` | `@agent/core`, `@agent/tools` |
| `@agent/provider-ollama-cloud` | `@agent/core`, `@agent/runtime`, `@agent/tools` |
| `@agent/tui` | none |
| `@agent/cli` | all five packages above |

Core, tools, runtime, provider, and TUI remain Node-free. The CLI is the sole
Node and operating-system boundary.

## Package boundaries

| Package | Owns |
| --- | --- |
| `@agent/core` | deterministic domain state and immutable results |
| `@agent/tools` | tool schemas, risk classes, registry validation, and bounded handler execution |
| `@agent/runtime` | bounded streaming turns, cancellation, tool checkpoints, and conversation commits |
| `@agent/provider-ollama-cloud` | provider-neutral request translation and Ollama Cloud stream decoding |
| `@agent/tui` | input decoding, editors, structured rows, Markdown, layout, viewports, and frame rendering |
| `@agent/cli` | application state, commands, provider/session state, built-in tools, terminal arbitration, filesystem/process access, and native brokers |

Dependencies point inward and public package access goes through each
`src/index.ts`. Deep cross-package imports are not part of the architecture.

## Composition and turn lifecycle

The CLI composition root performs startup in this order:

1. resolve the exact startup directory into one immutable canonical workspace;
2. load the built-in and optional root `.agentignore` read-denial policy;
3. register the fixed tool inventory and session permission policy;
4. acquire terminal ownership and enter the empty conversation-first TUI;
5. accept an explicit provider and credential through `/providers`;
6. accept a model returned by the authenticated `/models` catalog.

A submitted user message is prospective until the complete turn settles. One
model response may contain one bounded ordered tool-call batch. The runtime:

1. validates the complete batch before effects;
2. plans each call just in time;
3. obtains one exact permission decision for every successfully planned call;
4. executes calls sequentially in provider order;
5. checkpoints every tool result into conversation truth;
6. returns that truth before the next model decision;
7. commits one complete exchange when the turn settles.

A later model failure does not erase a completed tool checkpoint. The CLI
publishes a closed content-free failure family and retains the confirmed tool
truth. There are no implicit retries, concurrent handlers, fallback providers,
or parallel conversations.

The principal runtime bounds are fixed:

| Boundary | Limit |
| --- | ---: |
| user message | 4,096 code points |
| one streamed text delta | 16,384 code units |
| one assistant response | 262,144 code units |
| one stream | 4,096 events |
| retained conversation | 256 messages / 1,048,576 code units |
| one turn | 32 model/tool steps |

## Capability surface

The advertised model-facing inventory is exactly:

| Tool | Capability | Default permission |
| --- | --- | --- |
| `read_file` | bounded complete or line-projected file observation | Allow |
| `list_directory` | bounded directory observation | Allow |
| `search_text` | bounded text search under the read policy | Allow |
| `apply_patch` | one object-bound structured text commit | Ask |
| `manage_path` | one object-bound namespace commit | Ask |
| `shell` | one bounded native-shell command execution | Ask |

The tool registry, schemas, planners, permissions, and handlers remain separate
authorities. A permission approves one exact planned call; it cannot widen a
schema, path, program, limit, disclosure policy, or native committer.

`apply_patch` binds approval to the observed object or absence, exact ordered
hunks, and state digests. `manage_path` owns only
`create_directory`, `move`, and `remove`; Linux currently admits only
directory creation. `shell` admits one exact command and a workspace-relative
working directory. The CLI fixes Bash without profiles on Linux or Windows
PowerShell without profiles on Windows, projects only the decision-0073
environment allowlist, excludes provider credentials, and retains fixed
whole-tree containment and execution bounds. Approved shell code has the
launching user's filesystem and network authority.

The read tools share one deny-only disclosure policy. Sensitive built-in paths
are always denied; an optional root `.agentignore` can add denials but cannot
grant access.

## Provider boundary

Ollama Cloud is the sole admitted direct provider. The integration is split
between:

- the Node-free package adapter, which builds bounded requests and decodes the
  provider stream into runtime events;
- the CLI transport, which owns HTTPS, exact origins, bearer authentication,
  response limits, inactivity limits, and wall-clock deadlines.

The session has no default provider or model. `/providers` is the only
interactive credential and provider-selection path. `/models` performs one
authenticated catalog request and exposes only bounded entries whose returned
`name` and `model` fields are equal. The latest process-memory catalog is
the model-availability authority.

There is no redirect, alias, retry, router, or fallback. Provider errors cross
the product boundary only through closed content-free failure families.
Credentials and catalog content never enter the transcript, logs, fixtures, or
documentation.

See [providers](PROVIDERS.md) and [privacy](../PRIVACY.md) for the public
contract.

## Terminal boundary

The TUI is conversation-first. The transcript is dominant; completion,
activity, notices, permission selection, composer, and footer are contextual
regions projected from authoritative application state.

`@agent/tui` owns generic, deterministic terminal mechanics:

- semantic rows, surfaces, wrapping, Markdown, highlighting, and layout;
- the bounded line editor and generic selection list;
- input decoding, pointer semantics, scroll geometry, and frame diffs;
- ANSI emission and terminal-width rules.

`@agent/cli` owns product meaning:

- transcript entries, command dispatch, and provider/session state;
- one latest ephemeral activity or notice;
- permission decisions and tool lifecycle projection;
- terminal/runtime event serialization and cancellation;
- filesystem, process, clipboard, and native-platform effects.

Tool activity never becomes transcript content. User and assistant messages
remain structured role entries but render without redundant role labels.
Only the renderer emits ANSI and owns alternate-screen, paste, mouse, caret,
and cleanup lifecycles.

User entries compose one stage-wide transparent `Surface` with the shared
one-cell content inset and no rail, marker, border, or background. Generic
selection uses only the selected-row `accent` foreground. Patch previews use
the `diffRemoved` red foreground for removed rows and
the `diffAdded` green foreground for added rows.

## Platform and security boundary

The CLI establishes the workspace boundary before credentials, provider
selection, tools, or terminal ownership. Volume roots, the exact user home, and
the shared temporary directory fail closed.

Portable TypeScript never performs pathname mutation after authorization.
Owned native C17 brokers provide:

- canonical protected-root discovery;
- whole-process-tree containment for `shell`;
- object-bound text commits;
- object-bound namespace commits;
- Windows clipboard transfer.

Unsupported operating-system or filesystem primitives fail closed. These
guarantees are not a filesystem sandbox, transaction, rollback system,
durability guarantee, or crash-recovery protocol.

The repository follows a clean-room ownership boundary. External runtime and
platform documentation may define contracts; foreign source, prompts, tests,
identifiers, component structures, and implementation patterns are not product
inputs. Approved inspections are pinned in
[ownership](OWNERSHIP.md).

## Repository control plane

Repository policy is executable:

| Authority | Registry or verifier |
| --- | --- |
| package graph and built-ins | `tools/ownership-policy.json` |
| documentation topology | `tools/documentation-policy.json` |
| manual coverage | `tools/manual-policy.json` |
| publication metadata | `tools/publication-policy.json` |
| provider admission | `tools/provider-policy.json` |
| evaluation corpus | `tools/evaluation-policy.json` |
| brand assets | `assets/brand/manifest.json` |

The canonical verifier validates source ownership, package edges,
documentation, generated-artifact hygiene, builds, native builds, and the CLI
smoke path without contacting a provider or reading credentials.

## Authority routes

| Question | Canonical owner |
| --- | --- |
| What does the product do for an operator? | [operator manual](manual/README.md) |
| What is the current system shape? | this document |
| How must a change be developed and proved? | [engineering](ENGINEERING.md) |
| How is a subsystem updated, rolled back, or removed? | [maintenance](MAINTENANCE.md) |
| Why was a lasting boundary accepted? | [decisions](decisions/README.md) |
| Which provider and privacy guarantees are public? | [providers](PROVIDERS.md) and [privacy](../PRIVACY.md) |
| Which external material was inspected? | [ownership](OWNERSHIP.md) |
| How are maintained tasks evaluated? | [evaluation](../evaluations/README.md) |
