import type {
  CommitTurnResult,
  RuntimeEvent,
  StartedTurn,
  StartTurnError,
  TurnFailure,
} from "@agent/runtime";
import { TOOL_ENGINE_LIMITS } from "@agent/tools";
import {
  err,
  ok,
  type EditorAreaProjection,
  type EditorProjection,
  type InputAreaProjectionSource,
  type InputProjectionSource,
  type Result,
  ScrollState,
  type TextSelection,
  TUI_LIMITS,
} from "@agent/tui";

import { ChatState, type TranscriptEntry } from "./chat-state.js";
import type { ProviderPresentation } from "./commands.js";
import {
  createNoticeToken,
  type NoticeLevel,
  type NoticePlacement,
  type NoticeToken,
} from "./notice.js";
import {
  SessionController,
  type CommandCompletionProjection,
  type SessionAction,
} from "./session.js";
import {
  ToolActivityLog,
  type ToolActivitySnapshot,
} from "./tool-activity-log.js";
import {
  type PointerProjection,
  TerminalInteraction,
} from "./terminal-interaction.js";

export type { PointerProjection } from "./terminal-interaction.js";

const MAX_NOTICE_LINES = 16;
const MAX_NOTICE_CODE_UNITS = 1_024;

export type ApplicationPhase =
  | "awaitingApproval"
  | "cancelling"
  | "generating"
  | "idle"
  | "runningTool";

export type ClipboardSettlement = "copied" | "failed" | "requested";

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
  | "invalidStartedTurn"
  | "scrollInvariant";

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

function turnFailureCode<E>(failure: TurnFailure<E>): string {
  const kind = failure.kind;
  if (kind === "model") {
    return "model/" + failure.operation;
  }
  if (kind === "invalidModelResult") {
    return "model/" + failure.operation + "/invalid-result";
  }
  if (kind === "unexpected") {
    return "model/" + failure.operation + "/unexpected";
  }
  if (kind === "invalidModelStream") {
    return "model/open/invalid-stream";
  }
  if (kind === "invalidModelEvent") {
    return "model/read/invalid-event";
  }
  if (kind === "invalidToolCall") {
    return "tool/invalid-call";
  }
  if (kind === "toolEngine") {
    return "tool/engine";
  }
  if (kind === "toolLimit") {
    return "tool/limit";
  }
  if (kind === "toolUnavailable") {
    return "tool/unavailable";
  }
  if (kind === "emptyDelta") {
    return "model/empty-delta";
  }
  if (kind === "emptyResponse") {
    return "model/empty-response";
  }
  if (kind === "eventLimit") {
    return "model/event-limit";
  }
  if (kind === "responseTooLong") {
    return "model/response-limit";
  }
  return "runtime/failure";
}

