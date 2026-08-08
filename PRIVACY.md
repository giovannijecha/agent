# Privacy policy

## Current product

`agent` is local-first software maintained by Giovanni Jecha. It has no project
cloud service, analytics, advertising, crash-reporting endpoint, or telemetry.
The current production executable injects no model, authenticates no provider,
and persists no chat session.

Without a configured runtime, submitted text is discarded after a generic
notice. It is not added to conversation state, displayed in the transcript,
written to disk, or sent over a network.

## Local tools

The five current tools operate only inside the selected workspace. They do not
use ambient network access. Read operations are automatic; each write operation
requires its own explicit approval. The terminal UI avoids placing raw prompts,
file contents, tool outputs, credentials, and foreign error causes in notices or
logs.

## Future provider connections

A future provider adapter may send prompts, bounded conversation context, and
approved tool results directly from the local process to the provider selected
by the operator. Provider processing would then be governed by that provider's
terms and privacy policy. `agent` will not proxy those requests through a
project-owned backend.

`agent` never asks for provider passwords, cookies, recovery codes, payment
details, or one-time codes. Browser authorization remains provider-hosted. The
first eligible login stores credentials only in process memory; persistent
storage requires a separate accepted design for an operating-system protected
vault.

## Future local sessions

Local session persistence is disabled. If implemented, it must be opt-in,
versioned, bounded, inspectable, removable, and documented before release. It
must not silently upload or synchronize session data.

## Removal

Closing the current process releases its in-memory conversation and display
state. Removing the workspace removes all owned source and generated artifacts;
installed toolchain software remains outside the project. Future persistence or
credential features must add exact deletion instructions here before they ship.
