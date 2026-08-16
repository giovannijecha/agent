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
  generic panel, surface, horizontal-rule, split-line, three-column-line,
  horizontal-inset, side-rail, spacer, activity, scroll, and layout paths; they do not add
  private cards, empty metrics, or parallel view models. User and assistant
  content remain structured role entries but render without redundant `you` or
  `agent` labels. A user turn composes one stage-wide transparent `Surface`
  with the shared one-cell content inset and no rail, marker, border, or
  background. Its first text cell is the canonical text column shared by
  assistant prose and composer text, caret, and pointer projection. Vertical
  padding stays at zero. Base user prose remains italic and uses the closed
  steel-blue `accent` tone; registered Markdown semantic roles override that
  base tone, while assistant base prose remains `plain` and unboxed. Fenced code and strict
  pipe tables use one content-fit transparent structured region. Complete fences with at
  most two visible logical rows use zero horizontal padding; larger fences and
  tables retain one cell. An exact Markdown `---` renders through the shared
  display path as one muted responsive separator, while unsupported variants
  remain literal. Surface, slant, and
  foreground tone remain independent closed style dimensions. Strict tables
  measure every header and body cell before display and pad each column to one
  shared visible width, so the technical surface stays rectangular. One muted
  rule spans that exact measured width between the header and body inside the
  same surface; do not add an outer border or a full cell grid. Complete
  recognized fences may derive only the registered bounded lexical roles from
  the owned highlighter; unknown or unlabeled fences remain plain. Model text
  never selects styling. The restrained steel-blue `accent` role identifies
  references, fence labels, user base prose, and the exact current row in a
  generic `SelectionList`; lighter blues remain code-only syntax roles.
  Every tool lifecycle state uses the same borderless transparent `Surface`.
  Restrained success, attention, or failure foregrounds appear only on the
  status mark and written state; the action, optional safe subject, ordinary
  previews, and resting permission actions remain neutral. The exact selected permission
  action receives only the generic `SelectionList` accent. Activity surfaces use one cell of horizontal
  padding and zero vertical padding. Under decisions 0056 and 0057, every snapshot
  starts with one compact `SplitLine`: the left side contains the registered bullet
  or ASCII `x`, one of the exact display-only `Read`, `List`, `Search`, `Write`,
  `Manage`, or `Run` labels, then an optional useful safe subject; the right side
  contains the written state and owns retention priority. Canonical tool name and
  risk remain closed presentation inputs but do not repeat in the visible head.
  Unknown names or risk drift fail closed, and display labels never become tool
  aliases. Non-permission states occupy exactly that line. Pending permission may
  add the separately wrapped exact human-readable preview, followed
  by one transparent generic `SelectionList` for the required actions. When width
  or height is constrained, the display action, written state, and decision
  actions survive before subject or preview detail. Exact bounded
  `apply_patch` previews expose the canonical path and bounded `- ` and `+ ` diff
  rows while internal digests and tuple metadata remain private plan state.
  Before display budgeting, remove only exact complete logical rows shared by
  the beginning or non-overlapping end of both sides of one hunk; original line
  separators participate in comparison, partial rows never collapse, and the
  complete untrimmed hunk remains the authorization and commit authority. When
  unequal terminal separators are the only field difference, expose exact
  `\r\n`, `\r`, or `\n` inline on the owning row; literal source backslashes
  remain doubled and no false empty row appears. The
  complete `- ` rows use the closed non-bold `diffRemoved` red foreground and
  complete `+ ` rows use the closed non-bold `diffAdded` green foreground;
  wrapped continuations retain their owning row's direction tone, while prefixes
  remain explicit and authoritative. Effect
  previews appear only while permission is pending; queued, running,
  cancelling, and terminal snapshots never replay them. The activity log may
  retain its bounded preview as lifecycle state, but settled presentation never
  replays it. Written state remains explicit, and
  no tool or permission path adds a private rail, border, or panel. The contextual activity surface shows only the latest snapshot while a
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
  renderer prepaints every maximal contiguous non-transparent surface run in a
  changed row with ASCII spaces across its exact logical cell extent before
  writing structured content. Runs may begin after a shared inset; transparent
  gaps and differently surfaced runs remain separate. This keeps semantic
  surfaces physically rectangular without adding a private width exception or
  changing retained text. The
  composer is one prompt-free, stage-wide generic `HorizontalRules` frame around
  the generic `InputArea`. Its transparent content row has one cell of horizontal
  padding, and one full-width light-blue `accent` rule appears above and below it.
  The rules collapse before required content on viewports shorter than three rows.
  It grows from one through six content rows using the same bounded
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
  and Node-free. A failed OSC 8 or OSC 52 write leaves one renderer-owned
  terminal-string recovery obligation; ST and a complete link close must settle
  before later renderer output or cleanup. The CLI routes the latest planned
  frame, owns stable transcript document identities and monotonic double-click
  timing, reuses `ScrollState`,
  and asks the same `LineEditor` to select composer text. Every action decoded
  from one chunk crosses the synchronous reducer in order; an interrupt followed
  by shutdown retains cancellation before one deduplicated exit. Drag settles and
  copies one bounded logical selection; double-click release copies one word,
  while holding the second press extends by complete word runs. On Windows x64,
  the CLI invokes the exact owned C17 clipboard broker and reports success only
  after `CF_UNICODETEXT` transfer. Its operation and post-kill cleanup deadlines
  are both hard; late process events are inert. Other platforms retain
  serialized OSC 52 and report only that the terminal request was written.
  Clipboard settlements reuse
  the ephemeral notice lifecycle as a compact right-edge composer status that
  reserves no row or editor width and collapses when it cannot fit. Copy failures
  are nonfatal, a composer pointer action dismisses the current notice, resize
  clears geometry-dependent selection, Shift remains the optional native
  terminal-selection escape hatch, and Ctrl+C remains the agent interrupt. Do
  not add a browser launcher, foreign clipboard package or executable, global
  mouse hook, screen-coordinate transcript archive, or separate pointer paths.
