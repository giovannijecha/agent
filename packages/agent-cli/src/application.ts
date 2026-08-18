import {
  RUNTIME_LIMITS,
  type CommitTurnResult,
  type RuntimeEvent,
  type StartedTurn,
  type StartTurnError,
} from "@agent/runtime";
import {
  isSafeApprovalPreview,
  TOOL_ENGINE_LIMITS,
} from "@agent/tools";
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
import {
  createNoticeToken,
  type NoticeLevel,
  type NoticePlacement,
  type NoticeToken,
} from "./notice.js";
import { isProviderId, isProviderModelId } from "./provider-identity.js";
import type {
  ProviderId,
  ProviderModelSnapshot,
  ProviderPresentation,
  ProviderSelectionSnapshot,
} from "./provider-session.js";
import type { ModelMenuProjection } from "./models-view.js";
import type { ProviderCredentialProjection } from "./provider-credential-view.js";
import type { ProviderMenuProjection } from "./providers-view.js";
import {
  SessionController,
  type CommandCompletionProjection,
  type SessionAction,
  type SessionInputContext,
} from "./session.js";
import {
  ToolActivityLog,
  type ToolActivitySnapshot,
} from "./tool-activity-log.js";
import {
  type PermissionMenuProjection,
  TOOL_DECISION_ACTIONS,
  type ToolDecisionProjection,
  ToolPermissionPolicy,
} from "./tool-permissions.js";
import {
  type PointerProjection,
  TerminalInteraction,
} from "./terminal-interaction.js";
import { projectTurnFailure } from "./turn-failure-presentation.js";

export type { PointerProjection } from "./terminal-interaction.js";

const MAX_NOTICE_LINES = 16;
const MAX_NOTICE_CODE_UNITS = 1_024;

export type ApplicationPhase =
  | "awaitingPermission"
  | "cancelling"
  | "generating"
  | "idle"
  | "runningTool";

export type ClipboardSettlement = "copied" | "failed" | "requested";

type ApplicationTool = {
  readonly callId: string;
  readonly name: string;
  readonly preview: string;
  readonly risk: "execute" | "read" | "write";
  readonly turnId: number;
  decision: "allowed" | "denied" | undefined;
  status: "requested" | "started";
};

export type ApplicationEffect =
  | Readonly<{ kind: "acknowledgeTurn"; turnId: number }>
  | Readonly<{ kind: "cancelTurn"; turnId: number }>
  | Readonly<{ kind: "commitTurn"; turnId: number }>
  | Readonly<{
      credential: string;
      id: ProviderId;
      kind: "configureProvider";
    }>
  | Readonly<{ kind: "exit" }>
  | Readonly<{ kind: "loadModels" }>
  | Readonly<{
      kind: "resolveToolPermission";
      turnId: number;
      callId: string;
      allowed: boolean;
      operatorApproved: boolean;
    }>
  | Readonly<{ kind: "selectProvider"; id: ProviderId }>
  | Readonly<{ kind: "selectModel"; id: string }>
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
  | "providerInvariant"
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

function copyProviderSnapshots(
  providers: readonly ProviderSelectionSnapshot[],
): readonly ProviderSelectionSnapshot[] | undefined {
  if (!Array.isArray(providers) || providers.length > 1) {
    return undefined;
  }
  const copied: ProviderSelectionSnapshot[] = [];
  for (const provider of providers) {
    const presentation = provider?.presentation;
    if (
      provider === null ||
      typeof provider !== "object" ||
      !isProviderId(provider.id) ||
      copied.some((entry) => entry.id === provider.id) ||
      typeof provider.configured !== "boolean" ||
      typeof provider.ready !== "boolean" ||
      typeof provider.selected !== "boolean" ||
      presentation === null ||
      typeof presentation !== "object" ||
      typeof presentation.authentication !== "string" ||
      presentation.authentication.length < 1 ||
      presentation.authentication.length > 128 ||
      typeof presentation.displayName !== "string" ||
      presentation.displayName.length < 1 ||
      presentation.displayName.length > 128 ||
      (presentation.model !== undefined &&
        !isProviderModelId(presentation.model)) ||
      provider.ready !== (presentation.model !== undefined) ||
      (provider.selected && !provider.configured) ||
      (!provider.configured && provider.ready)
    ) {
      return undefined;
    }
    copied.push(
      Object.freeze({
        configured: provider.configured,
        id: provider.id,
        presentation: Object.freeze({
          authentication: presentation.authentication,
          displayName: presentation.displayName,
          model: presentation.model,
        }),
        ready: provider.ready,
        selected: provider.selected,
      }),
    );
  }
  if (copied.filter((provider) => provider.selected).length > 1) {
    return undefined;
  }
  return Object.freeze(copied);
}

