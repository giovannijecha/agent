import type {
  CommitTurnResult,
  RuntimeEvent,
  StartedTurn,
  StartTurnError,
} from "@agent/runtime";
import { TOOL_ENGINE_LIMITS } from "@agent/tools";
import {
  err,
  ok,
  type EditorProjection,
  type InputProjectionSource,
  type Result,
} from "@agent/tui";

import { ChatState } from "./chat-state.js";
import type { ProviderPresentation } from "./commands.js";
import {
  SessionController,
  type SessionAction,
  type SessionUpdate,
} from "./session.js";
import {
  ToolActivityLog,
  type ToolActivitySnapshot,
} from "./tool-activity-log.js";

const MAX_NOTICE_LINES = 16;
const MAX_NOTICE_CODE_UNITS = 1_024;

export type ApplicationPhase =
  | "awaitingApproval"
  | "cancelling"
  | "generating"
  | "idle"
  | "runningTool";

export type ApplicationEffect =
  | Readonly<{ kind: "acknowledgeTurn"; turnId: number }>
  | Readonly<{ kind: "cancelTurn"; turnId: number }>
  | Readonly<{ kind: "commitTurn"; turnId: number }>
  | Readonly<{ kind: "exit" }>
  | Readonly<{
      kind: "resolveToolApproval";
      turnId: number;
      callId: string;
      approved: boolean;
    }>
  | Readonly<{ kind: "startTurn"; text: string }>;

export type ApplicationUpdate = Readonly<{
  effects: readonly ApplicationEffect[];
  redraw: boolean;
}>;

export type ApplicationErrorKind =
  | "activityInvariant"
  | "chatInvariant"
  | "invalidRuntimeEvent"
  | "invalidStartedTurn";

/** Content-free invariant failure from the single-writer application reducer. */
export class ApplicationError {
  readonly #kind: ApplicationErrorKind;

  constructor(kind: ApplicationErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ApplicationErrorKind {
    return this.#kind;
  }
}

function update(
  redraw: boolean,
  effects: readonly ApplicationEffect[] = [],
): ApplicationUpdate {
  return Object.freeze({ effects: Object.freeze([...effects]), redraw });
}

function validNotice(lines: readonly string[]): boolean {
  if (!Array.isArray(lines) || lines.length > MAX_NOTICE_LINES) {
    return false;
  }
  return lines.every(
    (line) =>
      typeof line === "string" && line.length <= MAX_NOTICE_CODE_UNITS,
  );
}

/** Sole mutable reducer for CLI editing, chat display, phase, and notices. */
export class ApplicationController implements InputProjectionSource {
  readonly #activityLog = new ToolActivityLog();
  readonly #chat = new ChatState();
  readonly #session: SessionController;
  #notice: readonly string[];
  #phase: ApplicationPhase = "idle";
  #checkpointObserved = false;
  #preparedCleanup = false;
  #preparedCheckpointed = false;
  #tool:
    | {
        readonly approvalRequired: boolean;
        readonly callId: string;
        readonly name: string;
        readonly preview: string;
        readonly risk: "execute" | "read" | "write";
        readonly turnId: number;
        decision: "approved" | "denied" | undefined;
        status: "requested" | "started";
      }
    | undefined;

  constructor(
    runtimeAvailable: boolean,
    provider?: ProviderPresentation,
  ) {
    this.#session = new SessionController(
      runtimeAvailable ? provider : undefined,
    );
    this.#notice = runtimeAvailable
      ? provider === undefined
        ? Object.freeze(["Ready. Use /help for commands."])
        : Object.freeze([
            "Ready. Use /help for commands.",
            provider.displayName + " · " + provider.model,
          ])
      : Object.freeze([
          "Ready. Use /help for commands.",
          "No model or tools are configured.",
        ]);
  }

  get phase(): ApplicationPhase {
    return this.#phase;
  }

  get notice(): readonly string[] {
    return this.#notice;
  }

  get draftLength(): number {
    return this.#session.draftLength;
  }

  get activities(): readonly ToolActivitySnapshot[] {
    return this.#activityLog.snapshots();
  }

  get activeTurnId(): number | undefined {
    return this.#chat.activeTurnId;
  }

  get hasTranscript(): boolean {
    return this.#chat.hasContent;
  }

  transcriptText(): string {
    return this.#chat.transcriptText();
  }

  project(columns: number): EditorProjection {
    return this.#session.projectEditor(columns);
  }

  /** Reduces one terminal input chunk into application effects. */
  feed(chunk: string): SessionUpdate {
    return this.#session.feed(chunk);
  }

  /** Reduces terminal EOF into the canonical exit effect. */
  end(): SessionUpdate {
    return this.#session.end();
  }

