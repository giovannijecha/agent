# Documentation migration ledger

- Status: active
- Governing decision: [0070](decisions/0070-owned-documentation-information-architecture.md)

This ledger makes the documentation reduction lossless. A row moves to
`complete` only after its canonical destination contains the full surviving
contract, every former source links there, and the repository verifier accepts
the change.

## Guardrails

- Do not delete a requirement before its canonical owner is explicit.
- Migrate one authority domain at a time with documentation, policy, and tests
  in the same change.
- Preserve stable decision paths and historical records.
- Keep current duplicated text authoritative until its row is complete.
- Prefer short audience-specific summaries and links over repeated contracts.

## Current delivery

The public README now covers installation, first-run use, capability
orientation, safety, verification, and authoritative links. The manual uses
registered task-specific contracts instead of one repeated chapter template.
The repository instructions now retain only the cross-cutting change contract,
essential invariants, canonical commands, and an exact task router; subsystem
details remain in their registered living documents and stable decisions. The
offline documentation policy verifies those headings and routes. Current
architecture, change evidence, and operational procedure now have separate
canonical owners, and the policy gate locks their level-one and level-two
structures against editorial drift. The contribution workflow now owns
participation, issue intake, authorship, and licensing in `CONTRIBUTING.md`;
its registered structure and local links are verified, while repository,
engineering, maintenance, and publishing guidance route there without
repeating that contract. Vulnerability reporting now has one current owner in
`SECURITY.md`; its structure and critical publication contracts are verified,
maintenance routes there, and the publishing chapter retains only the
pre-release operator action for enabling the private reporting channel.
Privacy and memory-only secret handling now has one current owner in
`PRIVACY.md`; its structure, retention, isolation, and removal contracts are
verified, while provider and operator documents retain only their specific
technical and task-facing responsibilities and route to that owner.
Clean-room provenance and reference inspection now have one current owner in
`docs/OWNERSHIP.md`; its structure and critical clean-room contracts are
verified, while repository, provider, brand, maintenance, OAuth, and operator
documents retain only their scoped instructions and route to that owner.
Direct provider admission and operation now have one current owner in
`docs/PROVIDERS.md`; its structure and critical direct-provider contracts are
verified, while repository, architecture, maintenance, public, and operator
documents retain only their scoped summaries and route to that owner.
Provider registration requests now have one current owner in
`docs/PROVIDER-APPLICATIONS.md`; its structure, request lifecycle, routes, and
public or content-free references are verified, while the provider policy
retains only eligibility and routes to that ledger.
Subscription OAuth registration status now has one current owner in
`docs/OAUTH-REGISTRATION.md`; its structure, registration conclusions, evidence
gate, primary references, and incoming routes are verified, while the provider
policy retains only the runtime admission consequence and routes to that
dossier.

## Content ledger