- Slash completion reuses one exact CLI-owned command catalog for dispatch and
  discovery. The generic TUI owns only a bounded `SelectionList`; it renders
  every unselected child with its supplied resting tones and reconstructs the
  exact selected row with the closed `accent` foreground while preserving all
  other span metadata. While a
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
  ends on the same cell as the composer frame.
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
  Its operation and post-kill cleanup deadlines are both hard, and late native
  events cannot change the settled root result.
  The footer and every built-in tool consume that same canonical absolute root.
  One immutable CLI-owned read policy is loaded after root selection and before
  credentials, providers, tools, or terminal ownership. Non-removable built-in
  sensitive-path denials combine with one optional bounded root `.agentignore`;
  both are deny-only. `read_file` rejects denied targets before observation,
  `list_directory` omits denied children, and `search_text` prunes denied
  directories and files before opening them. Every resolved read target passes
  the same policy again; Windows DOS short-name aliases fail closed. Writes and
  approved processes are outside this disclosure policy.
  `read_file` retains one canonical read capability and may project exact
  logical lines through optional one-based `startLine` and bounded `lineCount`
  fields. A path-only call preserves complete text. Every success reports exact
  unnumbered text plus `startLine`, `lineCount`, `totalLines`, and `hasMore`.
  Projection follows the same complete bounded observation and policy checks;
  it reduces provider context but is not random-access filesystem authority.
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
- The provider-neutral boundary accepts one bounded ordered tool-call batch from
  one model response. Validate the complete batch before planner or handler
  effects, plan each call just in time, execute calls sequentially in provider
  order, require one exact CLI permission decision for every successfully
  planned call, and commit one complete exchange. A failed plan requests no
  permission and settles as a structured failure. A batch is one agent decision,
  never a group of agents.
