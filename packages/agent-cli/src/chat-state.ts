import { CONVERSATION_TREE_LIMITS } from "@agent/core";
import { RUNTIME_LIMITS } from "@agent/runtime";
import { err, ok, type Result, TUI_LIMITS } from "@agent/tui";

const TRANSCRIPT_SEPARATOR = "\n\n";
const MAX_CHECKPOINT_MARKER_CODE_UNITS = 128;
const MAX_COMPLETED_DISPLAY_CODE_UNITS =
  CONVERSATION_TREE_LIMITS.codeUnits +
  CONVERSATION_TREE_LIMITS.turns *
    (MAX_CHECKPOINT_MARKER_CODE_UNITS +
      RUNTIME_LIMITS.toolSteps * TRANSCRIPT_SEPARATOR.length);

export type TranscriptRole = "assistant" | "user";

export type TranscriptEntry = Readonly<{
  content: string;
  document: number;
  role: TranscriptRole;
}>;

export type TimelineEntry = Readonly<{
  childCount: number;
  depth: number;
  id: number;
  parentId: number;
  selected: boolean;
  settlement: "completed" | "checkpointed" | "root";
  user: string;
}>;

export type RestoredChatTurn = Readonly<{
  assistant: string;
  historyNodeId: number;
  historyParentNodeId: number;
  settlement: "completed" | "checkpointed";
  user: string;
}>;

export type RestoredChatState = Readonly<{
  activeNodeId: number;
  turns: readonly RestoredChatTurn[];
}>;

export type ChatStateErrorKind =
  | "activeTurn"
  | "deltaTooLong"
  | "invalidTurn"
  | "invalidHistoryNode"
  | "responseMismatch"
  | "responseTooLong"
  | "turnNotPrepared"
  | "staleTurn";

/** Content-free display-state invariant failure. */
export class ChatStateError {
  readonly #kind: ChatStateErrorKind;

  constructor(kind: ChatStateErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ChatStateErrorKind {
    return this.#kind;
  }
}

type CompletedTurn = Readonly<{
  assistant: string;
  assistantDocument: number;
  displayCodeUnits: number;
  historyNodeId: number;
  historyParentNodeId: number;
  settlement: "completed" | "checkpointed";
  user: string;
  userDocument: number;
}>;

type ActiveTurn = {
  readonly assistantDocument: number;
  readonly chunks: string[];
  readonly segments: string[];
  readonly turnId: number;
  readonly historyParentNodeId: number;
  readonly user: string;
  readonly userDocument: number;
  preparedAssistant: string | undefined;
  responseCodeUnits: number;
};

function entry(
  document: number,
  role: TranscriptRole,
  content: string,
): TranscriptEntry {
  return Object.freeze({ content, document, role });
}

function turnEntries(
  userDocument: number,
  assistantDocument: number,
  user: string,
  assistant: string,
): readonly TranscriptEntry[] {
  const entries: TranscriptEntry[] = [entry(userDocument, "user", user)];
  if (assistant.length > 0) {
    entries.push(entry(assistantDocument, "assistant", assistant));
  }
  return Object.freeze(entries);
}

function tail(text: string, codeUnits: number): string {
  return codeUnits === 0 ? "" : text.slice(-codeUnits);
}

function clippedTurnEntries(
  userDocument: number,
  assistantDocument: number,
  user: string,
  assistant: string,
): readonly TranscriptEntry[] {
  const fixedCodeUnits =
    assistant.length > 0 ? TRANSCRIPT_SEPARATOR.length : 0;
  const contentCodeUnits = Math.max(
    0,
    TUI_LIMITS.displayTextCodeUnits - fixedCodeUnits,
  );
  const retainedUser = tail(user, Math.min(user.length, contentCodeUnits));
  const retainedAssistant = tail(
    assistant,
    contentCodeUnits - retainedUser.length,
  );
  return turnEntries(
    userDocument,
    assistantDocument,
    retainedUser,
    retainedAssistant,
  );
}

function entryCodeUnits(entries: readonly TranscriptEntry[]): number {
  return (
    entries.reduce((total, item) => total + item.content.length, 0) +
    Math.max(0, entries.length - 1) * TRANSCRIPT_SEPARATOR.length
  );
}

function inputTooLong(text: string): boolean {
  let count = 0;
  for (const _character of text) {
    count += 1;
    if (count > RUNTIME_LIMITS.inputCodePoints) {
      return true;
    }
  }
  return false;
}

/** Bounded display-only transcript, independent from runtime conversation state. */
export class ChatState {
  readonly #completed: CompletedTurn[] = [];
  #active: ActiveTurn | undefined;
  #completedDisplayCodeUnits = 0;
  #historyNodeId = 0;
  #nextDocument = 0;