  /** Releases all display-only personal content before external cleanup waits. */
  clear(): void {
    this.#activityLog.clear();
    this.#session.clear();
    this.#chat.clear();
    this.#notice = Object.freeze([]);
    this.#phase = "idle";
    this.#checkpointObserved = false;
    this.#preparedCleanup = false;
    this.#preparedCheckpointed = false;
    this.#tool = undefined;
  }

  /** Reduces one decoded action so capability feedback can preserve ordering. */
  applySessionAction(action: SessionAction): ApplicationUpdate {
    if (action.kind === "notice") {
      this.#setNotice(action.lines);
      return update(true);
    }
    if (action.kind === "approve" || action.kind === "deny") {
      const tool = this.#tool;
      if (
        tool === undefined ||
        !tool.approvalRequired ||
        tool.decision !== undefined
      ) {
        this.#setNotice(["No tool approval is pending."]);
        return update(true);
      }
      const approved = action.kind === "approve";
      const recorded = this.#activityLog.decide(
        tool.turnId,
        tool.callId,
        approved,
      );
      if (!recorded.ok) {
        this.#setNotice(["Application activity state could not be updated."]);
        return update(true);
      }
      tool.decision = approved ? "approved" : "denied";
      this.#phase = "runningTool";
      this.#setNotice([
        approved ? "Tool approval submitted." : "Tool denial submitted.",
      ]);
      return update(true, [
        Object.freeze({
          approved,
          callId: tool.callId,
          kind: "resolveToolApproval" as const,
          turnId: tool.turnId,
        }),
      ]);
    }
    if (action.kind === "submit") {
      if (this.#chat.activeTurnId !== undefined) {
        this.#setNotice([
          "A turn is already in progress; submitted text was discarded.",
        ]);
        return update(true);
      }
      return update(true, [
        Object.freeze({ kind: "startTurn" as const, text: action.text }),
      ]);
    }
    if (action.kind === "interrupt") {
      const turnId = this.#chat.activeTurnId;
      if (turnId === undefined) {
        return update(false, [Object.freeze({ kind: "exit" as const })]);
      }
      if (this.#phase === "cancelling") {
        return update(false);
      }
      const recorded = this.#activityLog.requestCancel(turnId);
      if (!recorded.ok) {
        this.#setNotice(["Application activity state could not be updated."]);
        return update(true);
      }
      this.#phase = "cancelling";
      this.#setNotice(["Cancelling the active turn..."]);
      return update(true, [
        Object.freeze({ kind: "cancelTurn" as const, turnId }),
      ]);
    }
    return update(false, [Object.freeze({ kind: "exit" as const })]);
  }

  /** Records a successful synchronous runtime start result. */
  turnAccepted(started: StartedTurn): Result<void, ApplicationError> {
    try {
      const turnId = started.turnId;
      const user = started.user;
      const content = user.content;
      const activityTurn = this.#activityLog.beginTurn(turnId);
      if (!activityTurn.ok) {
        return err(new ApplicationError("activityInvariant"));
      }
      const begun = this.#chat.begin(turnId, content);
      if (!begun.ok) {
        this.#activityLog.clear();
        return err(new ApplicationError("invalidStartedTurn"));
      }
    } catch (_cause: unknown) {
      return err(new ApplicationError("invalidStartedTurn"));
    }
    this.#phase = "generating";
    this.#checkpointObserved = false;
    this.#setNotice(["Generating. Ctrl+C cancels the active turn."]);
    return ok(undefined);
  }

  /** Translates a content-free start rejection into bounded user status. */
  turnRejected(error: StartTurnError): void {
    let kind: StartTurnError["kind"] | undefined;
    try {
      kind = error.kind;
    } catch (_cause: unknown) {
      kind = undefined;
    }
    const line =
      kind === "busy"
        ? "A model turn is already in progress."
        : kind === "inputTooLong"
          ? "The submitted input exceeds the runtime limit."
          : kind === "conversationTooLong"
            ? "The conversation has reached its runtime limit."
            : kind === "turnIdExhausted"
              ? "The runtime turn identifier limit was reached."
              : kind === "closed"
                ? "The model runtime is closed."
                : "Blank input was not sent.";
    this.#setNotice([line]);
  }

  /** Confirms no-runtime discard without retaining or echoing submitted text. */
  noRuntime(): void {
    this.#setNotice(["No model is configured; input was not sent."]);
  }

  /** Applies one ordered runtime event and filters stale turn identities. */
  applyRuntime<E>(
    event: RuntimeEvent<E>,
  ): Result<ApplicationUpdate, ApplicationError> {
    try {
      const eventKind = event.kind;
      if (eventKind === "assistantDelta") {
        const turnId = event.turnId;
        if (turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        if (this.#tool !== undefined) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const text = event.text;
        const appended = this.#chat.append(turnId, text);
        return appended.ok
          ? ok(update(true))
          : err(new ApplicationError("chatInvariant"));
      }
      if (eventKind === "toolRequested") {
        const turnId = event.turnId;
        if (turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        const callId = event.callId;
        const name = event.name;
        const risk = event.risk;
        const approvalRequired = event.approvalRequired;
        const approvalPreview = event.approvalPreview;
        if (
          this.#tool !== undefined ||
          typeof callId !== "string" ||
          callId.length === 0 ||
          callId.length > 128 ||
          typeof name !== "string" ||
          !/^[a-z][a-z0-9_]{0,63}$/u.test(name) ||
          (risk !== "read" && risk !== "write" && risk !== "execute") ||
          typeof approvalRequired !== "boolean" ||
          approvalRequired !== (risk !== "read") ||
          typeof approvalPreview !== "string" ||
          approvalPreview.length >
            TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits ||
          /[\p{C}\p{Zl}\p{Zp}]/u.test(approvalPreview) ||
          (approvalRequired && approvalPreview.length === 0)
        ) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const recorded = this.#activityLog.request(
          turnId,
          callId,
          name,
          risk,
          approvalPreview,
          approvalRequired,
        );
        if (!recorded.ok) {
          return err(new ApplicationError("activityInvariant"));
        }
        this.#tool = {
          approvalRequired,
          callId,
          decision: approvalRequired ? undefined : "approved",
          name,
          preview: approvalPreview,
          risk,
          status: "requested",
          turnId,
        };
        this.#phase = approvalRequired ? "awaitingApproval" : "runningTool";
        this.#setNotice(
          approvalRequired
            ? [
                "A tool requires explicit approval.",
                "Use /approve or /deny; approval applies only to this call.",
              ]
            : ["Running a read-only tool."],
        );
        return ok(update(true));
      }
      if (eventKind === "toolStarted") {
        const tool = this.#tool;
        if (event.turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        if (
          tool === undefined ||
          tool.callId !== event.callId ||
          tool.name !== event.name ||
          tool.risk !== event.risk ||
          tool.status !== "requested" ||
          tool.decision !== "approved"
        ) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const recorded = this.#activityLog.start(
          event.turnId,
          event.callId,
        );
        if (!recorded.ok) {
          return err(new ApplicationError("activityInvariant"));
        }
        tool.status = "started";
        this.#phase = "runningTool";
        this.#setNotice(["Tool running. Ctrl+C cancels the active turn."]);
        return ok(update(true));
      }
      if (eventKind === "toolFinished") {
        const tool = this.#tool;
        if (event.turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        if (
          tool === undefined ||
          tool.callId !== event.callId ||
          tool.name !== event.name ||
          tool.risk !== event.risk ||
          (event.status !== "success" && event.status !== "failure") ||
          (tool.decision === "denied"
            ? tool.status !== "requested" || event.status !== "failure"
            : tool.decision !== "approved" || tool.status !== "started")
        ) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const activityOutcome =
          tool.decision === "denied"
            ? "denied"
            : event.status === "success"
              ? "succeeded"
              : "failed";
        const recorded = this.#activityLog.finish(
          event.turnId,
          event.callId,
          activityOutcome,
        );
        if (!recorded.ok) {
          return err(new ApplicationError("activityInvariant"));
        }
        const checkpointed = this.#chat.checkpoint(event.turnId);
        if (!checkpointed.ok) {
          return err(new ApplicationError("chatInvariant"));
        }
        this.#tool = undefined;
        this.#checkpointObserved = true;
        this.#phase = "generating";
        this.#setNotice([
          event.status === "success"
            ? "Tool finished. Continuing the turn."
            : "Tool did not complete successfully. Continuing the turn.",
        ]);
        return ok(update(true));
      }
      if (eventKind === "turnPrepared") {
        const turnId = event.turnId;
        if (turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        const cleanup = event.cleanup;
        if (!Array.isArray(cleanup)) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const cleanupPresent = cleanup.length > 0;
        const checkpointed = event.checkpointed;
        if (
          typeof checkpointed !== "boolean" ||
          checkpointed !== this.#checkpointObserved ||
          this.#tool !== undefined
        ) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const assistant = event.assistant;
        const content = assistant.content;
        const prepared = this.#chat.prepare(turnId, content);
        if (!prepared.ok) {
          return err(new ApplicationError("chatInvariant"));
        }
        this.#preparedCleanup = cleanupPresent;
        this.#preparedCheckpointed = checkpointed;
        this.#tool = undefined;
        return ok(
          update(false, [
            Object.freeze({
              kind: "commitTurn" as const,
              turnId,
            }),
          ]),
        );
      }
      if (eventKind !== "turnFinished") {
        return err(new ApplicationError("invalidRuntimeEvent"));
      }
      const turnId = event.turnId;
      if (turnId !== this.#chat.activeTurnId) {
        return ok(update(false));
      }
      const cleanup = event.cleanup;
      if (!Array.isArray(cleanup)) {
        return err(new ApplicationError("invalidRuntimeEvent"));
      }
      const cleanupPresent = cleanup.length > 0;
      const checkpointed = event.checkpointed;
      const outcome = event.outcome;
      const outcomeKind = outcome.kind;
      if (
        typeof checkpointed !== "boolean" ||
        checkpointed !== this.#checkpointObserved ||
        (outcomeKind !== "cancelled" && outcomeKind !== "failed") ||
        (this.#tool !== undefined && outcomeKind !== "cancelled")
      ) {
        return err(new ApplicationError("invalidRuntimeEvent"));
      }
      const resolved = checkpointed
        ? this.#chat.finishCheckpointed(
            turnId,
            outcomeKind === "cancelled"
              ? "[turn cancelled after tool activity]"
              : "[turn failed after tool activity]",
          )
        : this.#chat.discard(turnId);
      if (!resolved.ok) {
        return err(new ApplicationError("chatInvariant"));
      }
      if (this.#tool !== undefined && outcomeKind === "cancelled") {
        const cancelled = this.#activityLog.cancelActive(turnId);
        if (!cancelled.ok || !cancelled.value) {
          return err(new ApplicationError("activityInvariant"));
        }
      }
      const finishedActivities = this.#activityLog.finishTurn(turnId);
      if (!finishedActivities.ok) {
        return err(new ApplicationError("activityInvariant"));
      }
      const outcomeLine =
        outcomeKind === "cancelled"
          ? checkpointed
            ? "Turn cancelled; completed tool activity remains in conversation."
            : "Turn cancelled; no conversation changes were committed."
          : checkpointed
            ? "The turn failed; completed tool activity remains in conversation."
            : "The model turn failed; no conversation changes were committed.";
      this.#setNotice(
        cleanupPresent
          ? [outcomeLine, "The model stream also failed during cleanup."]
          : [outcomeLine],
      );
      this.#preparedCleanup = false;
      this.#preparedCheckpointed = false;
      this.#checkpointObserved = false;
      this.#tool = undefined;
      this.#phase = "idle";
      return ok(
        update(true, [
          Object.freeze({ kind: "acknowledgeTurn" as const, turnId }),
        ]),
      );
    } catch (_cause: unknown) {
      return err(new ApplicationError("invalidRuntimeEvent"));
    }
  }

  /** Publishes or discards a prepared display turn after runtime resolution. */
  turnCommitResolved(
    turnId: number,
    resolution: CommitTurnResult,
  ): Result<ApplicationUpdate, ApplicationError> {
    try {
      if (turnId !== this.#chat.activeTurnId) {
        return ok(update(false));
      }
      const resolutionKind = resolution.kind;
      if (resolutionKind !== "committed" && resolutionKind !== "cancelled") {
        return err(new ApplicationError("invalidRuntimeEvent"));
      }
      if (resolutionKind === "committed") {
        if (this.#phase === "cancelling") {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const committed = this.#chat.commit(turnId);
        if (!committed.ok) {
          return err(new ApplicationError("chatInvariant"));
        }
        this.#setNotice(
          this.#preparedCleanup
            ? ["Ready.", "The model stream reported a cleanup failure."]
            : ["Ready."],
        );
      } else {
        const resolved = this.#preparedCheckpointed
          ? this.#chat.finishCheckpointed(
              turnId,
              "[turn cancelled after tool activity]",
            )
          : this.#chat.discard(turnId);
        if (!resolved.ok) {
          return err(new ApplicationError("chatInvariant"));
        }
        this.#setNotice(
          this.#preparedCheckpointed
            ? this.#preparedCleanup
              ? [
                  "Turn cancelled; completed tool activity remains in conversation.",
                  "The model stream also failed during cleanup.",
                ]
              : [
                  "Turn cancelled; completed tool activity remains in conversation.",
                ]
            : this.#preparedCleanup
            ? [
                "Turn cancelled; no conversation changes were committed.",
                "The model stream also failed during cleanup.",
              ]
            : ["Turn cancelled; no conversation changes were committed."],
        );
      }
      const finishedActivities = this.#activityLog.finishTurn(turnId);
      if (!finishedActivities.ok) {
        return err(new ApplicationError("activityInvariant"));
      }
      this.#preparedCleanup = false;
      this.#preparedCheckpointed = false;
      this.#checkpointObserved = false;
      this.#tool = undefined;
      this.#phase = "idle";
      return ok(update(true));
    } catch (_cause: unknown) {
      return err(new ApplicationError("invalidRuntimeEvent"));
    }
  }

  #setNotice(lines: readonly string[]): void {
    this.#notice = validNotice(lines)
      ? Object.freeze([...lines])
      : Object.freeze(["Application status was rejected by its safety limit."]);
  }
}
