import type { ConversationTreeTurnSnapshot, Result } from "@agent/core";

import type {
  CommitTurnResult,
  RuntimeCommandError,
  RuntimeEvent,
  RuntimeSourceError,
  RuntimeStopError,
  StartedTurn,
  StartTurnError,
  TurnOutcome,
} from "./events.js";

/** One checkpointed turn settled while stop owns runtime ordering. */
export type RuntimeStoppedTurn<E> = Readonly<{
  outcome: TurnOutcome<E>;
  turn: ConversationTreeTurnSnapshot;
}>;

/** Immutable stop result with cleanup and durable settlement kept distinct. */
export type RuntimeStopReport<E> = Readonly<{
  cleanup: Result<void, RuntimeStopError<E>>;
  settledTurn: RuntimeStoppedTurn<E> | undefined;
}>;

/** Adapter-neutral application capability for one owned runtime session. */
export interface RuntimeSession<E> {
  /** Starts one prospective turn synchronously without committing it. */
  startTurn(input: string): Result<StartedTurn, StartTurnError>;
  /** Selects one retained conversation node while no turn is active. */
  selectConversationNode(
    nodeId: number,
  ): Result<void, RuntimeCommandError>;
  /** Requests cancellation for the exact active turn idempotently. */
  requestCancel(turnId: number): Result<boolean, RuntimeCommandError>;
  /** Resolves the exact pending tool request without retaining session policy. */
  resolveToolPermission(
    turnId: number,
    callId: string,
    allowed: boolean,
  ): Result<void, RuntimeCommandError>;
  /** Commits a prepared pair, or discards it when cancellation won ordering. */
  commitTurn(turnId: number): Result<CommitTurnResult, RuntimeCommandError>;
  /** Acknowledges one delivered terminal failure or cancellation outcome. */
  acknowledgeTurn(turnId: number): Result<void, RuntimeCommandError>;
  /** Pulls one ordered delta or terminal event with one-reader semantics. */
  nextEvent(): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>>;
  /** Cancels, settles checkpointed work, and releases active resources. */
  stop(): Promise<RuntimeStopReport<E>>;
}

/** Read-only settled-history projection used only by the CLI journal owner. */
export interface RuntimeHistorySource {
  conversationTurn(
    nodeId: number,
  ): Result<ConversationTreeTurnSnapshot, RuntimeCommandError>;
}
