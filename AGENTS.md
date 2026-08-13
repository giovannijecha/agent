# Agent project

## Purpose

Build a lightweight personal coding agent with an original CLI and TUI. All
product source, tests, declarations, protocols, prompts, tools, and UI behavior
are authored in this repository.

The public identity is `agent`, the canonical public repository is
`giovannijecha/agent`, and Giovanni Jecha is the maintainer and copyright
holder. The public description is “An owned, zero-dependency personal coding
agent.”

## Stack and ownership

- Use Node.js `>=22.19.0`, npm workspaces, ESM, ES2022, and external TypeScript
  `5.9.3`. Node, npm, and `tsc` are approved toolchain substrate.
- Private native platform primitives use original C17 and external Clang
  `>=18`; system headers and operating-system APIs are approved substrate.
  Generated native binaries remain ignored and are never committed.
- Third-party source, npm packages, SDKs, frameworks, snippets, vendored code,
  foreign generated code, and `@types/node` are forbidden.
- TypeScript must stay outside the repository and every package dependency must
  be an exact edge to a registered local workspace.
- Use only local imports and explicitly allowlisted `node:` built-ins. Never use
  bare built-in names, `npx`, `npm exec`, dynamic imports, `require`, or loaders.
- Shipped modules use only statically proven computed member names. Use explicit
  collection APIs such as `.at()` for runtime indexing; the verifier fails closed.
- Write minimal Node declarations here from authoritative runtime contracts.
- Current reference-project source may be inspected when public documentation is
  stale. Never copy, translate, adapt, or reuse its implementation, tests,
  prompts, identifiers, or product identity; pin and record every inspection in
  `docs/OWNERSHIP.md`.
- The canonical product, repository, executable, and package identity is
  `agent`. The exact lowercase `.agent` wordmark is a visual signature only;
  canonical brand assets and digests are registered in
  `assets/brand/manifest.json`.
- TUI reference inspection is limited to observable user outcomes. Never reuse
  a foreign component hierarchy, module boundary, identifier, style literal,
  animation timing, redraw algorithm, or source structure.
- Subscription adapters require an `agent`-owned client registration or a
  provider-documented public identity for independent clients. Vendor SDKs,
  CLIs, app servers, ACP binaries, and borrowed OAuth identities are forbidden.
- Direct API-key providers require a provider-published endpoint, an exact
  CLI-owned origin allowlist, memory-only secrets, and a concrete removable
  adapter; OpenCode Go is the first admitted provider under decision 0017.
- Provider requests live in `docs/PROVIDER-APPLICATIONS.md`. A prepared,
  submitted, or unanswered request never changes blocked eligibility.
- Secrets, credentials, sessions, and personal content never enter source,
  fixtures, logs, or documentation.

## Architecture

- `@agent/core` owns deterministic domain state and performs no I/O.
- `@agent/tools` owns structured schemas, risk classes, registry validation,
  and bounded handler execution; it is Node-free and depends only on core.
- `@agent/runtime` owns bounded streaming turns, cancellation, model ports, and
  acknowledged conversation checkpoints; it is Node-free and depends only on
  core and tools.
- `@agent/tui` owns bounded input decoding, line editing, vertical components,
  bounded component stacks, normalized structured rows with closed semantic
  span tones and surfaces, the closed bounded Markdown subset, immutable scroll geometry,
  planned vertical layout, viewports, frames, and synchronized differential
  rendering; it is
  agent-agnostic and Node-free. Markdown and plain text reuse one word-aware
  wrapping path with explicit literal-code and continuation-prefix policies,
  Markdown state cannot cross bounded document boundaries, only the renderer
  emits ANSI, and every scrollable surface reuses the same generic scroll path.
  One cell-width authority admits printable ASCII, the closed structural set,
  and the exact precomposed Latin prose profile from decision 0044 as one cell;
  every other non-ASCII scalar retains the two-cell conservative fallback.
  Components, Markdown, surfaces, editors, and applications never add private
  width exceptions.
