import { RUNTIME_LIMITS } from "@agent/runtime";
import { err, ok, type Result, TUI_LIMITS } from "@agent/tui";

const MAX_COMPLETED_TURNS = 128;
const MAX_COMPLETED_CODE_UNITS = 1_048_576;
const TRANSCRIPT_SEPARATOR = "\n\n";

export type TranscriptRole = "assistant" | "user";

export type TranscriptEntry = Readonly<{
  content: string;
  role: TranscriptRole;
}>;

export type ChatStateErrorKind =
  | "activeTurn"
  | "deltaTooLong"
  | "invalidTurn"
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
  codeUnits: number;
  user: string;
}>;

type ActiveTurn = {
  readonly chunks: string[];
  readonly segments: string[];
  readonly turnId: number;
  readonly user: string;
  preparedAssistant: string | undefined;
  responseCodeUnits: number;
};

function entry(role: TranscriptRole, content: string): TranscriptEntry {
  return Object.freeze({ content, role });
}

function turnEntries(
  user: string,
  assistant: string,
): readonly TranscriptEntry[] {
  const entries: TranscriptEntry[] = [entry("user", user)];
  if (assistant.length > 0) {
    entries.push(entry("assistant", assistant));
  }
  return Object.freeze(entries);
}

function tail(text: string, codeUnits: number): string {
  return codeUnits === 0 ? "" : text.slice(-codeUnits);
}

function clippedTurnEntries(
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
  return turnEntries(retainedUser, retainedAssistant);
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
  #completedCodeUnits = 0;

  get activeTurnId(): number | undefined {
    return this.#active?.turnId;
  }

  get hasContent(): boolean {
    return this.#completed.length > 0 || this.#active !== undefined;
  }

  /** Starts one prospective display turn without publishing it to history. */
  begin(turnId: number, user: string): Result<void, ChatStateError> {
    if (this.#active !== undefined) {
      return err(new ChatStateError("activeTurn"));
    }
    if (
      !Number.isSafeInteger(turnId) ||
      turnId < 1 ||
      typeof user !== "string" ||
      user.trim().length === 0 ||
      inputTooLong(user)
    ) {
      return err(new ChatStateError("invalidTurn"));
    }
    this.#active = {
      chunks: [],
      segments: [],
      preparedAssistant: undefined,
      responseCodeUnits: 0,
      turnId,
      user,
    };
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
  ): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    const partial = active.segments
      .filter((segment) => segment.trim().length > 0)
      .join("\n\n");
    const assistant =
      partial.length === 0 ? marker : partial + "\n\n" + marker;
    this.#publish(active, assistant);
    return ok(undefined);
  }

  /** Publishes the exact pair only after the runtime acknowledges its commit. */
  commit(turnId: number): Result<void, ChatStateError> {
    const active = this.#active;
    if (active === undefined || active.turnId !== turnId) {
      return err(new ChatStateError("staleTurn"));
    }
    const assistant = active.preparedAssistant;
    if (assistant === undefined) {
      return err(new ChatStateError("turnNotPrepared"));
    }
    const completed = Object.freeze({
      assistant,
      codeUnits: active.user.length + assistant.length,
      user: active.user,
    });
    this.#active = undefined;
    this.#completed.push(completed);
    this.#completedCodeUnits += completed.codeUnits;
    this.#evictCompleted();
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
    this.#completedCodeUnits = 0;
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
        active.user,
        assistant,
      );
      const completeProspective = prospective
        .map((item) => item.content)
        .join(TRANSCRIPT_SEPARATOR);
      if (completeProspective.length > TUI_LIMITS.displayTextCodeUnits) {
        const clipped = clippedTurnEntries(active.user, assistant);
        newest.push(clipped);
        codeUnits += entryCodeUnits(clipped);
      } else {
        newest.push(prospective);
        codeUnits += completeProspective.length;
      }
    }
    for (let index = this.#completed.length - 1; index >= 0; index -= 1) {
      const turn = this.#completed.at(index);
      if (turn === undefined) {
        continue;
      }
      const entries = turnEntries(turn.user, turn.assistant);
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

  #evictCompleted(): void {
    while (
      this.#completed.length > MAX_COMPLETED_TURNS ||
      this.#completedCodeUnits > MAX_COMPLETED_CODE_UNITS
    ) {
      const removed = this.#completed.shift();
      if (removed === undefined) {
        this.#completedCodeUnits = 0;
        return;
      }
      this.#completedCodeUnits -= removed.codeUnits;
    }
  }


  #publish(active: ActiveTurn, assistant: string): void {
    const completed = Object.freeze({
      assistant,
      codeUnits: active.user.length + assistant.length,
      user: active.user,
    });
    active.chunks.splice(0);
    active.segments.splice(0);
    active.preparedAssistant = undefined;
    this.#active = undefined;
    this.#completed.push(completed);
    this.#completedCodeUnits += completed.codeUnits;
    this.#evictCompleted();
  }
}
