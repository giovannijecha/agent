# Architecture decision records

Decision records preserve durable design history at stable numeric paths. They
are never renumbered or moved for presentation. Use this index to locate the
current authority by domain and to see whether a record has been superseded.

## Lifecycle

Beginning with decision 0070, every new record declares `Status`, `Date`,
`Domain`, `Supersedes`, and `Superseded by`. Accepted records remain in place
when superseded. A consolidation record may replace several older contracts,
but it links them rather than rewriting their history.

The complete ledger classifies every stable record. The current-authority view
routes each closed domain only to accepted entry points. Every record retains
its numeric heading plus its `Context` and `Decision`; the verifier preserves
historical pre-0070 formats instead of normalizing them retroactively.

Create a decision only for a durable architectural, authority, security,
provider, toolchain, product-behavior, or documentation-governance contract.
Routine implementation notes, transient incidents, and test evidence do not
belong here.

## Current authority by domain

| Domain | Entry points |
| --- | --- |
| architecture | [0013 single-agent execution](0013-single-agent-execution.md), [0052 checkpointed failures](0052-owned-checkpointed-turn-failure-classification.md), [0061 convergent turns](0061-owned-convergent-tool-turns.md) |
| documentation | [0070 information architecture](0070-owned-documentation-information-architecture.md), [0071 task-oriented operator manual](0071-owned-task-oriented-operator-manual.md) |
| engineering | [0012 continuous verification](0012-owned-continuous-verification.md) |
| evaluation | [0047 reproducible evaluation](0047-owned-reproducible-task-evaluation.md), [0048 receipt](0048-owned-content-free-evaluation-receipt.md), [0049 failure registry](0049-owned-evaluation-failure-registry.md), [0064 TypeScript fixture](0064-owned-self-verifying-typescript-evaluation.md), [0065 red-green recovery](0065-owned-red-green-tool-recovery-evaluation.md), [0066 namespace directory](0066-owned-namespace-directory-evaluation.md) |
| foundation | [0002 TypeScript foundation](0002-owned-zero-dependency-typescript.md) |
| governance | [0010 public identity](0010-public-project-identity.md), [0037 canonical brand](0037-canonical-agent-brand.md) |
| providers | [0072 Ollama Cloud](0072-owned-ollama-cloud-provider.md), [0069 tool interoperability](0069-owned-tool-call-interoperability.md) |
| security | [0016 native containment](0016-owned-native-process-containment.md), [0042 workspace boundary](0042-owned-workspace-trust-boundary.md), [0058 Linux namespace boundary](0058-owned-linux-namespace-fail-closed-boundary.md) |
| terminal | [0023 Markdown](0023-owned-bounded-markdown.md), [0045 interaction](0045-owned-terminal-interaction.md), [0059 conversation focus](0059-owned-accented-conversation-focus.md) |
| tools | [0036 process execution](0036-owned-structured-process-execution.md), [0050 capability surface](0050-owned-minimal-coding-capability-surface.md), [0053 text patch](0053-owned-structured-text-patch.md), [0054 namespace management](0054-owned-workspace-namespace-management.md), [0055 permissions](0055-owned-session-tool-permissions.md) |

## Complete ledger