/** Sole mutable reducer for CLI editing, chat display, phase, and notices. */
export class ApplicationController
  implements InputProjectionSource, InputAreaProjectionSource
{
  readonly #activityLog = new ToolActivityLog();
  readonly #chat = new ChatState();
  readonly #provider: ProviderPresentation | undefined;
  readonly #session: SessionController;
  readonly #terminalInteraction = new TerminalInteraction();
  readonly #workspace: string | undefined;
  #notice: readonly string[];
  #noticeLevel: NoticeLevel = "info";
  #noticePlacement: NoticePlacement = "context";
  #noticeToken: NoticeToken | undefined = undefined;
  #phase: ApplicationPhase = "idle";
  #transcriptGeometry:
    | Readonly<{ contentRows: number; viewportRows: number }>
    | undefined;
  #transcriptScroll = ScrollState.followEnd();
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
    workspace?: string,
  ) {
    this.#provider =
      runtimeAvailable && provider !== undefined
        ? Object.freeze({
            authentication: provider.authentication,
            displayName: provider.displayName,
            model: provider.model,
          })
        : undefined;
    this.#workspace = workspace;
    this.#session = new SessionController(this.#provider);
    this.#notice = Object.freeze([]);
  }

  get phase(): ApplicationPhase {
    return this.#phase;
  }

  get notice(): readonly string[] {
    return this.#notice;
  }

  get noticeLevel(): NoticeLevel {
    return this.#noticeLevel;
  }

  get noticePlacement(): NoticePlacement {
    return this.#noticePlacement;
  }

  get noticeToken(): NoticeToken | undefined {
    return this.#noticeToken;
  }

  get provider(): ProviderPresentation | undefined {
    return this.#provider;
  }

  get workspace(): string | undefined {
    return this.#workspace;
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

  get transcriptScroll(): ScrollState {
    return this.#transcriptScroll;
  }

  get transcriptSelection(): TextSelection | undefined {
    return this.#terminalInteraction.transcriptSelection;
  }

  get viewingHistory(): boolean {
    return !this.#transcriptScroll.followingEnd;
  }

  transcriptText(): string {
    return this.#chat.transcriptText();
  }

  transcriptEntries(): readonly TranscriptEntry[] {
    return this.#chat.transcriptEntries();
  }

  project(columns: number): EditorProjection {
    return this.#session.projectEditor(columns);
  }

  projectArea(
    columns: number,
    maximumRows: number,
  ): EditorAreaProjection {
    return this.#session.projectEditorArea(columns, maximumRows);
  }

  projectCommandCompletion(): CommandCompletionProjection | undefined {
    return this.#session.projectCommandCompletion();
  }

  /** Reduces one terminal input chunk in exact decoder order. */
  feed(
    chunk: string,
    timeMilliseconds = 0,
    pointerProjection?: PointerProjection,
  ): ApplicationUpdate {
    const effects: ApplicationEffect[] = [];
    let exitEmitted = false;
    let redraw = false;
    const appendEffects = (next: readonly ApplicationEffect[]): void => {
      for (const effect of next) {
        if (effect.kind === "exit") {
          if (exitEmitted) {
            continue;
          }
          exitEmitted = true;
        }
        effects.push(effect);
      }
    };
    const session = this.#session.feed(chunk, timeMilliseconds, {
      apply: (action) => {
        const applied = this.applySessionAction(action, pointerProjection);
        redraw = redraw || applied.redraw;
        appendEffects(applied.effects);
      },
      editorRedrawn: () => {
        if (this.#notice.length > 0) {
          this.#setNotice([]);
        }
        redraw = true;
      },
    });
    return update(redraw || session.redraw, effects);
  }

  /** Returns and clears one bounded clipboard request after serialized input. */
  takePendingCopy(): string | undefined {
    return this.#terminalInteraction.takePendingCopy();
  }

  /** Presents one truthful clipboard outcome at the composer edge. */
  clipboardSettled(settlement: ClipboardSettlement): ApplicationUpdate {
    if (settlement === "copied") {
      this.#setNotice(["Copied!"], "info", "composer");
    } else if (settlement === "requested") {
      this.#setNotice(["Copy requested!"], "info", "composer");
    } else {
      this.#setNotice(["Copy failed!"], "warning", "composer");
    }
    return update(true);
  }

  /** Clears geometry-dependent interaction state after terminal resize. */
  resize(): void {
    this.#terminalInteraction.reset();
    this.#session.clearEditorSelection();
  }

  /** Reduces terminal EOF into the canonical exit effect. */
  end(): ApplicationUpdate {
    const effects: ApplicationEffect[] = [];
    let redraw = false;
    for (const action of this.#session.end().actions) {
      const applied = this.applySessionAction(action);
      redraw = redraw || applied.redraw;
      effects.push(...applied.effects);
    }
    return update(redraw, effects);
  }

  /** Reconciles application-owned scroll state with one planned transcript slot. */
  observeTranscriptGeometry(
    contentRows: number,
    viewportRows: number,
  ): Result<void, ApplicationError> {
    if (
      !Number.isSafeInteger(contentRows) ||
      contentRows < 0 ||
      contentRows > TUI_LIMITS.frameRows ||
      !Number.isSafeInteger(viewportRows) ||
      viewportRows < 0 ||
      viewportRows > TUI_LIMITS.frameRows
    ) {
      return err(new ApplicationError("scrollInvariant"));
    }
    if (viewportRows === 0) {
      this.#transcriptGeometry = undefined;
      return ok(undefined);
    }
    const reconciled = this.#transcriptScroll.reconcile(
      contentRows,
      viewportRows,
    );
    if (!reconciled.ok) {
      return err(new ApplicationError("scrollInvariant"));
    }
    this.#transcriptScroll = reconciled.value;
    this.#transcriptGeometry = Object.freeze({ contentRows, viewportRows });
    return ok(undefined);
  }

  /** Releases all display-only personal content before external cleanup waits. */
  clear(): void {
    this.#activityLog.clear();
    this.#session.clear();
    this.#chat.clear();
    this.#notice = Object.freeze([]);
    this.#noticeLevel = "info";
    this.#noticePlacement = "context";
    this.#noticeToken = undefined;
    this.#phase = "idle";
    this.#transcriptGeometry = undefined;
    this.#transcriptScroll = ScrollState.followEnd();
    this.#terminalInteraction.reset();
    this.#checkpointObserved = false;
    this.#preparedCleanup = false;
    this.#preparedCheckpointed = false;
    this.#tool = undefined;
  }

  /** Reduces one decoded action so capability feedback can preserve ordering. */
  applySessionAction(
    action: SessionAction,
    pointerProjection?: PointerProjection,
  ): ApplicationUpdate {
    if (action.kind === "pointer") {
      if (pointerProjection === undefined) {
        return update(false);
      }
      const interaction = this.#terminalInteraction.apply(
        action.event,
        action.timeMilliseconds,
        pointerProjection,
        this.#chat.transcriptEntries(),
        this.#session,
      );
      let redraw = interaction.redraw;
      if (interaction.composerInteraction && this.#notice.length > 0) {
        this.#setNotice([]);
        redraw = true;
      }
      if (interaction.notice !== undefined) {
        this.#setNotice(interaction.notice);
        redraw = true;
      }
      if (interaction.scrollDelta !== undefined) {
        const moved = this.#moveTranscript(interaction.scrollDelta);
        return update(redraw || moved.redraw, moved.effects);
      }
      return update(redraw);
    }
    this.#terminalInteraction.breakSequence();
    if (action.kind === "interactionBreak") {
      return update(false);
    }
    if (action.kind === "notice") {
      this.#setNotice(action.lines, action.level);
      return update(true);
    }
    if (action.kind === "navigateTranscript") {
      const geometry = this.#transcriptGeometry;
      if (geometry === undefined) {
        return update(false);
      }
      const pageRows = Math.max(1, geometry.viewportRows - 1);
      const delta =
        action.movement === "lineUp"
          ? -1
          : action.movement === "lineDown"
            ? 1
            : action.movement === "pageUp"
              ? -pageRows
              : pageRows;
      return this.#moveTranscript(delta);
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
      this.#setNotice([]);
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
      this.#setNotice([]);
      return update(true, [
        Object.freeze({ kind: "cancelTurn" as const, turnId }),
      ]);
    }
    return update(false, [Object.freeze({ kind: "exit" as const })]);
  }

  /** Clears only the notice generation named by one serialized expiry event. */
  expireNotice(token: NoticeToken): ApplicationUpdate {
    if (token !== this.#noticeToken) {
      return update(false);
    }
    this.#setNotice([]);
    return update(true);
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
    this.#transcriptGeometry = undefined;
    this.#transcriptScroll = ScrollState.followEnd();
    this.#terminalInteraction.reset();
    this.#checkpointObserved = false;
    this.#setNotice([]);
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
        this.#setNotice([]);
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
        this.#setNotice([]);
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
        this.#setNotice([]);
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
            : "The model turn failed (" +
              turnFailureCode(outcome.failure) +
              "); no conversation changes were committed.";
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
            ? ["The model stream reported a cleanup failure."]
            : [],
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

  #setNotice(
    lines: readonly string[],
    level: NoticeLevel = "warning",
    placement: NoticePlacement = "context",
  ): void {
    if (validNotice(lines)) {
      this.#notice = Object.freeze([...lines]);
      this.#noticeLevel = level;
      this.#noticePlacement = placement;
    } else {
      this.#notice = Object.freeze([
        "Application status was rejected by its safety limit.",
      ]);
      this.#noticeLevel = "warning";
      this.#noticePlacement = "context";
    }
    this.#noticeToken = this.#notice.length > 0
      ? createNoticeToken()
      : undefined;
  }

  #moveTranscript(delta: number): ApplicationUpdate {
    const geometry = this.#transcriptGeometry;
    if (geometry === undefined) {
      return update(false);
    }
    const moved = this.#transcriptScroll.move(
      delta,
      geometry.contentRows,
      geometry.viewportRows,
    );
    if (!moved.ok) {
      this.#setNotice(["Transcript navigation state could not be updated."]);
      return update(true);
    }
    const changed =
      moved.value.offset !== this.#transcriptScroll.offset ||
      moved.value.followingEnd !== this.#transcriptScroll.followingEnd;
    this.#transcriptScroll = moved.value;
    return update(changed);
  }
}
