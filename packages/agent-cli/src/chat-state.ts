import { RUNTIME_LIMITS } from "@agent/runtime";
import { err, ok, type Result, TUI_LIMITS } from "@agent/tui";

const MAX_COMPLETED_TURNS = 128;
const MAX_COMPLETED_CODE_UNITS = 1_048_576;
const TRANSCRIPT_SEPARATOR = "\n\n";

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

function turnDocuments(user: string, assistant: string): readonly string[] {
  return Object.freeze(["you\n" + user, "agent\n" + assistant]);
}

function documentCodeUnits(documents: readonly string[]): number {
  return (
    documents.reduce((total, document) => total + document.length, 0) +
    Math.max(0, documents.length - 1) * TRANSCRIPT_SEPARATOR.length
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

  /** Builds isolated chronological message documents within the TUI text bound. */
  transcriptDocuments(): readonly string[] {
    const newest: Array<readonly string[]> = [];
    let codeUnits = 0;
    const active = this.#active;
    if (active !== undefined) {
      const assistant =
        active.preparedAssistant ??
        [...active.segments, active.chunks.join("")]
          .filter((segment) => segment.trim().length > 0)
          .join(TRANSCRIPT_SEPARATOR);
      const prospective = turnDocuments(
        active.user,
        assistant,
      );
      const completeProspective = prospective.join(TRANSCRIPT_SEPARATOR);
      if (completeProspective.length > TUI_LIMITS.displayTextCodeUnits) {
        const clipped = completeProspective.slice(
          -TUI_LIMITS.displayTextCodeUnits,
        );
        newest.push(Object.freeze([clipped]));
        codeUnits += clipped.length;
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
      const documents = turnDocuments(turn.user, turn.assistant);
      const formattedLength = documentCodeUnits(documents);
      const separator = newest.length === 0 ? 0 : TRANSCRIPT_SEPARATOR.length;
      if (
        codeUnits + separator + formattedLength >
        TUI_LIMITS.displayTextCodeUnits
      ) {
        break;
      }
      newest.push(documents);
      codeUnits += separator + formattedLength;
    }
    newest.reverse();
    return Object.freeze(newest.flatMap((documents) => documents));
  }

  /** Flattens the same isolated documents for plain text consumers. */
  transcriptText(): string {
    return this.transcriptDocuments().join(TRANSCRIPT_SEPARATOR);
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