| Decision | Status | Domain | Relationship |
| --- | --- | --- | --- |
| [0001](0001-owned-zero-dependency-rust.md) | superseded | foundation | superseded by 0002 |
| [0002](0002-owned-zero-dependency-typescript.md) | accepted | foundation | supersedes 0001 |
| [0003](0003-owned-provider-authentication.md) | accepted | providers | current |
| [0004](0004-owned-interactive-terminal.md) | accepted | terminal | current |
| [0005](0005-owned-streaming-runtime.md) | accepted | architecture | current |
| [0006](0006-owned-vertical-tui-framework.md) | accepted | terminal | current |
| [0007](0007-owned-cli-application-loop.md) | accepted | architecture | current |
| [0008](0008-owned-tool-execution.md) | accepted | tools | current |
| [0009](0009-owned-operator-manual.md) | superseded | documentation | superseded by 0071 |
| [0010](0010-public-project-identity.md) | accepted | governance | current |
| [0011](0011-verified-provider-registration-requests.md) | accepted | providers | current |
| [0012](0012-owned-continuous-verification.md) | accepted | engineering | current |
| [0013](0013-single-agent-execution.md) | accepted | architecture | current |
| [0014](0014-lean-tool-harness.md) | accepted | tools | current |
| [0015](0015-process-tree-containment.md) | accepted | security | current |
| [0016](0016-owned-native-process-containment.md) | accepted | security | current |
| [0017](0017-owned-opencode-go-provider.md) | superseded | providers | superseded by 0072 |
| [0018](0018-owned-executable-startup.md) | accepted | architecture | current |
| [0019](0019-owned-semantic-terminal-tones.md) | superseded | terminal | superseded by 0023, 0027, and 0031 |
| [0020](0020-owned-scrollable-screen-foundation.md) | accepted | terminal | current |
| [0021](0021-owned-structured-terminal-rows.md) | accepted | terminal | current |
| [0022](0022-owned-tool-activity-surface.md) | accepted | tools | current |
| [0023](0023-owned-bounded-markdown.md) | accepted | terminal | supersedes 0019 |
| [0024](0024-owned-transcript-navigation.md) | accepted | terminal | current |
| [0025](0025-owned-word-aware-display-layout.md) | accepted | terminal | current |
| [0026](0026-owned-responsive-conversation-shell.md) | accepted | terminal | current |
| [0027](0027-owned-semantic-state-chrome.md) | accepted | terminal | supersedes 0019 |
| [0028](0028-owned-conversation-visual-grammar.md) | accepted | terminal | current |
| [0029](0029-canonical-tool-call-batches.md) | accepted | tools | current |
| [0030](0030-owned-structured-markdown-surfaces.md) | accepted | terminal | current |
| [0031](0031-owned-terminal-palette-and-code-highlighting.md) | accepted | terminal | supersedes 0019 |
| [0032](0032-owned-transcript-visual-refinement.md) | accepted | terminal | current |
| [0033](0033-owned-semantic-activity-surfaces.md) | accepted | tools | current |
| [0034](0034-owned-slash-command-completion.md) | accepted | terminal | current |
| [0035](0035-owned-multiline-composer-and-paste.md) | accepted | terminal | current |
| [0036](0036-owned-structured-process-execution.md) | accepted | tools | current |
| [0037](0037-canonical-agent-brand.md) | accepted | governance | current |
| [0038](0038-owned-deterministic-tui-motion.md) | accepted | terminal | current |
| [0039](0039-owned-responsive-conversation-stage.md) | accepted | terminal | current |
| [0040](0040-owned-quiet-conversation-rhythm.md) | accepted | terminal | current |
| [0041](0041-owned-ephemeral-contextual-notices.md) | accepted | terminal | current |
| [0042](0042-owned-workspace-trust-boundary.md) | accepted | security | current |
| [0043](0043-owned-conversation-density.md) | accepted | terminal | current |
| [0044](0044-owned-latin-prose-cell-width.md) | accepted | terminal | current |
| [0045](0045-owned-terminal-interaction.md) | accepted | terminal | current |
| [0046](0046-owned-handle-relative-mutation-commit.md) | accepted | tools | current |
| [0047](0047-owned-reproducible-task-evaluation.md) | accepted | evaluation | current |
| [0048](0048-owned-content-free-evaluation-receipt.md) | accepted | evaluation | current |
| [0049](0049-owned-evaluation-failure-registry.md) | accepted | evaluation | current |
| [0050](0050-owned-minimal-coding-capability-surface.md) | accepted | tools | current |
| [0051](0051-owned-bounded-file-line-projection.md) | accepted | tools | current |
| [0052](0052-owned-checkpointed-turn-failure-classification.md) | accepted | architecture | current |
| [0053](0053-owned-structured-text-patch.md) | accepted | tools | current |
| [0054](0054-owned-workspace-namespace-management.md) | accepted | tools | current |
| [0055](0055-owned-session-tool-permissions.md) | accepted | tools | current |
| [0056](0056-owned-compact-tool-activity-line.md) | accepted | tools | current |
| [0057](0057-owned-transparent-human-tool-activity.md) | accepted | tools | current |
| [0058](0058-owned-linux-namespace-fail-closed-boundary.md) | accepted | security | current |
| [0059](0059-owned-accented-conversation-focus.md) | accepted | terminal | current |
| [0060](0060-owned-semantic-patch-diff-foregrounds.md) | accepted | terminal | current |
| [0061](0061-owned-convergent-tool-turns.md) | accepted | architecture | current |
| [0062](0062-owned-changed-only-patch-preview.md) | accepted | tools | current |
| [0063](0063-owned-terminal-separator-patch-preview.md) | accepted | terminal | current |
| [0064](0064-owned-self-verifying-typescript-evaluation.md) | accepted | evaluation | current |
| [0065](0065-owned-red-green-tool-recovery-evaluation.md) | accepted | evaluation | current |
| [0066](0066-owned-namespace-directory-evaluation.md) | accepted | evaluation | current |
| [0067](0067-owned-opencode-provider-selection.md) | superseded | providers | superseded by 0072 |
| [0068](0068-owned-ephemeral-provider-and-model-selection.md) | superseded | providers | superseded by 0072 |
| [0069](0069-owned-tool-call-interoperability.md) | accepted | providers | current |
| [0070](0070-owned-documentation-information-architecture.md) | accepted | documentation | current |
| [0071](0071-owned-task-oriented-operator-manual.md) | accepted | documentation | supersedes 0009 |
| [0072](0072-owned-ollama-cloud-provider.md) | accepted | providers | supersedes 0017, 0067, and 0068 |
