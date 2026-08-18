# Ownership and provenance

## Meaning of “ours”

All product behavior, TypeScript source, tests, prompts, schemas, terminal
rendering, protocol adapters, declarations, verification tools, and generated
source are authored in this repository. We do not copy, translate, port, adapt,
vendor, or regenerate project code from third parties.

The permitted external substrate is deliberately narrow:

- Node.js `>=22.19.0` and explicitly allowlisted `node:` built-ins;
- npm `11.16.0` as offline local-workspace linker;
- TypeScript compiler `5.9.3`, installed outside the repository;
- GitHub-hosted Windows runners as ephemeral verification infrastructure;
- documented operating-system services and terminal capabilities;
- public protocol and data-format specifications required for interoperability;
- verbatim legal terms required to license and distribute the work;
- remote model services explicitly selected by the user at runtime.

Compiled JavaScript, declarations, source maps, workspace links, and lock
metadata are derived toolchain artifacts from owned inputs. They are not foreign
source and are never edited manually. Client behavior, serialization, streaming,
errors, retries, policy, prompts, and UI remain our implementations.

The task-evaluation briefs, input workspaces, expected workspaces, manifest,
grader, and tests are original repository artifacts. They are not copied or
adapted benchmark material, and no external task corpus or candidate solution
is admitted into product source.

The evaluation failure registry, its taxonomy, validation rules, and synthetic
contract-test examples are original repository artifacts derived only from the
maintained owned task corpus. The canonical registry may be empty and retains
no candidate source, transcript, provider output, external benchmark result, or
personal content. The directly executable TypeScript input and expected
fixtures and the controlled JavaScript red-green task are likewise original
maintained source, not captured candidate code or foreign benchmark material.
The namespace-directory browser task and its HTML and CSS snapshots are
likewise original maintained source and contain no captured external page or
stylesheet.

## Forbidden inputs

- npm registry, Git, URL, file, development, peer, optional, or bundled packages;
- third-party frameworks, SDKs, plugins, binaries, declarations, or `@types/node`;
- copied or mechanically transformed snippets from repositories, answers,
  tutorials, generated samples, or model output derived from foreign source;
- vendored source and generated code whose owned input is not present here;
- reference-project implementation files used as a shortcut, source of product
  identity, or source of code-level design.

External documentation or current public source may establish observable
behavior or a protocol. Record the commit, material, and allowed facts below
before implementation. Work from an independently derived contract, write an
original design, and verify it through independent tests. Never reuse registered
identifiers, prompts, fixtures, headers that assert foreign identity, or source
structure.

## Provenance log

