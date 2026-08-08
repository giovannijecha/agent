import type { Result } from "@agent/core";

import type {
  CommitTurnResult,
  RuntimeCommandError,
  RuntimeEvent,
  RuntimeSourceError,
  RuntimeStopError,
  StartedTurn,
  StartTurnError,
} from "./events.js";

/** Adapter-neutral application capability for one owned runtime session. */
export interface RuntimeSession<E> {
  /** Starts one prospective turn synchronously without committing it. */
  startTurn(input: string): Result<StartedTurn, StartTurnError>;
  /** Requests cancellation for the exact active turn idempotently. */
  requestCancel(turnId: number): Result<boolean, RuntimeCommandError>;
  /** Resolves the exact pending tool request without caching approval. */
  resolveToolApproval(
    turnId: number,
    callId: string,
    approved: boolean,
  ): Result<void, RuntimeCommandError>;
  /** Commits a prepared pair, or discards it when cancellation won ordering. */
  commitTurn(turnId: number): Result<CommitTurnResult, RuntimeCommandError>;
  /** Acknowledges one delivered terminal failure or cancellation outcome. */
  acknowledgeTurn(turnId: number): Result<void, RuntimeCommandError>;
  /** Pulls one ordered delta or terminal event with one-reader semantics. */
  nextEvent(): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>>;
  /** Cancels and releases all active work idempotently. */
  stop(): Promise<Result<void, RuntimeStopError<E>>>;
}
