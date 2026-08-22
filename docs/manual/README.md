# Agent operator manual

This manual describes the product that exists today. Start with installation,
then open the chapter matching the task.

1. [Running Agent](01-running-agent.md)
2. [Turn lifecycle](02-turn-lifecycle.md)
3. [Terminal interface](03-terminal-interface.md)
4. [Tools and permissions](04-tools-and-approval.md)
5. [Providers and authentication](05-providers-and-authentication.md)
6. [Verification and diagnostics](06-verification-and-diagnostics.md)

Agent has one controller and one active model loop. It starts without a provider
or model, keeps selections and permissions process-only, and persists only
provider-specific credentials plus bounded settled session journals. Ollama
Cloud is the sole active runtime provider; OpenAI authentication exists but its
provider runtime remains inactive.

The launch directory is the immutable workspace for every built-in tool. An
approved shell command retains the launching user’s host authority. Review
[Privacy](../../PRIVACY.md) and [Security](../../SECURITY.md) before using Agent
with sensitive work.

Implementation boundaries live in [Architecture](../ARCHITECTURE.md), while
repository development and maintenance live in [Engineering](../ENGINEERING.md).