  get activeTurnId(): number | undefined {
    return this.#active?.turnId;
  }

  get hasContent(): boolean {
    return this.#historyNodeId !== 0 || this.#active !== undefined;
  }

  /** Restores one validated display projection before interactive ownership. */
  restore(snapshot: RestoredChatState): Result<void, ChatStateError> {
    if (
      this.#active !== undefined ||
      this.#completed.length !== 0 ||
      snapshot === null ||
      typeof snapshot !== "object" ||
      !Array.isArray(snapshot.turns) ||
      snapshot.turns.length > CONVERSATION_TREE_LIMITS.turns ||
      !Number.isSafeInteger(snapshot.activeNodeId) ||
      snapshot.activeNodeId < 0
    ) {
      return err(new ChatStateError("invalidHistoryNode"));
    }
    const completed: CompletedTurn[] = [];
    let displayCodeUnits = 0;
    for (let index = 0; index < snapshot.turns.length; index += 1) {
      const turn = snapshot.turns.at(index);
      const historyNodeId = index + 1;
      if (
        turn === undefined ||
        turn.historyNodeId !== historyNodeId ||
        !Number.isSafeInteger(turn.historyParentNodeId) ||
        turn.historyParentNodeId < 0 ||
        turn.historyParentNodeId >= historyNodeId ||
        (turn.settlement !== "completed" &&
          turn.settlement !== "checkpointed") ||
        typeof turn.user !== "string" ||
        turn.user.trim().length === 0 ||
        inputTooLong(turn.user) ||
        typeof turn.assistant !== "string" ||
        turn.assistant.trim().length === 0
      ) {
        return err(new ChatStateError("invalidHistoryNode"));
      }
      const turnCodeUnits = turn.user.length + turn.assistant.length;
      displayCodeUnits += turnCodeUnits;
      if (displayCodeUnits > MAX_COMPLETED_DISPLAY_CODE_UNITS) {
        return err(new ChatStateError("invalidHistoryNode"));
      }
      completed.push(
        Object.freeze({
          assistant: turn.assistant,
          assistantDocument: index * 2 + 1,
          displayCodeUnits: turnCodeUnits,
          historyNodeId,
          historyParentNodeId: turn.historyParentNodeId,
          settlement: turn.settlement,
          user: turn.user,
          userDocument: index * 2,
        }),
      );
    }
    if (
      snapshot.activeNodeId !== 0 &&
      completed.at(snapshot.activeNodeId - 1)?.historyNodeId !==
        snapshot.activeNodeId
    ) {
      return err(new ChatStateError("invalidHistoryNode"));
    }
    this.#completed.push(...completed);
    this.#completedDisplayCodeUnits = displayCodeUnits;
    this.#historyNodeId = snapshot.activeNodeId;
    this.#nextDocument = completed.length * 2;
    return ok(undefined);
  }

  /** Returns one immutable settled display turn for durable projection. */
  settledTurn(nodeId: number): RestoredChatTurn | undefined {
    const turn = this.#completed.at(nodeId - 1);
    return turn?.historyNodeId === nodeId
      ? Object.freeze({
          assistant: turn.assistant,
          historyNodeId: turn.historyNodeId,
          historyParentNodeId: turn.historyParentNodeId,
          settlement: turn.settlement,
          user: turn.user,
        })
      : undefined;
  }