- Under decision 0061, OpenCode Go requests at most one tool call per model
  response. The owned instruction requires the model to observe the checkpointed
  result, reassess all remaining requested work, and continue until every part is
  complete or one explicit blocker remains. Consolidate all currently known
  edits to one file into one `apply_patch` call. Correct a failed request or
  explain its blocker; never repeat it blindly. Retain bounded batch decoding and
  sequential execution when a compatible service returns several calls despite
  the request. Do not add implicit retries or concurrent handlers.
- The CLI owns one session-only closed `Allow`, `Ask`, or `Deny` entry for each
  exact advertised tool under decision 0055. Reads default to `Allow`; writes
  and execution default to `Ask`. `/permissions` is the sole command for editing
  this memory-only policy. Pending `Ask` requests use exactly `Allow once`,
  `Allow for session`, and `Deny` through the contextual selection path;
  `/approve` and `/deny` do not exist. Every runtime tool request waits for one
  exact turn-and-call decision. A permission never widens schemas, paths,
  programs, limits, disclosure policy, stale-state checks, or native committers.
- `apply_patch` uses one CLI-owned structured text-patch effect plan. Bind an
  authorized effect to one canonical path, object identity, observed absence or
  complete content, ordered exact-text hunks, and SHA-256 state digests; show the
  canonical relative path and exact bounded human-readable `- ` and `+ ` patch
  rows, or bounded excerpts with an omitted-code-unit count. Do not expose plan
  digests, object identities, field registries, or tuple encodings in the UI.
  The display projects changed logical rows only by removing exact complete
  common prefix and non-overlapping suffix rows within each hunk before
  budgeting. Never trim partial rows, compare across hunks, or modify the bound
  untrimmed effect plan.
  Its target path admits at most 447 code units and 896 code units in the exact
  structured string projection; read-tool path limits remain independent. The
  complete ordered batch validates both that path projection and aggregate
  hunk bounds before any planner or handler observation. The compact 32-hunk
  fallback plus the maximum admitted exact path must fit the 2,048-code-unit
  approval preview bound.
  Preview remove and insert fields retain independent line prefixes; backslashes,
  tabs, and non-line control or format scalars are escaped. Only formatter-owned
  LF separators are admitted by the preview boundary; exact terminal-separator
  escapes remain printable ASCII inside their owning row. Reject
  ambiguous anchors, overlapping or reordered hunks, no-op hunks, and stale
  state before mutation.
  Invocation crosses the owned decision 0046 mutation committer exactly once;
  it never returns to a portable pathname write. Linux uses guarded `openat2`,
  `O_TMPFILE` publication, and an exclusive write lease. Windows uses
  handle-relative `NtCreateFile`, exclusive sharing, and delete-pending create
  settlement. Unsupported platform or filesystem primitives fail closed.
  Describe the guarantee as one object-bound commit, not multi-file atomicity,
  crash-safe rollback, storage durability, or a filesystem sandbox.
- `manage_path` is the only admitted namespace tool. It accepts one closed
  `create_directory`, `move`, or `remove` request. It creates exactly one
  directory, moves one file or directory to an absent destination, or removes
  one file or empty directory. Every successfully planned operation requires
  one exact authorization and crosses the separate decision 0054 native namespace
  committer exactly once. Bind authorization to canonical paths, source kind and
  identity, parent identities, and destination absence; reject overwrite,
  merge, recursive or nonempty-directory removal, self-descendant moves, and
  stale state. Unsupported platform or filesystem namespace primitives fail
  closed. Windows supports all three operations through its object-bound native
  protocol. Linux supports only `create_directory`; `move` and `remove` return
  `unsupported` before namespace observation because the admitted Linux APIs
  cannot condition either mutation on the approved source identity. The
  namespace committer exposes one closed operation capability to the planner;
  unsupported operations fail there before path-specific planning or approval,
  while the native broker remains the final fail-closed authority. Do not add
  a check-close-name mutation sequence, cooperative lock, or rollback fallback.
  Describe every successful result as one object-bound namespace commit, not a
  filesystem transaction, durability guarantee, rollback, or sandbox.