- The TUI is conversation-first, not a permanent dashboard. Keep the transcript
  dominant, the composer fixed and recognizable, and every information block
  contextual to authoritative state. Future tools and integrations reuse the
  generic panel, surface, split-line, three-column-line, horizontal-inset,
  side-rail, spacer, activity, scroll, and layout paths; they do not add
  private cards, empty metrics, or parallel view models. User and assistant
  content remain structured role entries but render without redundant `you` or
  `agent` labels. A user turn uses one stage-wide borderless subtle surface with
  one cell of horizontal and vertical padding and italic content;
  assistant prose remains unboxed, while fenced code and strict
  pipe tables use one content-fit transparent structured region. Complete fences with at
  most two visible logical rows use zero horizontal padding; larger fences and
  tables retain one cell. An exact Markdown `---` renders through the shared
  display path as one muted responsive separator, while unsupported variants
  remain literal. Surface, slant, and
  foreground tone remain independent closed style dimensions. The neutral
  subtle surface distinguishes user input without implying lifecycle state;
  green, ochre, and red backgrounds are reserved for authoritative tool
  lifecycle state. Strict tables
  measure every header and body cell before display and pad each column to one
  shared visible width, so the technical surface stays rectangular. One muted
  rule spans that exact measured width between the header and body inside the
  same surface; do not add an outer border or a full cell grid. Complete
  recognized fences may derive only the registered bounded lexical roles from
  the owned highlighter; unknown or unlabeled fences remain plain. Model text
  never selects styling. The restrained steel-blue `accent` role is reserved
  for references and fence labels; lighter blues remain code-only syntax roles.
  Every tool lifecycle state uses the same borderless semantic `Surface`:
  restrained dark green for success, ochre for active or approval, and red for
  negative terminal state. Tool identity is neutral italic text; identity,
  written state, safe detail, and approval actions use neutral high-contrast
  foregrounds. Activity surfaces use one cell of horizontal padding and zero
  vertical padding. When height is constrained, their head retains tool identity
  and written state before optional detail. Written state remains explicit, and
  no tool or approval path adds a private rail, border, or panel. The contextual activity surface shows only the latest snapshot while a
  turn is active: the next tool replaces it, turn settlement removes it, and
  tool activity never enters the transcript. An empty session renders no welcome
  or embedded help; operator guidance stays in the maintained manual. The
  application owns one latest ephemeral contextual notice after activity and
  before completion or the composer. Notices are transparent, stage-wide, and
  horizontally inset by one cell: informational text is muted and warnings use
  the attention foreground independently of application phase. A new notice
  replaces the previous one, any editor interaction dismisses it, and the
  CLI-owned scheduler expires the exact current generation after 5,000
  milliseconds through the serialized event arbiter. Notice timers contain no
  notice text and never mutate application or renderer state directly. The
  composer is one prompt-free, borderless, stage-wide subtle `Surface` around the
  generic `InputArea`, with one cell of horizontal and vertical padding. It
  grows from one through six content rows using the same bounded
  editor and submission path. Bracketed paste is one atomic editor event and
  never implies Enter; only a separately decoded Enter submits. The renderer
  owns paste-mode and steady-vertical-bar-caret lifecycle and restores both terminal
  defaults during cleanup. Ctrl+Left and Ctrl+Right move by the editor's one
  whitespace-delimited word rule; Ctrl+Backspace, Ctrl+W, and Ctrl+Delete
  remove through the same semantic decoder/editor path. Do not reproduce word
  editing in CLI session or application state.
- Interactive pointer behavior follows decision 0045. The renderer owns SGR
  mouse modes 1002 and 1006 for its alternate-screen lifetime and restores them
  on every cleanup path. The TUI decoder, logical text references, selection
  mark, exact visible HTTPS hyperlinks, and bounded OSC 52 encoder stay generic
  and Node-free. The CLI routes the latest planned frame, owns stable transcript
  document identities and monotonic double-click timing, reuses `ScrollState`,
  and asks the same `LineEditor` to select composer text. Drag settles and
  copies one bounded logical selection; double-click release copies one word,
  while holding the second press extends by complete word runs. On Windows x64,
  the CLI invokes the exact owned C17 clipboard broker and reports success only
  after `CF_UNICODETEXT` transfer. Other platforms retain serialized OSC 52 and
  report only that the terminal request was written. Clipboard settlements reuse
  the ephemeral notice lifecycle as a compact right-edge composer status that
  reserves no row or editor width and collapses when it cannot fit. Copy failures
  are nonfatal, a composer pointer action dismisses the current notice, resize
  clears geometry-dependent selection, Shift remains the optional native
  terminal-selection escape hatch, and Ctrl+C remains the agent interrupt. Do
  not add a browser launcher, foreign clipboard package or executable, global
  mouse hook, screen-coordinate transcript archive, or separate pointer paths.
- Slash completion reuses one exact CLI-owned command catalog for dispatch and
  discovery. The generic TUI owns only a bounded `SelectionList`. While a
  completion is visible, Up and Down select without wrapping and Tab completes
  without submitting; Enter dispatches the selected exact command through the
  canonical dispatcher. Otherwise existing transcript and editor controls
  remain authoritative. Each entry is one compact transparent inline row with
  the description immediately after the command; no passive keyboard hint is
  rendered. One shared optional one-row spacer separates every adjacent lower
  shell region: transcript, activity, notice, completion, composer, and
  footer. Each spacer collapses before required content on constrained viewports.
- The CLI owns one pure responsive conversation-stage projection. It gives
  every shell region the full usable terminal width while retaining one
  technical outer column per side when the terminal permits. Tiny viewports use
  all available columns. No shell region may carry a private width calculation
  or an arbitrary reading-width cap. The footer uses the same stage so its pulse
  ends on the same cell as the composer surface.
- Visible motion is one constant-width active-work pulse. It ends at the
  composer's right edge, is the footer's only right-edge content, and
  appears only while autonomous progress advances
  (`generating`, `runningTool`, or `cancelling`); idle and approval-waiting
  states leave that edge empty. Six pure deterministic phases move one ochre
  head through a neutral leading and trailing step. They stay in `@agent/tui`;
  the owned CLI scheduler runs at eight frames per second, retains at most one
  pending tick, re-arms only after a successful
  render, and yields to terminal and runtime events. Phase 0 is the static
  baseline.