  /** Starts one prospective display turn without publishing it to history. */
  begin(
    turnId: number,
    user: string,
    historyParentNodeId: number,
  ): Result<void, ChatStateError> {
    if (this.#active !== undefined) {
      return err(new ChatStateError("activeTurn"));
    }
    if (
      !Number.isSafeInteger(turnId) ||
      turnId < 1 ||
      typeof user !== "string" ||
      user.trim().length === 0 ||
      inputTooLong(user) ||
      !Number.isSafeInteger(historyParentNodeId) ||
      historyParentNodeId < 0 ||
      historyParentNodeId !== this.#historyNodeId ||
      (historyParentNodeId !== 0 &&
        !this.#completed.some(
          (turn) => turn.historyNodeId === historyParentNodeId,
        )) ||
      this.#nextDocument > Number.MAX_SAFE_INTEGER - 2
    ) {
      return err(new ChatStateError("invalidTurn"));
    }
    this.#active = {
      assistantDocument: this.#nextDocument + 1,
      chunks: [],
      historyParentNodeId,
      segments: [],
      preparedAssistant: undefined,
      responseCodeUnits: 0,
      turnId,
      user,
      userDocument: this.#nextDocument,
    };
    this.#nextDocument += 2;
    return ok(undefined);
  }

  /** Marks the current assistant segment as conversation-backed tool context. */
  checkpoint(turnId: number): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    if (active.preparedAssistant !== undefined) {
      return err(new ChatStateError("turnNotPrepared"));
    }
    const segment = active.chunks.join("");
    active.chunks.splice(0);
    active.responseCodeUnits = 0;
    if (segment.trim().length > 0) {
      active.segments.push(segment);
    }
    return ok(undefined);
  }

  /** Appends one validated prospective assistant chunk. */
  append(turnId: number, text: string): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    if (active.preparedAssistant !== undefined) {
      return err(new ChatStateError("turnNotPrepared"));
    }
    if (typeof text !== "string" || text.length < 1) {
      return err(new ChatStateError("deltaTooLong"));
    }
    if (text.length > RUNTIME_LIMITS.deltaCodeUnits) {
      return err(new ChatStateError("deltaTooLong"));
    }
    active.responseCodeUnits += text.length;
    if (active.responseCodeUnits > RUNTIME_LIMITS.responseCodeUnits) {
      active.responseCodeUnits -= text.length;
      return err(new ChatStateError("responseTooLong"));
    }
    active.chunks.push(text);
    return ok(undefined);
  }

  /** Stages one completed response only when it exactly matches streamed text. */
  prepare(turnId: number, assistant: string): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    if (
      typeof assistant !== "string" ||
      assistant.trim().length === 0 ||
      assistant.length > RUNTIME_LIMITS.responseCodeUnits
    ) {
      return err(new ChatStateError("responseTooLong"));
    }
    const streamed = active.chunks.join("");
    if (streamed !== assistant) {
      active.chunks.splice(0);
      this.#active = undefined;
      return err(new ChatStateError("responseMismatch"));
    }
    active.chunks.splice(0);
    active.preparedAssistant = [...active.segments, assistant].join("\n\n");
    return ok(undefined);
  }

  /** Retains display truth after a tool checkpoint but marks an incomplete turn. */
  finishCheckpointed(
    turnId: number,
    marker: string,
    historyNodeId: number,
  ): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    if (
      typeof marker !== "string" ||
      marker.length > MAX_CHECKPOINT_MARKER_CODE_UNITS ||
      marker.trim().length === 0
    ) {
      return err(new ChatStateError("invalidHistoryNode"));
    }
    const partial = active.segments
      .filter((segment) => segment.trim().length > 0)
      .join("\n\n");
    const assistant =
      partial.length === 0 ? marker : partial + "\n\n" + marker;
    return this.#publish(
      active,
      assistant,
      historyNodeId,
      "checkpointed",
    );
  }

  /** Publishes the exact pair only after the runtime acknowledges its commit. */
  commit(
    turnId: number,
    historyNodeId: number,
  ): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    const assistant = active.preparedAssistant;
    if (assistant === undefined) {
      return err(new ChatStateError("turnNotPrepared"));
    }
    return this.#publish(active, assistant, historyNodeId, "completed");
  }

  /** Selects one retained display branch after the runtime accepts it. */
  selectHistoryNode(nodeId: number): Result<void, ChatStateError> {
    if (this.#active !== undefined) {
      return err(new ChatStateError("activeTurn"));
    }
    if (
      !Number.isSafeInteger(nodeId) ||
      nodeId < 0 ||
      (nodeId !== 0 &&
        !this.#completed.some((turn) => turn.historyNodeId === nodeId))
    ) {
      return err(new ChatStateError("invalidHistoryNode"));
    }
    this.#historyNodeId = nodeId;
    return ok(undefined);
  }

  /** Discards the exact prospective turn after cancellation or failure. */
  discard(turnId: number): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    active.chunks.splice(0);
    active.segments.splice(0);
    active.preparedAssistant = undefined;
    this.#active = undefined;
    return ok(undefined);
  }

  /** Releases every completed and prospective display-only content reference. */
  clear(): void {
    const active = this.#active;
    if (active !== undefined) {
      active.chunks.splice(0);
      active.segments.splice(0);
      active.preparedAssistant = undefined;
    }
    this.#active = undefined;
    this.#completed.splice(0);
    this.#completedDisplayCodeUnits = 0;
    this.#historyNodeId = 0;
    this.#nextDocument = 0;
  }

  /** Builds isolated chronological role/content entries within the TUI bound. */
  transcriptEntries(): readonly TranscriptEntry[] {
    const newest: Array<readonly TranscriptEntry[]> = [];
    let codeUnits = 0;
    const active = this.#active;
    if (active !== undefined) {
      const assistant =
        active.preparedAssistant ??
        [...active.segments, active.chunks.join("")]
          .filter((segment) => segment.trim().length > 0)
          .join(TRANSCRIPT_SEPARATOR);
      const prospective = turnEntries(
        active.userDocument,
        active.assistantDocument,
        active.user,
        assistant,
      );
      const completeProspective = prospective
        .map((item) => item.content)
        .join(TRANSCRIPT_SEPARATOR);
      if (completeProspective.length > TUI_LIMITS.displayTextCodeUnits) {
        const clipped = clippedTurnEntries(
          active.userDocument,
          active.assistantDocument,
          active.user,
          assistant,
        );
        newest.push(clipped);
        codeUnits += entryCodeUnits(clipped);
      } else {
        newest.push(prospective);
        codeUnits += completeProspective.length;
      }
    }
    const path = this.#selectedPath();
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const turn = path.at(index);
      if (turn === undefined) {
        continue;
      }
      const entries = turnEntries(
        turn.userDocument,
        turn.assistantDocument,
        turn.user,
        turn.assistant,
      );
      const formattedLength = entryCodeUnits(entries);
      const separator = newest.length === 0 ? 0 : TRANSCRIPT_SEPARATOR.length;
      if (
        codeUnits + separator + formattedLength >
        TUI_LIMITS.displayTextCodeUnits
      ) {
        break;
      }
      newest.push(entries);
      codeUnits += separator + formattedLength;
    }
    newest.reverse();
    return Object.freeze(newest.flatMap((entries) => entries));
  }

  /** Flattens the same isolated content for plain text consumers. */
  transcriptText(): string {
    return this.transcriptEntries()
      .map((item) => item.content)
      .join(TRANSCRIPT_SEPARATOR);
  }

  /** Returns bounded insertion-ordered rows for the process-memory selector. */
  timelineEntries(): readonly TimelineEntry[] {
    const rows: TimelineEntry[] = [
      Object.freeze({
        childCount: this.#completed.filter(
          (turn) => turn.historyParentNodeId === 0,
        ).length,
        depth: 0,
        id: 0,
        parentId: 0,
        selected: this.#historyNodeId === 0,
        settlement: "root" as const,
        user: "",
      }),
    ];
    for (const turn of this.#completed) {
      rows.push(
        Object.freeze({
          childCount: this.#completed.filter(
            (candidate) =>
              candidate.historyParentNodeId === turn.historyNodeId,
          ).length,
          depth: this.#depth(turn.historyNodeId),
          id: turn.historyNodeId,
          parentId: turn.historyParentNodeId,
          selected: turn.historyNodeId === this.#historyNodeId,
          settlement: turn.settlement,
          user: turn.user,
        }),
      );
    }
    return Object.freeze(rows);
  }

  #publish(
    active: ActiveTurn,
    assistant: string,
    historyNodeId: number,
    settlement: "completed" | "checkpointed",
  ): Result<void, ChatStateError> {
    if (
      !Number.isSafeInteger(historyNodeId) ||
      historyNodeId !== this.#completed.length + 1 ||
      this.#completed.length >= CONVERSATION_TREE_LIMITS.turns ||
      this.#completedDisplayCodeUnits + active.user.length + assistant.length >
        MAX_COMPLETED_DISPLAY_CODE_UNITS
    ) {
      return err(new ChatStateError("invalidHistoryNode"));
    }
    const completed = Object.freeze({
      assistant,
      assistantDocument: active.assistantDocument,
      displayCodeUnits: active.user.length + assistant.length,
      historyNodeId,
      historyParentNodeId: active.historyParentNodeId,
      settlement,
      user: active.user,
      userDocument: active.userDocument,
    });
    active.chunks.splice(0);
    active.segments.splice(0);
    active.preparedAssistant = undefined;
    this.#active = undefined;
    this.#completed.push(completed);
    this.#completedDisplayCodeUnits += completed.displayCodeUnits;
    this.#historyNodeId = historyNodeId;
    return ok(undefined);
  }

  #selectedPath(): readonly CompletedTurn[] {
    const reversed: CompletedTurn[] = [];
    let nodeId = this.#active?.historyParentNodeId ?? this.#historyNodeId;
    while (nodeId !== 0) {
      const turn = this.#completed.find(
        (candidate) => candidate.historyNodeId === nodeId,
      );
      if (turn === undefined) {
        return Object.freeze([]);
      }
      reversed.push(turn);
      nodeId = turn.historyParentNodeId;
    }
    reversed.reverse();
    return Object.freeze(reversed);
  }

  #depth(nodeId: number): number {
    let depth = 0;
    let current = nodeId;
    while (current !== 0) {
      const turn = this.#completed.find(
        (candidate) => candidate.historyNodeId === current,
      );
      if (turn === undefined) {
        return 0;
      }
      depth += 1;
      current = turn.historyParentNodeId;
    }
    return depth;
  }
}
