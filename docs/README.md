# Agent documentation

This page is the shortest route to the maintained authority for each kind of
information. A document may summarize another authority for its audience, but
the linked owner is where the complete contract lives.

## Start here

| Document | Audience | Authority |
| --- | --- | --- |
| [Public README](../README.md) | public users | public product introduction |
| [Repository instructions](../AGENTS.md) | contributors and coding agents | repository change contract |
| [Contributing guide](../CONTRIBUTING.md) | contributors | contribution workflow |
| [License](../LICENSE) | users and contributors | license terms |
| [Security policy](../SECURITY.md) | users and reporters | vulnerability reporting policy |
| [Privacy policy](../PRIVACY.md) | users and operators | privacy contract |
| [Architecture](ARCHITECTURE.md) | maintainers and contributors | current product architecture |
| [Engineering guide](ENGINEERING.md) | contributors | development and verification practice |
| [Maintenance guide](MAINTENANCE.md) | maintainers | operational maintenance runbooks |
| [Brand guide](BRAND.md) | maintainers and contributors | public identity and presentation contract |
| [Ownership record](OWNERSHIP.md) | maintainers and auditors | clean-room ownership evidence |
| [Provider policy](PROVIDERS.md) | maintainers and integrators | admitted provider architecture |
| [Provider applications](PROVIDER-APPLICATIONS.md) | maintainers | provider registration request ledger |
| [OAuth registration](OAUTH-REGISTRATION.md) | maintainers | subscription adapter registration status |
| [Operator manual](manual/README.md) | operators | task-oriented product operation |
| [Evaluation manual](../evaluations/README.md) | maintainers | owned task-evaluation operation |
| [Decision index](decisions/README.md) | maintainers and auditors | durable design history |
| [Brand assets](../assets/brand/README.md) | maintainers and distributors | registered asset distribution entry point |

## Reading paths

- To use Agent, begin with the [public README](../README.md), then open the
  [operator manual](manual/README.md).
- To participate or report a problem, begin with the
  [contributing guide](../CONTRIBUTING.md).
- To report a vulnerability, use the [security policy](../SECURITY.md).
- To understand data handling, retention, and process-only secrets, use the
  [privacy policy](../PRIVACY.md).
- To inspect a reference project or audit clean-room provenance, use the
  [ownership record](OWNERSHIP.md).
- To change Agent, read [AGENTS.md](../AGENTS.md), then the
  [architecture](ARCHITECTURE.md) and [engineering guide](ENGINEERING.md).
- To operate releases or diagnose repository gates, use the
  [maintenance guide](MAINTENANCE.md).
- To understand why a durable contract exists, use the
  [decision index](decisions/README.md).

## Authority rule

Every maintained topic has one canonical owner. Other documents keep only the
context their audience needs and link to that owner. The offline registry binds
the `Start here` table to exactly the registered living-document rows, in
registry order, including each visible label, destination, audience, and
authority. The completed lossless reduction is preserved in
[the migration ledger](DOCUMENTATION-MIGRATION.md), which records each migrated
topic and its canonical destination.

## Decisions

Decision records preserve history under stable numeric paths. The
[decision index](decisions/README.md) supplies current domain and status views;
the record files are not renumbered or moved to make the collection look
smaller. New records are reserved for durable contracts, as defined by
[decision 0070](decisions/0070-owned-documentation-information-architecture.md).