- Future controller-internal concurrency may overlap only bounded independent
  mechanics over immutable snapshots during a read-only phase. It cannot enter
  the tool engine or overlap a mutation, and its results return to the sole
  controller for deterministic reduction.
- Model turns, tool handlers, writes, process execution, permissions, and terminal
  output remain serialized. Current runtime remains sequential.
- A failed turn after a completed tool checkpoint retains that tool truth and
  publishes only the CLI-owned closed failure classification. The transcript
  marker and ephemeral notice distinguish `model/...`, `tool/...`, and the
  residual `runtime/failure` without exposing provider causes, tool payloads,
  paths, content, or call identifiers. Do not describe a later model
  continuation failure as a failed tool or retry a completed effect implicitly.
- Core and TUI never depend on each other. Dependencies point inward, public
  surfaces go through `src/index.ts`, and deep cross-package imports are banned.
- Keep modules cohesive, documented, independently testable, replaceable, and
  removable without unrelated rewrites. Do not create speculative layers.
- Every owned engine or framework must define a complete intended contract:
  lifecycle, bounds, failures, security, tests, updates, rollback, and removal.
- Keep the model-facing harness lean: every tool needs one canonical name, a
  distinct capability, current necessity, focused tests, and independent
  removal. Tool aliases and speculative conveniences are forbidden.
- Tool convergence follows decision 0050. The permanent harness targets three
  bounded read capabilities, one text-patch capability, one namespace
  capability, and one execute capability. Migrate one authority domain at a
  time; never retain overlapping old and new names after a replacement change.
  The current advertised inventory is exactly `read_file`, `list_directory`,
  `search_text`, `apply_patch`, `manage_path`, and `run_process`; the six-domain
  convergence is complete. A future sandboxed `shell` may replace
  `run_process` only after a separate Windows and Linux isolation proof; the
  two execute tools may never coexist.
- Keep process execution inside the admitted decision 0036 contract: one
  CLI-owned closed program registry, exact per-call permission, fixed limits,
  isolated operating-system bootstrap, bounded output, and complete descendant
  cancellation and cleanup on Windows and Linux. The current registry contains
  only `node`; new entries need exact executable resolution, a closed argument
  policy, current evaluation evidence, and decisions 0036 and 0050 updated in
  the same change.
- Owned task evaluation is maintainer tooling, not product runtime. Keep its
  versioned corpus, manifest, offline evaluator, closed metric records, and
  validator under decision 0047. Preparation exposes only an input snapshot;
  grading compares regular-file trees without executing candidate code; the
  canonical verifier validates the corpus but never creates a run, launches
  `agent`, contacts a provider, captures a transcript, or reads credentials.
  The exact interactive `agent --evaluation-receipt` option from decision 0048
  is a separate CLI-owned observer. It emits only duration, accepted-turn,
  accepted-tool-call, affirmative-approval, and repeated-read counts after
  terminal cleanup. It writes no evaluation state, captures no content, changes
  no authority, and leaves semantic outcome, correction, and risk classification
  to the operator. Stale runtime events never increment its counters. Receipt
  settlement is classified only after the product run, and any receipt failure
  remains secondary to an underlying product failure. Composition-root process
  output retains one temporary error listener across an errored Node write
  callback until the required subsequent error event settles the write.
  Keep the versioned evaluation failure registry from decision 0049 separate
  from ignored run state. It admits only closed content-free evidence bound to
  maintained tasks and their current expected-path inventories, explicit
  occurrence counts, one category and priority, and optional tracked resolution
  proof. The canonical verifier validates it
  without reading ignored runs or inferring recurrence. Its sole source read is
  rooted at the explicit canonical repository directory; every directory to the
  registry parent is non-linked and identity-stable before and after the bounded
  descriptor read. The final component is opened without following links and,
  where the platform exposes the flag, without blocking on a raced special file.
  The regular-file path and descriptor retain one identity, size, modification
  time, and change time through opening and completion. Fatal decoding, parsing,
  and canonical reconstruction failures remain content-free. One
  observed failure remains `observing`; it does not justify a new tool, prompt
  change, or runtime change by itself.

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
