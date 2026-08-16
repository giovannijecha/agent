import type { Message } from "@agent/core";
import type { ToolPrepareErrorKind, ToolRisk } from "@agent/tools";

export type StartTurnErrorKind =
  | "busy"
  | "closed"
  | "conversationTooLong"
  | "emptyInput"
  | "inputTooLong"
  | "turnIdExhausted";

/** Content-free reason why a turn could not start. */
export type StartTurnError = Readonly<{ kind: StartTurnErrorKind }>;

/** Accepted local turn that is not yet committed conversation state. */
export type StartedTurn = Readonly<{ turnId: number; user: Message }>;

export type RuntimeCommandErrorKind =
  | "closed"
  | "conversationTooLong"
  | "idle"
  | "notFinished"
  | "notAwaitingPermission"
  | "notPrepared"
  | "staleTurn";

/** Content-free rejection of a runtime lifecycle command. */
export type RuntimeCommandError = Readonly<{ kind: RuntimeCommandErrorKind }>;

export type RuntimeSourceErrorKind =
  | "awaitingAcknowledge"
  | "awaitingCommit"
  | "awaitingPermission"
  | "closed"
  | "concurrentRead"
  | "idle";

/** Misuse of the single-reader runtime event source. */
export type RuntimeSourceError = Readonly<{ kind: RuntimeSourceErrorKind }>;

export type TurnFailure<E> =
  | Readonly<{ kind: "emptyDelta" }>
  | Readonly<{ kind: "emptyResponse" }>
  | Readonly<{ kind: "eventLimit" }>
  | Readonly<{ kind: "invalidModelResult"; operation: "open" | "read" }>
  | Readonly<{ kind: "invalidModelStream" }>
  | Readonly<{ kind: "invalidModelEvent" }>
  | Readonly<{
      kind: "invalidToolCall";
      reason: ToolPrepareErrorKind;
    }>
  | Readonly<{ kind: "toolEngine" }>
  | Readonly<{ kind: "toolLimit" }>
  | Readonly<{ kind: "toolUnavailable" }>
  | Readonly<{ kind: "model"; operation: "open" | "read"; error: E }>
  | Readonly<{ kind: "responseTooLong" }>
  | Readonly<{ kind: "unexpected"; operation: "open" | "read" }>;

/** Failure observed while releasing a model stream. */
export type RuntimeCleanupFailure<E> =
  | Readonly<{ kind: "invalidModelResult" }>
  | Readonly<{ kind: "model"; error: E }>
  | Readonly<{ kind: "unexpected" }>;

export type TurnOutcome<E> =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; failure: TurnFailure<E> }>;

/** Authoritative result of resolving one prepared successful turn. */
export type CommitTurnResult =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "committed" }>;

/** Ordered runtime event consumed by the application reducer. */
export type RuntimeEvent<E> =
  | Readonly<{ kind: "assistantDelta"; turnId: number; text: string }>
  | Readonly<{
      kind: "toolRequested";
      turnId: number;
      callId: string;
      name: string;
      risk: ToolRisk;
      approvalRequired: boolean;
      approvalPreview: string;
    }>
  | Readonly<{
      kind: "toolStarted";
      turnId: number;
      callId: string;
      name: string;
      risk: ToolRisk;
    }>
  | Readonly<{
      kind: "toolFinished";
      turnId: number;
      callId: string;
      name: string;
      risk: ToolRisk;
      status: "failure" | "success";
    }>
  | Readonly<{
      kind: "turnPrepared";
      turnId: number;
      assistant: Message;
      cleanup: readonly RuntimeCleanupFailure<E>[];
      checkpointed: boolean;
    }>
  | Readonly<{
      kind: "turnFinished";
      turnId: number;
      outcome: TurnOutcome<E>;
      cleanup: readonly RuntimeCleanupFailure<E>[];
      checkpointed: boolean;
    }>;

/** Independently observable cleanup failures returned during runtime stop. */
export type RuntimeStopError<E> = Readonly<{
  failures: readonly RuntimeCleanupFailure<E>[];
}>;