- `@agent/cli` owns commands, bounded display chat, the single-writer reducer,
  one bounded tool-activity lifecycle and presentation path, terminal/runtime
  arbitration, transcript-navigation state, built-in workspace tools, raw mode,
  pointer routing and monotonic input timestamps, filesystem and process access,
  and all Node lifecycle; it is the only
  platform boundary. Before credentials, providers, tools, or terminal
  ownership, it resolves the exact startup directory into one immutable
  canonical workspace boundary. It never discovers a broader repository root;
  volume roots, the exact user home, and the exact shared temporary directory
  fail closed. One bounded owned native resolver obtains those protected roots
  from operating-system account and known-folder contracts with an empty
  environment; inherited home and temporary variables are never authoritative.
  The footer and every built-in tool consume that same canonical absolute root.
  One immutable CLI-owned read policy is loaded after root selection and before
  credentials, providers, tools, or terminal ownership. Non-removable built-in
  sensitive-path denials combine with one optional bounded root `.agentignore`;
  both are deny-only. `read_file` rejects denied targets before observation,
  `list_directory` omits denied children, and `search_text` prunes denied
  directories and files before opening them. Writes and approved processes are
  outside this disclosure policy.
- `run_process` is the only admitted execute tool. It accepts the registered
  `node` token, literal arguments, and one workspace-relative directory; it
  never accepts a shell, executable path, PATH lookup, stdin, inherited or
  model-controlled environment, or model-selected limits. The CLI resolves the
  executable and invokes the owned native whole-tree containment broker. Linux
  targets receive an empty environment; Windows targets receive only the
  `SystemRoot` value queried by the broker from the operating system. The tool
  runs terminating commands only; it does not retain background or persistent
  services.
- `agent` is a single-agent product: one identity, one application controller,
  one active runtime session, and one active model decision loop. Providers are
  interchangeable backends, never additional agents; do not add sub-agents,
  delegation, swarms, or concurrent agent conversations.
- One model response may select one bounded ordered tool-call batch. Validate the
  complete batch before effects, execute calls sequentially in provider order,
  require a separate exact approval for every write or execute call, and commit
  one complete exchange. A batch is one agent decision, never a group of agents.
- Future controller-internal concurrency may overlap only bounded independent
  mechanics over immutable snapshots during a read-only phase. It cannot enter
  the tool engine or overlap a mutation, and its results return to the sole
  controller for deterministic reduction.
- Model turns, tool handlers, writes, process execution, approvals, and terminal
  output remain serialized. Current runtime remains sequential.
- Core and TUI never depend on each other. Dependencies point inward, public
  surfaces go through `src/index.ts`, and deep cross-package imports are banned.
- Keep modules cohesive, documented, independently testable, replaceable, and
  removable without unrelated rewrites. Do not create speculative layers.
- Every owned engine or framework must define a complete intended contract:
  lifecycle, bounds, failures, security, tests, updates, rollback, and removal.
- Keep the model-facing harness lean: every tool needs one canonical name, a
  distinct capability, current necessity, focused tests, and independent
  removal. Tool aliases and speculative conveniences are forbidden.
- Keep process execution inside the admitted decision 0036 contract: one
  registered program token, exact per-call approval, fixed limits, isolated
  operating-system bootstrap, bounded output, and complete descendant
  cancellation and cleanup on Windows and Linux.

## Change discipline

- Project artifacts are written in English; chat may use Italian.
- Do not add automated tool signatures, generated-by banners, or tool co-author
  trailers. Do not claim that development occurred without tool assistance.
- External issues may open after publication; external code pull requests stay
  closed during the initial maintainer-only clean-room phase.
- Update behavior, tests, documentation, ownership policy, and removal guidance
  in the same change.
- Record lasting design or toolchain changes under `docs/decisions/` first.
- Use explicit immutable results at library boundaries; no swallowed errors,
  silent fallback, hidden global state, or ambient network access.
- Every bug fix needs a regression test; every integration needs contract tests.
- Do not edit generated `dist/`, `.test-dist/`, `node_modules/`, or lock metadata
  manually. Change owned inputs and regenerate them through the toolchain.

## Canonical commands

```powershell
npm ci --offline --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
npm run install:command
npm start
agent
powershell -NoProfile -ExecutionPolicy Bypass -File tools/verify.ps1
```

On Linux, use `bash tools/verify.sh`; it runs the same ordered gate with the
platform-native shell wrapper.

The final command must pass before work is complete. It checks the toolchain,
documents, manifests, lockfile, imports, source hygiene, build, tests, and CLI.
The owned GitHub workflow runs this same command for pull requests and `main`;
it must contain no imported action or repository secret.

## Boundaries

Work only inside this folder unless an umbrella registry update is required.
Do not initialize Git, publish, deploy, add packages, or connect a real model
provider unless the user explicitly asks.