/** Sole mutable reducer for CLI editing, chat display, phase, and notices. */
export class ApplicationController
  implements InputProjectionSource, InputAreaProjectionSource
{
  readonly #activityLog = new ToolActivityLog();
  readonly #chat = new ChatState();
  #providers: readonly ProviderSelectionSnapshot[];
  readonly #permissions = new ToolPermissionPolicy();
  readonly #runtimeAvailable: boolean;
  readonly #session: SessionController;
  readonly #terminalInteraction = new TerminalInteraction();
  readonly #workspace: string | undefined;
  #notice: readonly string[];
  #noticeLevel: NoticeLevel = "info";
  #noticePlacement: NoticePlacement = "context";
  #noticeToken: NoticeToken | undefined = undefined;
  #phase: ApplicationPhase = "idle";
  #permissionSelectionIndex = 0;
  #permissionsVisible = false;
  #activeProviderIndex: number | undefined;
  #credentialProviderId: ProviderId | undefined;
  #models: readonly ProviderModelSnapshot[] = Object.freeze([]);
  #modelSelectionIndex = 0;
  #modelsVisible = false;
  #providerSelectionIndex = 0;
  #providersVisible = false;
  #transcriptGeometry:
    | Readonly<{ contentRows: number; viewportRows: number }>
    | undefined;
  #transcriptScroll = ScrollState.followEnd();
  #checkpointObserved = false;
  #preparedCleanup = false;
  #preparedCheckpointed = false;
  #tools: ApplicationTool[] = [];
  #toolDecisionIndex = 0;

  constructor(
    runtimeAvailable: boolean,
    providers: readonly ProviderSelectionSnapshot[] = [],
    workspace?: string,
  ) {
    const admitted = runtimeAvailable ? providers : [];
    const copied = copyProviderSnapshots(admitted);
    if (copied === undefined) {
      throw new ApplicationError("providerInvariant");
    }
    this.#providers = copied;
    const selectedIndex = this.#providers.findIndex(
      (provider) => provider.selected,
    );
    this.#activeProviderIndex = selectedIndex < 0 ? undefined : selectedIndex;
    this.#providerSelectionIndex = this.#activeProviderIndex ?? 0;
    this.#runtimeAvailable = runtimeAvailable;
    this.#workspace = workspace;
    this.#session = new SessionController();
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
    return this.#activeProviderIndex === undefined
      ? undefined
      : this.#providers.at(this.#activeProviderIndex)?.presentation;
  }

  get workspace(): string | undefined {
    return this.#workspace;
  }

  get draftLength(): number {
    return this.#credentialProviderId === undefined
      ? this.#session.draftLength
      : 0;
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
    return this.#credentialProviderId === undefined
      ? this.#session.projectEditor(columns)
      : Object.freeze({ caretColumn: 0, text: "" });
  }

  projectArea(
    columns: number,
    maximumRows: number,
  ): EditorAreaProjection {
    return this.#credentialProviderId === undefined
      ? this.#session.projectEditorArea(columns, maximumRows)
      : Object.freeze({
          caretColumn: 0,
          caretRow: 0,
          rows: Object.freeze([""]),
          selections: Object.freeze([
            Object.freeze({ end: 0, start: 0 }),
          ]),
        });
  }

  projectCommandCompletion(): CommandCompletionProjection | undefined {
    return this.#inputContext() === "composer"
      ? this.#session.projectCommandCompletion()
      : undefined;
  }

  projectPermissionMenu(): PermissionMenuProjection | undefined {
    if (!this.#permissionsVisible || this.#phase === "awaitingPermission") {
      return undefined;
    }
    return Object.freeze({
      items: this.#permissions.snapshots(),
      selectedIndex: this.#permissionSelectionIndex,
    });
  }

  projectProviderMenu(): ProviderMenuProjection | undefined {
    if (!this.#providersVisible || this.#phase !== "idle") {
      return undefined;
    }
    return Object.freeze({
      items: Object.freeze(
        this.#providers.map((provider, index) =>
          Object.freeze({
            configured: provider.configured,
            id: provider.id,
            presentation: provider.presentation,
            ready: provider.ready,
            selected: index === this.#activeProviderIndex,
          }),
        ),
      ),
      selectedIndex: this.#providerSelectionIndex,
    });
  }

  projectModelMenu(): ModelMenuProjection | undefined {
    const provider = this.#activeProviderIndex === undefined
      ? undefined
      : this.#providers.at(this.#activeProviderIndex);
    if (
      !this.#modelsVisible ||
      this.#phase !== "idle" ||
      provider === undefined ||
      this.#models.length === 0
    ) {
      return undefined;
    }
    return Object.freeze({
      items: this.#models,
      providerName: provider.presentation.displayName,
      selectedIndex: this.#modelSelectionIndex,
    });
  }

  projectProviderCredential(): ProviderCredentialProjection | undefined {
    if (this.#credentialProviderId === undefined || this.#phase !== "idle") {
      return undefined;
    }
    const provider = this.#providers.find(
      (entry) => entry.id === this.#credentialProviderId,
    );
    return provider === undefined
      ? undefined
      : Object.freeze({ providerName: provider.presentation.displayName });
  }

  projectToolDecision(): ToolDecisionProjection | undefined {
    return this.#phase === "awaitingPermission"
      ? Object.freeze({
          actions: TOOL_DECISION_ACTIONS,
          selectedIndex: this.#toolDecisionIndex,
        })
      : undefined;
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
      context: () => this.#inputContext(),
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
    this.#permissionSelectionIndex = 0;
    this.#permissions.reset();
    this.#permissionsVisible = false;
    this.#credentialProviderId = undefined;
    this.#models = Object.freeze([]);
    this.#modelSelectionIndex = 0;
    this.#modelsVisible = false;
    this.#providersVisible = false;
    this.#providerSelectionIndex = this.#activeProviderIndex ?? 0;
    this.#transcriptGeometry = undefined;
    this.#transcriptScroll = ScrollState.followEnd();
    this.#terminalInteraction.reset();
    this.#checkpointObserved = false;
    this.#preparedCleanup = false;
    this.#preparedCheckpointed = false;
    this.#tools = [];
    this.#toolDecisionIndex = 0;
  }

  /** Reduces one decoded action so capability feedback can preserve ordering. */
  applySessionAction(
    action: SessionAction,
    pointerProjection?: PointerProjection,
  ): ApplicationUpdate {
    if (action.kind === "pointer") {
      if (this.#credentialProviderId !== undefined) {
        this.#terminalInteraction.reset();
        return update(false);
      }
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
    if (action.kind === "openPermissions") {
      if (this.#phase === "awaitingPermission") {
        return update(false);
      }
      this.#permissionsVisible = true;
      this.#modelsVisible = false;
      this.#providersVisible = false;
      this.#setNotice([]);
      return update(true);
    }
    if (action.kind === "closePermissions") {
      if (!this.#permissionsVisible) {
        return update(false);
      }
      this.#permissionsVisible = false;
      return update(true);
    }
    if (action.kind === "openProviders") {
      if (this.#providers.length === 0) {
        this.#setNotice(["No providers are available."], "info");
        return update(true);
      }
      if (this.#phase !== "idle") {
        this.#setNotice([
          "Provider selection is available only while idle.",
        ]);
        return update(true);
      }
      this.#providersVisible = true;
      this.#providerSelectionIndex = this.#activeProviderIndex ?? 0;
      this.#modelsVisible = false;
      this.#permissionsVisible = false;
      this.#setNotice([]);
      return update(true);
    }
    if (action.kind === "closeProviders") {
      if (!this.#providersVisible) {
        return update(false);
      }
      this.#providersVisible = false;
      return update(true);
    }
    if (action.kind === "openModels") {
      if (this.#phase !== "idle") {
        this.#setNotice(["Model selection is available only while idle."]);
        return update(true);
      }
      const provider = this.#activeProviderIndex === undefined
        ? undefined
        : this.#providers.at(this.#activeProviderIndex);
      if (provider === undefined || !provider.configured) {
        this.#setNotice([
          "Configure and select a provider with /providers first.",
        ]);
        return update(true);
      }
      this.#permissionsVisible = false;
      this.#providersVisible = false;
      this.#modelsVisible = false;
      this.#models = Object.freeze([]);
      this.#modelSelectionIndex = 0;
      this.#setNotice([]);
      return update(true, [Object.freeze({ kind: "loadModels" as const })]);
    }
    if (action.kind === "closeModels") {
      if (!this.#modelsVisible) {
        return update(false);
      }
      this.#modelsVisible = false;
      return update(true);
    }
    if (action.kind === "cancelProviderCredential") {
      if (this.#credentialProviderId === undefined) {
        return update(false);
      }
      this.#credentialProviderId = undefined;
      this.#setNotice(["Provider configuration cancelled."], "info");
      return update(true);
    }
    if (action.kind === "submitProviderCredential") {
      const id = this.#credentialProviderId;
      this.#credentialProviderId = undefined;
      if (id === undefined) {
        return update(false);
      }
      this.#setNotice([]);
      return update(true, [
        Object.freeze({
          credential: action.credential,
          id,
          kind: "configureProvider" as const,
        }),
      ]);
    }
    if (action.kind === "moveContextSelection") {
      if (this.#phase === "awaitingPermission") {
        const next = action.direction === "previous"
          ? Math.max(0, this.#toolDecisionIndex - 1)
          : Math.min(
              TOOL_DECISION_ACTIONS.length - 1,
              this.#toolDecisionIndex + 1,
            );
        if (next === this.#toolDecisionIndex) {
          return update(false);
        }
        this.#toolDecisionIndex = next;
        return update(true);
      }
      if (this.#providersVisible) {
        const next = action.direction === "previous"
          ? Math.max(0, this.#providerSelectionIndex - 1)
          : Math.min(
              this.#providers.length - 1,
              this.#providerSelectionIndex + 1,
            );
        if (next === this.#providerSelectionIndex) {
          return update(false);
        }
        this.#providerSelectionIndex = next;
        return update(true);
      }
      if (this.#modelsVisible) {
        const next = action.direction === "previous"
          ? Math.max(0, this.#modelSelectionIndex - 1)
          : Math.min(
              this.#models.length - 1,
              this.#modelSelectionIndex + 1,
            );
        if (next === this.#modelSelectionIndex) {
          return update(false);
        }
        this.#modelSelectionIndex = next;
        return update(true);
      }
      if (!this.#permissionsVisible) {
        return update(false);
      }
      const next = action.direction === "previous"
        ? Math.max(0, this.#permissionSelectionIndex - 1)
        : Math.min(
            this.#permissions.length - 1,
            this.#permissionSelectionIndex + 1,
          );
      if (next === this.#permissionSelectionIndex) {
        return update(false);
      }
      this.#permissionSelectionIndex = next;
      return update(true);
    }
    if (action.kind === "changePermission") {
      if (!this.#permissionsVisible || this.#phase === "awaitingPermission") {
        return update(false);
      }
      const changed = this.#permissions.changeAt(
        this.#permissionSelectionIndex,
        action.direction,
      );
      if (!changed.ok) {
        this.#setNotice(["Session permissions could not be updated."]);
        return update(true);
      }
      return update(true);
    }
    if (action.kind === "activateContextSelection") {
      if (this.#providersVisible && this.#phase === "idle") {
        const selected = this.#providers.at(this.#providerSelectionIndex);
        this.#providersVisible = false;
        if (selected === undefined) {
          this.#setNotice(["Provider selection could not be updated."]);
          return update(true);
        }
        if (!selected.configured) {
          this.#credentialProviderId = selected.id;
          this.#setNotice([]);
          return update(true);
        }
        if (this.#providerSelectionIndex === this.#activeProviderIndex) {
          return update(true);
        }
        return update(true, [
          Object.freeze({
            id: selected.id,
            kind: "selectProvider" as const,
          }),
        ]);
      }
      if (this.#modelsVisible && this.#phase === "idle") {
        const selected = this.#models.at(this.#modelSelectionIndex);
        this.#modelsVisible = false;
        if (selected === undefined) {
          this.#setNotice(["Model selection could not be updated."]);
          return update(true);
        }
        return update(true, [
          Object.freeze({
            id: selected.id,
            kind: "selectModel" as const,
          }),
        ]);
      }
      const pendingTools = this.#tools.filter(
        (candidate) => candidate.decision === undefined,
      );
      const tool = pendingTools.at(0);
      const selected = TOOL_DECISION_ACTIONS.at(this.#toolDecisionIndex);
      if (
        this.#phase !== "awaitingPermission" ||
        pendingTools.length !== 1 ||
        tool === undefined ||
        tool.decision !== undefined ||
        selected === undefined
      ) {
        return update(false);
      }
      if (selected === "allowSession") {
        const changed = this.#permissions.set(tool.name, tool.risk, "allow");
        if (!changed.ok) {
          this.#setNotice(["Session permissions could not be updated."]);
          return update(true);
        }
      }
      const allowed = selected !== "deny";
      const recorded = this.#activityLog.decide(
        tool.turnId,
        tool.callId,
        allowed,
      );
      if (!recorded.ok) {
        this.#setNotice(["Application activity state could not be updated."]);
        return update(true);
      }
      tool.decision = allowed ? "allowed" : "denied";
      this.#phase = "runningTool";
      this.#setNotice([]);
      return update(true, [
        Object.freeze({
          allowed,
          callId: tool.callId,
          kind: "resolveToolPermission" as const,
          operatorApproved: allowed,
          turnId: tool.turnId,
        }),
      ]);
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
    if (action.kind === "submit") {
      if (this.#chat.activeTurnId !== undefined) {
        this.#setNotice([
          "A turn is already in progress; submitted text was discarded.",
        ]);
        return update(true);
      }
      if (this.#providers.length > 0) {
        const provider = this.#activeProviderIndex === undefined
          ? undefined
          : this.#providers.at(this.#activeProviderIndex);
        if (provider === undefined || !provider.configured) {
          this.#setNotice([
            "Configure and select a provider with /providers first.",
          ]);
          return update(true);
        }
        if (!provider.ready) {
          this.#setNotice(["Select a model with /models first."]);
          return update(true);
        }
      } else if (!this.#runtimeAvailable) {
        this.#setNotice(["No model is configured; input was not sent."]);
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
    this.#credentialProviderId = undefined;
    this.#modelsVisible = false;
    this.#providersVisible = false;
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

  /** Confirms concealed provider configuration and selection for this process. */
  providerConfigured(
    providers: readonly ProviderSelectionSnapshot[],
    id: ProviderId,
  ): Result<ApplicationUpdate, ApplicationError> {
    const accepted = this.#acceptProviders(providers, id);
    if (!accepted.ok) {
      return accepted;
    }
    const provider = this.#providers.at(this.#activeProviderIndex ?? -1);
    if (provider === undefined || !provider.configured) {
      return err(new ApplicationError("providerInvariant"));
    }
    this.#models = Object.freeze([]);
    this.#modelsVisible = false;
    this.#setNotice(
      [provider.presentation.displayName + " configured for this process."],
      "info",
    );
    return ok(update(true));
  }

  /** Confirms one CLI-owned provider selection after the router accepts it. */
  providerSelected(
    providers: readonly ProviderSelectionSnapshot[],
    id: ProviderId,
  ): Result<ApplicationUpdate, ApplicationError> {
    const accepted = this.#acceptProviders(providers, id);
    if (!accepted.ok) {
      return accepted;
    }
    const provider = this.#providers.at(this.#activeProviderIndex ?? -1);
    if (provider === undefined) {
      return err(new ApplicationError("providerInvariant"));
    }
    this.#models = Object.freeze([]);
    this.#modelsVisible = false;
    this.#setNotice(
      [provider.presentation.displayName + " selected for this process."],
      "info",
    );
    return ok(update(true));
  }

  /** Opens one bounded compatible model list returned by the active provider. */
  modelsLoaded(
    models: readonly ProviderModelSnapshot[],
  ): Result<ApplicationUpdate, ApplicationError> {
    if (
      this.#phase !== "idle" ||
      !Array.isArray(models) ||
      models.length < 1 ||
      models.length > 256
    ) {
      return err(new ApplicationError("providerInvariant"));
    }
    const copied: ProviderModelSnapshot[] = [];
    for (const model of models) {
      if (
        model === null ||
        typeof model !== "object" ||
        !isProviderModelId(model.id) ||
        copied.some((entry) => entry.id === model.id) ||
        model.cost !== "cloud" ||
        typeof model.selected !== "boolean"
      ) {
        return err(new ApplicationError("providerInvariant"));
      }
      copied.push(Object.freeze({ ...model }));
    }
    if (copied.filter((model) => model.selected).length > 1) {
      return err(new ApplicationError("providerInvariant"));
    }
    this.#models = Object.freeze(copied);
    const selected = this.#models.findIndex((model) => model.selected);
    this.#modelSelectionIndex = selected < 0 ? 0 : selected;
    this.#modelsVisible = true;
    this.#setNotice([]);
    return ok(update(true));
  }

  /** Confirms one model selection and refreshes provider readiness. */
  modelSelected(
    providers: readonly ProviderSelectionSnapshot[],
    id: string,
  ): Result<ApplicationUpdate, ApplicationError> {
    if (
      !isProviderModelId(id) ||
      !this.#models.some((model) => model.id === id)
    ) {
      return err(new ApplicationError("providerInvariant"));
    }
    const active = providers.find((provider) => provider.selected);
    if (active === undefined || active.presentation.model !== id) {
      return err(new ApplicationError("providerInvariant"));
    }
    const accepted = this.#acceptProviders(providers, active.id);
    if (!accepted.ok) {
      return accepted;
    }
    this.#models = Object.freeze(
      this.#models.map((model) =>
        Object.freeze({ ...model, selected: model.id === id }),
      ),
    );
    this.#modelsVisible = false;
    this.#setNotice([id + " selected for this process."], "info");
    return ok(update(true));
  }

  /** Reports a content-free provider or catalog failure without leaving the TUI. */
  providerOperationFailed(operation: "catalog" | "configuration" | "model"): ApplicationUpdate {
    this.#credentialProviderId = undefined;
    this.#modelsVisible = false;
    this.#models = Object.freeze([]);
    const line = operation === "catalog"
      ? "Models could not be loaded."
      : operation === "configuration"
        ? "The provider key was rejected by local validation."
        : "The model could not be selected.";
    this.#setNotice([line]);
    return update(true);
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
        if (this.#tools.length > 0) {
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
        const effectApprovalRequired = event.approvalRequired;
        const approvalPreview = event.approvalPreview;
        if (
          (this.#phase !== "generating" && this.#phase !== "runningTool") ||
          this.#tools.some((tool) => tool.callId === callId) ||
          (this.#tools.length > 0 &&
            (this.#tools.length >= RUNTIME_LIMITS.parallelReads ||
              risk !== "read" ||
              this.#tools.some(
                (tool) =>
                  tool.risk !== "read" ||
                  tool.status !== "requested" ||
                  tool.decision === undefined,
              ))) ||
          typeof callId !== "string" ||
          callId.length === 0 ||
          callId.length > 128 ||
          typeof name !== "string" ||
          !/^[a-z][a-z0-9_]{0,63}$/u.test(name) ||
          (risk !== "read" && risk !== "write" && risk !== "execute") ||
          typeof effectApprovalRequired !== "boolean" ||
          typeof approvalPreview !== "string" ||
          approvalPreview.length >
            TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits ||
          !isSafeApprovalPreview(approvalPreview) ||
          effectApprovalRequired !==
            (risk !== "read" && approvalPreview.length > 0)
        ) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const configured = this.#permissions.modeFor(name, risk);
        if (!configured.ok) {
          return err(new ApplicationError("invalidRuntimeEvent"));
        }
        const validInvocation = risk === "read" || effectApprovalRequired;
        const mode = validInvocation ? configured.value : "allow";
        const decisionRequired = mode !== "allow";
        const recorded = this.#activityLog.request(
          turnId,
          callId,
          name,
          risk,
          approvalPreview,
          effectApprovalRequired,
          decisionRequired,
        );
        if (!recorded.ok) {
          return err(new ApplicationError("activityInvariant"));
        }
        if (mode === "deny") {
          const denied = this.#activityLog.decide(turnId, callId, false);
          if (!denied.ok) {
            return err(new ApplicationError("activityInvariant"));
          }
        }
        this.#tools.push({
          callId,
          decision:
            mode === "ask" ? undefined : mode === "deny" ? "denied" : "allowed",
          name,
          preview: approvalPreview,
          risk,
          status: "requested",
          turnId,
        });
        this.#permissionsVisible = false;
        this.#modelsVisible = false;
        this.#providersVisible = false;
        this.#toolDecisionIndex = 0;
        this.#phase = mode === "ask" ? "awaitingPermission" : "runningTool";
        this.#setNotice([]);
        return ok(
          mode === "ask"
            ? update(true)
            : update(true, [
                Object.freeze({
                  allowed: mode === "allow",
                  callId,
                  kind: "resolveToolPermission" as const,
                  operatorApproved: false,
                  turnId,
                }),
              ]),
        );
      }
      if (eventKind === "toolStarted") {
        const toolIndex = this.#tools.findIndex(
          (candidate) => candidate.callId === event.callId,
        );
        const tool = toolIndex < 0 ? undefined : this.#tools.at(toolIndex);
        const earlierTools = toolIndex < 0 ? [] : this.#tools.slice(0, toolIndex);
        if (event.turnId !== this.#chat.activeTurnId) {
          return ok(update(false));
        }
        if (
          tool === undefined ||
          tool.callId !== event.callId ||
          tool.name !== event.name ||
          tool.risk !== event.risk ||
          tool.status !== "requested" ||
          tool.decision !== "allowed" ||
          this.#tools.some((candidate) => candidate.decision === undefined) ||
          earlierTools.some(
            (candidate) =>
              candidate.decision === "allowed" &&
              candidate.status === "requested",
          )
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
        const tool = this.#tools.at(0);
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
            : tool.decision !== "allowed" || tool.status !== "started")
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
        this.#tools = this.#tools.slice(1);
        this.#checkpointObserved = true;
        this.#phase = this.#tools.length > 0 ? "runningTool" : "generating";
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
          this.#tools.length > 0
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
        this.#tools = [];
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
        (this.#tools.length > 0 && outcomeKind !== "cancelled")
      ) {
        return err(new ApplicationError("invalidRuntimeEvent"));
      }
      const settlementPresentation =
        outcomeKind === "failed"
          ? projectTurnFailure(outcome.failure, checkpointed)
          : Object.freeze({
              checkpointedMarker: "[turn cancelled after tool activity]",
              notice: checkpointed
                ? "Turn cancelled; completed tool activity remains in conversation."
                : "Turn cancelled; no conversation changes were committed.",
            });
      const resolved = checkpointed
        ? this.#chat.finishCheckpointed(
            turnId,
            settlementPresentation.checkpointedMarker,
          )
        : this.#chat.discard(turnId);
      if (!resolved.ok) {
        return err(new ApplicationError("chatInvariant"));
      }
      if (this.#tools.length > 0 && outcomeKind === "cancelled") {
        const cancelled = this.#activityLog.cancelActive(turnId);
        if (!cancelled.ok || !cancelled.value) {
          return err(new ApplicationError("activityInvariant"));
        }
      }
      const finishedActivities = this.#activityLog.finishTurn(turnId);
      if (!finishedActivities.ok) {
        return err(new ApplicationError("activityInvariant"));
      }
      const outcomeLine = settlementPresentation.notice;
      this.#setNotice(
        cleanupPresent
          ? [outcomeLine, "The model stream also failed during cleanup."]
          : [outcomeLine],
      );
      this.#preparedCleanup = false;
      this.#preparedCheckpointed = false;
      this.#checkpointObserved = false;
      this.#tools = [];
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
      this.#tools = [];
      this.#phase = "idle";
      return ok(update(true));
    } catch (_cause: unknown) {
      return err(new ApplicationError("invalidRuntimeEvent"));
    }
  }

  #inputContext(): SessionInputContext {
    if (this.#phase === "awaitingPermission") {
      return "toolDecision";
    }
    if (this.#credentialProviderId !== undefined) {
      return "providerCredential";
    }
    if (this.#modelsVisible) {
      return "models";
    }
    if (this.#providersVisible) {
      return "providers";
    }
    return this.#permissionsVisible ? "permissions" : "composer";
  }

  #acceptProviders(
    providers: readonly ProviderSelectionSnapshot[],
    id: ProviderId,
  ): Result<void, ApplicationError> {
    if (this.#phase !== "idle") {
      return err(new ApplicationError("providerInvariant"));
    }
    const copied = copyProviderSnapshots(providers);
    if (copied === undefined) {
      return err(new ApplicationError("providerInvariant"));
    }
    const index = copied.findIndex(
      (provider) => provider.id === id && provider.selected,
    );
    if (index < 0) {
      return err(new ApplicationError("providerInvariant"));
    }
    this.#providers = copied;
    this.#activeProviderIndex = index;
    this.#providerSelectionIndex = index;
    this.#providersVisible = false;
    this.#credentialProviderId = undefined;
    return ok(undefined);
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