| Topic | Current sources | Future canonical owner | Status |
| --- | --- | --- | --- |
| Public purpose, identity, installation, and first run | [Public README](../README.md), [brand guide](BRAND.md) | [Public README](../README.md) | active |
| Repository-wide change constraints and routing | [Repository instructions](../AGENTS.md), [architecture](ARCHITECTURE.md), [engineering guide](ENGINEERING.md) | [Repository instructions](../AGENTS.md) | complete |
| Contribution workflow | [Repository instructions](../AGENTS.md), [contributing guide](../CONTRIBUTING.md), [engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md), [publishing chapter](manual/07-publishing-and-governance.md) | [Contributing guide](../CONTRIBUTING.md) | complete |
| License terms | [License](../LICENSE) | [License](../LICENSE) | retained |
| Vulnerability reporting | [Security policy](../SECURITY.md), [maintenance guide](MAINTENANCE.md) | [Security policy](../SECURITY.md) | complete |
| Privacy and memory-only secrets | [Privacy policy](../PRIVACY.md), [provider policy](PROVIDERS.md), [operator manual](manual/README.md) | [Privacy policy](../PRIVACY.md) | complete |
| Current package and runtime architecture | [Repository instructions](../AGENTS.md), [architecture](ARCHITECTURE.md), [engineering guide](ENGINEERING.md) | [Architecture](ARCHITECTURE.md) | complete |
| Development and verification practice | [Repository instructions](../AGENTS.md), [engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md) | [Engineering guide](ENGINEERING.md) | complete |
| Maintainer diagnostics, releases, and rollback | [Engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md) | [Maintenance guide](MAINTENANCE.md) | complete |
| Brand identity and registered assets | [Public README](../README.md), [brand guide](BRAND.md), [brand assets](../assets/brand/README.md) | [Brand guide](BRAND.md) | active |
| Clean-room provenance and inspections | [Repository instructions](../AGENTS.md), [ownership record](OWNERSHIP.md) | [Ownership record](OWNERSHIP.md) | complete |
| Direct provider admission and operation | [Repository instructions](../AGENTS.md), [provider policy](PROVIDERS.md), [operator manual](manual/README.md) | [Provider policy](PROVIDERS.md) | complete |
| Provider registration requests | [Provider applications](PROVIDER-APPLICATIONS.md), [provider policy](PROVIDERS.md) | [Provider applications](PROVIDER-APPLICATIONS.md) | complete |
| OAuth registration status | [OAuth registration](OAUTH-REGISTRATION.md), [provider policy](PROVIDERS.md) | [OAuth registration](OAUTH-REGISTRATION.md) | complete |
| Product operation | [Public README](../README.md), [operator manual](manual/README.md), [maintenance guide](MAINTENANCE.md) | [Operator manual](manual/README.md) | active |
| Operator-manual structure and repository evidence routing | [decision 0009](decisions/0009-owned-operator-manual.md), [manual chapters](manual/README.md), [manual policy](../tools/manual-policy.json) | [decision 0071](decisions/0071-owned-task-oriented-operator-manual.md) and task-specific manual chapters | active |
| Turn operation, runtime bounds, checkpoints, and failure recovery | [turn-lifecycle manual](manual/02-turn-lifecycle.md), [architecture](ARCHITECTURE.md), [maintenance guide](MAINTENANCE.md), [checkpoint decisions](decisions/0029-canonical-tool-call-batches.md) | [turn-lifecycle manual](manual/02-turn-lifecycle.md) for operator flow, [architecture](ARCHITECTURE.md) for current runtime contracts, [maintenance guide](MAINTENANCE.md) for change procedure, and stable decisions for rationale | complete |
| Terminal editing, navigation, selection, and presentation | [terminal-interface manual](manual/03-terminal-interface.md), [architecture](ARCHITECTURE.md), [engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md), and terminal decisions | [terminal-interface manual](manual/03-terminal-interface.md) for operator controls, [architecture](ARCHITECTURE.md) for current TUI and CLI contracts, [maintenance guide](MAINTENANCE.md) for change procedure, and the [decision index](decisions/README.md) for rationale | complete |
| Tool use, session permissions, previews, and operator recovery | [tools-and-permissions manual](manual/04-tools-and-approval.md), [architecture](ARCHITECTURE.md), [maintenance guide](MAINTENANCE.md), [privacy policy](../PRIVACY.md), and tool decisions | [tools-and-permissions manual](manual/04-tools-and-approval.md) for operator choices and the verified inventory, [architecture](ARCHITECTURE.md) for current contracts, [maintenance guide](MAINTENANCE.md) for change and removal, [privacy policy](../PRIVACY.md) for disclosure rules, and the [decision index](decisions/README.md) for rationale | complete |
| Provider connection, model selection, process-only credentials, and operator recovery | [providers-and-authentication manual](manual/05-providers-and-authentication.md), [provider policy](PROVIDERS.md), [privacy policy](../PRIVACY.md), [architecture](ARCHITECTURE.md), [maintenance guide](MAINTENANCE.md), and provider decisions | [providers-and-authentication manual](manual/05-providers-and-authentication.md) for operator flow, [provider policy](PROVIDERS.md) for eligibility and wire admission, [privacy policy](../PRIVACY.md) for secret and retention boundaries, [architecture](ARCHITECTURE.md) for current contracts, [maintenance guide](MAINTENANCE.md) for change and removal, and the [decision index](decisions/README.md) for rationale | complete |
| Change verification, failure diagnosis, and evaluation routing | [verification-and-diagnostics manual](manual/06-verification-and-diagnostics.md), [engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md), [evaluation guide](../evaluations/README.md), and verification and evaluation decisions | [verification-and-diagnostics manual](manual/06-verification-and-diagnostics.md) for operator flow, [engineering guide](ENGINEERING.md) for definition of done and verification policy, [maintenance guide](MAINTENANCE.md) for gate change and removal, [evaluation guide](../evaluations/README.md) for the evaluation lifecycle, and the [decision index](decisions/README.md) for rationale | complete |
| Owned evaluation operation | [Evaluation manual](../evaluations/README.md), [engineering guide](ENGINEERING.md), [maintenance guide](MAINTENANCE.md) | [Evaluation manual](../evaluations/README.md) | active |
| Durable design history | decision files and [decision index](decisions/README.md) | [Decision index](decisions/README.md) and stable records | active |

## Delivery sequence

1. Establish the central map, complete decision index, migration ledger, and
   offline documentation policy.
2. Reduce public and operator entry points while retaining deep operational
   authority.
3. Separate current architecture from development and maintenance procedure.
4. Replace repeated repository constraints with links to one exact owner.
5. Reconcile manual and publication policies after their duplicated assertions
   have canonical destinations.
6. Close each ledger row only with focused regression coverage and the
   canonical verifier passing.

## Completion conditions

The migration is complete when every row is `complete` or deliberately
`retained`, every maintained topic has one clear owner, all incoming links are
valid, and no policy requires repeated prose merely to prove consistency. A
later decision may then retire this temporary ledger while preserving the
central map, decision index, and offline validation.