| Date | Reference | Material inspected | Allowed influence | Code copied |
|---|---|---|---|---|
| 2026-08-07 | [earendil-works/pi](https://github.com/earendil-works/pi) | Public root README and manifest, TypeScript configuration, package names, TUI README, package documentation | Node/TypeScript/ESM/npm-workspace stack category; high-level separation of runtime, model access, TUI, and CLI | None |
| 2026-08-07 | [Node.js documentation](https://nodejs.org/docs/latest-v24.x/api/) | Process and terminal streams, filesystem promises, paths, child processes, timers, test runner, assertions, ESM, and built-in TypeScript behavior | Minimal runtime declarations, bounded platform adapters, and toolchain behavior | None |
| 2026-08-14 | [Node.js 22.19 stream documentation](https://nodejs.org/download/release/v22.19.0/docs/api/stream.html#writablewritechunk-encoding-callback) | Exact `Writable.write()` callback and subsequent `error` event ordering for the admitted runtime | Temporary process-output listener lifecycle and deterministic content-free write settlement | None; no sample or implementation structure reused |
| 2026-08-07 | [TypeScript documentation](https://www.typescriptlang.org/docs/) | Compiler configuration and project references | Build graph and strict checking behavior | None |
| 2026-08-07 | [npm workspaces documentation](https://docs.npmjs.com/cli/v11/using-npm/workspaces/) | Local workspace linking and lockfile behavior | Explicit local package topology | None |
| 2026-08-07 | [Pi v0.84.1 source](https://github.com/earendil-works/pi/tree/7aca0d7b3e041a9e2b635e8370b2549f032932d6) | Provider registration, OAuth, credential lifecycle, request boundaries, focused auth tests, related issues and pull requests | Existence of direct subscription flows for ChatGPT, Claude, Kimi, and Grok; protocol families; failure and identity risks; eligibility requirements | None; no identifiers, prompts, headers, fixtures, or implementation structure reused |
| 2026-08-08 | Local Harness manual at commit `e4d197e3be887e3fe26f4921343e23eebaeb085c` | Read-only manual index, two English chapters, locale registry, and manual path tests, inspected at the user's request | Editorial value of a chaptered operator manual, explicit current-capability inventory, evidence links, and automated drift checks | None; no text, headings, structure, scripts, styles, or tests reused |
| 2026-08-08 | [Pi v0.84.1 source](https://github.com/earendil-works/pi/tree/e47b8e37a6211ebd0b2942fa87059d64f81eec02) | Current ChatGPT, Claude, Kimi Code, and xAI OAuth modules plus repository tree | Confirmation that direct flows remain technically implemented; each flow depends on a concrete registered client identity that does not transfer to `agent` | None; no identifiers, endpoints, scopes, prompts, headers, fixtures, or implementation structure reused |
| 2026-08-08 | [OpenAI Codex authentication](https://developers.openai.com/codex/auth/), [App Server](https://developers.openai.com/codex/app-server/), and [developer community](https://developers.openai.com/community) | Subscription sign-in for Codex clients, App Server managed login, official community and open-source program routes | ChatGPT subscription access exists through OpenAI surfaces, but no public independent-client registration route is documented; basis for a developer-forum authorization inquiry | None; no samples, endpoints, identifiers, or implementation structure reused |
| 2026-08-08 | [Anthropic authentication](https://code.claude.com/docs/en/authentication), [Agent SDK plan use](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), and [support route](https://support.claude.com/en/articles/9015913-how-to-get-support) | Claude subscription login, current third-party Agent SDK entitlement, official Product Support path | Subscription-backed third-party use exists through Anthropic runtimes, but direct independent-client authorization is not documented; basis for a private support inquiry | None; no SDK source, tokens, identifiers, protocol samples, or implementation structure reused |
| 2026-08-08 | [Kimi Code overview](https://www.kimi.com/code/docs/en/), [device login](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html), [feedback routes](https://www.kimi.com/code/docs/en/kimi-code/contact-and-feedback.html), and [issue tracker](https://github.com/MoonshotAI/kimi-code/issues) | CLI device OAuth, subscriber API keys for third-party tools, truthful client-identity rule, official feedback channels, and current restriction on new issues | Direct OAuth remains specific to Kimi Code while third parties use keys; the official private support email is the viable independent-client inquiry route | None; no source, endpoint, client identity, credential, or protocol fixture reused |
| 2026-08-08 | [xAI Grok Build](https://docs.x.ai/build/overview), [enterprise authentication](https://docs.x.ai/build/enterprise), [Grok subscription FAQ](https://docs.x.ai/grok/faq), and [contact routes](https://x.ai/contact) | Browser and device login, headless and ACP surfaces, subscription usage, API-key separation, official product support | Grok Build is subscription-authenticated, but no public independent-client registration route is documented; basis for a private support inquiry | None; no source, endpoint, identity, credential, or protocol fixture reused |
| 2026-08-09 | [OpenCode Go](https://opencode.ai/docs/go/) | Direct subscriber API-key contract, published Chat Completions endpoint, current model identifier, pricing class, and current Kimi K2.7 Code data-use statement | Eligibility for one independently implemented fixed-origin direct provider; model and privacy records for decision 0017 | None; no SDK, executable, source, sample, fixture, prompt, identity, or configuration reused |
| 2026-08-16 | [OpenCode Go](https://opencode.ai/docs/go/) | Current fixed Go endpoint and its OpenAI-compatible Chat Completions classification | Reconfirmation that the owned request encoder remains on the admitted direct protocol while decision 0061 narrows tool selection to one call per model response | None; no SDK, source, sample, fixture, prompt, identifier, or implementation structure reused |
| 2026-08-16 | [OpenCode Zen](https://opencode.ai/docs/zen/) | Current fixed Zen Chat Completions endpoint, temporary free DeepSeek model identifier, hosting region, and documented data-use exception | Independent Zen adapter, session-only provider selection, and operator privacy warning under decision 0067 | None; no SDK, executable, source, sample, fixture, prompt, identity, or configuration reused |
| 2026-08-16 | [OpenCode Go](https://opencode.ai/docs/go/), [OpenCode Zen](https://opencode.ai/docs/zen/), and their public `/models` responses | Fixed public model-list paths, current model identifiers exposed for each service, Go-plan versus Zen balance routing, and temporary free-model classification | Owned bounded catalog decoder, exact per-provider Chat Completions allowlists, process-only `/models` selection, and cost labels under decision 0068 | None; no SDK, executable, source, sample, fixture, prompt, client identity, or implementation structure reused; live credentials were not sent with catalog inspection |
| 2026-08-09 | [OpenAI Chat Completions create contract](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) | Public request, streaming SSE, finish-reason, and streamed tool-call data contract | Interoperability shape independently implemented by the owned OpenCode Go adapter | None; no SDK, sample, source, prompt, fixture, or implementation structure reused |
| 2026-08-16 | [Ollama Cloud](https://docs.ollama.com/cloud), [API authentication](https://docs.ollama.com/api/authentication), [chat API](https://docs.ollama.com/api/chat), [model catalog](https://docs.ollama.com/api/tags), [tool calling](https://docs.ollama.com/capabilities/tool-calling), and [streaming](https://docs.ollama.com/api/streaming) | Fixed cloud origin, bearer authentication, authenticated model catalog, native JSON chat stream, and native tool-call shapes | Independently implemented fixed-origin Ollama Cloud provider, dynamic authenticated model selection, and bounded ordered tool interoperability under decision 0072 | None; no SDK, CLI, executable, local daemon, source, sample, fixture, prompt, product identity, or implementation structure reused |
| 2026-08-09 | [Pi source at `936aff0`](https://github.com/earendil-works/pi/tree/936aff00918de1187f085f123c2812d8f2d67745) | Alternate-screen renderer, scroll behavior, Markdown presentation, message composition, tool activity, and compact footer behavior | Observable synchronized redraw, differential updates, follow-end history, structured message hierarchy, and persistent tool lifecycle; basis for an independently designed incremental TUI roadmap | None; no source, tests, prompts, identifiers, component hierarchy, styles, fixtures, or product identity reused |
| 2026-08-12 | User-supplied `agent-logo-pack.zip` | Eight selected PNG and SVG logo and wordmark assets plus their archive provenance | Exact canonical visual identity registered by immutable digest for repository, authentication, and future TUI use | Exact supplied assets admitted verbatim; no product source |
| 2026-08-13 | User-supplied `agent-roadmap-punti-1-5.md` | Security and consolidation analysis against public commit `16ceba6` | Candidate namespace-qualified SVG bypass and ordering evidence for independently reviewed hardening work | None; the finding was reproduced locally and no prose, code, tests, or structure was reused |
| 2026-08-13 | [Node.js 22.19 OS documentation](https://nodejs.org/download/release/v22.19.0/docs/api/os.html) | Documented environment precedence of `homedir()` and `tmpdir()` and operating-system provenance of effective-user information | Rejection of environment-derived protected roots and the need for a separate platform authority | None |
| 2026-08-13 | [Microsoft Known Folder documentation](https://learn.microsoft.com/en-us/windows/win32/shell/known-folders) and [`SHGetKnownFolderPath`](https://learn.microsoft.com/en-us/windows/win32/api/shlobj_core/nf-shlobj_core-shgetknownfolderpath) | Current-user known-folder lookup, COM initialization, returned-memory ownership, and Profile and Local AppData identities | Windows platform-root API selection and lifecycle contract | None |
| 2026-08-13 | [XTerm control-sequence reference](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) | DEC private modes 1002 and 1006, SGR mouse reports, OSC string termination, OSC 8 hyperlinks, and OSC 52 clipboard transport | Cross-platform VT wire contracts for independently implemented bounded terminal interaction | None; no source, samples, parser structure, or terminal implementation reused |
| 2026-08-13 | [Windows Terminal selection documentation](https://learn.microsoft.com/en-us/windows/terminal/selection) and [interaction settings](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/interaction) | Mouse-mode routing, the Shift native-selection override, word selection, hyperlink navigation, and clipboard interaction | Observable Windows host behavior, explicit native escape hatch, and manual verification targets | None; no source, settings, identifiers, or implementation structure reused |
| 2026-08-13 | [Windows Terminal OSC 52 capability record](https://github.com/microsoft/terminal/issues/19017) | OSC 52 support and device-attribute capability registration shipped for the 1.24 line | Minimum Windows Terminal clipboard interoperability evidence and an explicit unconfirmed-host fallback contract | None; no source or implementation structure reused |
| 2026-08-13 | [Win32 clipboard operations](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-operations), [`OpenClipboard`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-openclipboard), [`EmptyClipboard`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-emptyclipboard), and [`SetClipboardData`](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setclipboarddata) | Exclusive clipboard access, ownership, close lifecycle, `GMEM_MOVEABLE` transfer, `CF_UNICODETEXT`, and authoritative success | Independently implemented bounded Windows clipboard broker and truthful copy confirmation | None; no source, sample, identifiers, or implementation structure reused |
| 2026-08-14 | Microsoft [`NtCreateFile`](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile), [`FILE_DISPOSITION_INFO`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_disposition_info), and [`SetFileInformationByHandle`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle) documentation | Directory-handle-relative object selection, exclusive share contracts, create disposition, delete-pending lifecycle, complete writes, and flush settlement | Independently implemented object-bound Windows mutation commit with no-overwrite creation and kill cleanup | None; no sample, source, identifier set, fixture, or implementation structure reused |
| 2026-08-14 | Linux [`openat2`](https://man7.org/linux/man-pages/man2/openat2.2.html), [`open` and `O_TMPFILE`](https://man7.org/linux/man-pages/man2/openat.2.html), [file leases](https://man7.org/linux/man-pages/man2/F_SETLEASE.2const.html), and [record locking](https://man7.org/linux/man-pages/man2/fcntl_locking.2.html) | Guarded handle-relative lookup, unnamed-file publication, exclusive lease behavior, and limits of advisory or removed mandatory record locks | Independently implemented object-bound Linux mutation commit and fail-closed unsupported policy | None; no sample, source, identifiers, fixture, or implementation structure reused |
| 2026-08-16 | Linux man-pages 6.15 [`renameat2`](https://man7.org/linux/man-pages/man2/renameat2.2.html) and [`unlinkat`](https://man7.org/linux/man-pages/man2/unlinkat.2.html), plus Linux v6.15 [`RENAME_*` UAPI](https://github.com/torvalds/linux/blob/v6.15/include/uapi/linux/fs.h) | Parent-descriptor and pathname source selection, destination-only no-replace semantics, and absence of a source-identity-conditional rename or unlink interface | Operation-specific fail-closed Linux namespace policy for independently implemented move and remove handling | None; no sample, implementation source, identifier set, fixture, or structure reused |
| 2026-08-18 | [OpenAI Codex agent approvals and security](https://developers.openai.com/codex/agent-approvals-security/) | Public operator documentation for command capability, sandboxing, approval policy, and network controls | Confirmation that technical capability and per-action approval are separate authority layers; the owned shell remains independently designed and truthfully documents that containment is not sandboxing | None; no source, SDK, prompt, sample, test, identifier, or implementation structure inspected or reused |
| 2026-08-18 | [Pi public compaction and branch documentation at `2509b5c`](https://github.com/earendil-works/pi/blob/2509b5c037d366979f2febfce4174b88aeaadc6a/packages/coding-agent/docs/compaction.md) | Public documentation of tree navigation, common-ancestor branch summaries, and append-only compaction records | Observable value of retaining alternate conversation paths and rebuilding one active context; input for a future independently designed journal decision, not the present shell implementation | None; implementation links, source, prompts, schemas, identifiers, tests, fixtures, and serialization structure were not inspected or reused |
| 2026-08-08 | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) | Official license terms | Verbatim legal permission, conditions, patent grant, warranty disclaimer, and redistribution text in `LICENSE` | Legal terms reproduced verbatim; no product code |
| 2026-08-08 | [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [event references](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), and [ruleset status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) | Workflow events, event SHA/ref behavior, permissions, concurrency, timeouts, and required-check naming | Owned continuous-verification protocol and safe activation order | None; no action, workflow sample, script, or implementation source reused |

Pi implementation source was inspected with explicit user authorization because
its provider documentation lagged current behavior. Inspection was read-only and
commit-pinned. The local design remains independently derived through zero
external packages, owned Node declarations, an allowlisted import surface, and
a deny-by-default provider gate. Pi code and identity remain forbidden inputs.

Later TUI comparison remains restricted to observable outcomes and does not
admit a foreign hierarchy, module boundary, name, style literal, animation
timing, redraw algorithm, or source structure.

The local Harness manual was also inspected read-only with explicit user
authorization. Only the need for a task-oriented, automatically checked manual
influenced the decision. `agent` uses an independently designed Markdown
contract, chapter taxonomy, policy schema, validator, tests, and prose.

Development tools may assist repository work, but every accepted artifact is
reviewed against this project's rules, tests, and provenance contract. The
project adds no automatic tool signature or co-author trailer and makes no false
claim that development occurred without tool assistance. Maintainer identity,
license, governance, and public-document integrity are pinned by the publication
policy.

## Review checklist

For every change, verify that code can be attributed to this repository,
dependencies are exact owned workspace edges, Node APIs are declared and
allowlisted, external facts have a provenance entry, derived output traces to
owned inputs, and each module can be updated or removed through its documented
contract. Stop the change if provenance is uncertain.
