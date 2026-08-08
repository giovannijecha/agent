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
- documented operating-system services and terminal capabilities;
- public protocol and data-format specifications required for interoperability;
- verbatim legal terms required to license and distribute the work;
- remote model services explicitly selected by the user at runtime.

Compiled JavaScript, declarations, source maps, workspace links, and lock
metadata are derived toolchain artifacts from owned inputs. They are not foreign
source and are never edited manually. Client behavior, serialization, streaming,
errors, retries, policy, prompts, and UI remain our implementations.

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
| 2026-08-07 | [TypeScript documentation](https://www.typescriptlang.org/docs/) | Compiler configuration and project references | Build graph and strict checking behavior | None |
| 2026-08-07 | [npm workspaces documentation](https://docs.npmjs.com/cli/v11/using-npm/workspaces/) | Local workspace linking and lockfile behavior | Explicit local package topology | None |
| 2026-08-07 | [Pi v0.84.1 source](https://github.com/earendil-works/pi/tree/7aca0d7b3e041a9e2b635e8370b2549f032932d6) | Provider registration, OAuth, credential lifecycle, request boundaries, focused auth tests, related issues and pull requests | Existence of direct subscription flows for ChatGPT, Claude, Kimi, and Grok; protocol families; failure and identity risks; eligibility requirements | None; no identifiers, prompts, headers, fixtures, or implementation structure reused |
| 2026-08-08 | Local Harness manual at commit `e4d197e3be887e3fe26f4921343e23eebaeb085c` | Read-only manual index, two English chapters, locale registry, and manual path tests, inspected at the user's request | Editorial value of a chaptered operator manual, explicit current-capability inventory, evidence links, and automated drift checks | None; no text, headings, structure, scripts, styles, or tests reused |
| 2026-08-08 | [Pi v0.84.1 source](https://github.com/earendil-works/pi/tree/e47b8e37a6211ebd0b2942fa87059d64f81eec02) | Current ChatGPT, Claude, Kimi Code, and xAI OAuth modules plus repository tree | Confirmation that direct flows remain technically implemented; each flow depends on a concrete registered client identity that does not transfer to `agent` | None; no identifiers, endpoints, scopes, prompts, headers, fixtures, or implementation structure reused |
| 2026-08-08 | Current official OpenAI, Anthropic, Kimi Code, and xAI documentation | Subscription authentication, third-party integration, App Server, Agent SDK, API-key, headless, and ACP eligibility surfaces | Distinction between direct independent-client authorization and sanctioned vendor bridge paths; current provider gate and removal requirements | None; no samples, schemas, SDK code, identifiers, or generated artifacts reused |
| 2026-08-08 | [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) | Official license terms | Verbatim legal permission, conditions, patent grant, warranty disclaimer, and redistribution text in `LICENSE` | Legal terms reproduced verbatim; no product code |

Pi implementation source was inspected with explicit user authorization because
its provider documentation lagged current behavior. Inspection was read-only and
commit-pinned. The local design remains independently derived through zero
external packages, owned Node declarations, an allowlisted import surface, and
a deny-by-default provider gate. Pi code and identity remain forbidden inputs.

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
