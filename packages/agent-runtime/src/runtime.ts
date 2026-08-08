import {
  Conversation,
  conversationEntryCodeUnits,
  err,
  Message,
  ok,
  type Result,
  Role,
  StructuredObject,
  structuredValueFromUnknown,
} from "@agent/core";
import {
  type PreparedToolCall,
  TOOL_ENGINE_LIMITS,
  ToolEngine,
  type ToolExecution,
} from "@agent/tools";

import { CancellationSource } from "./cancellation.js";
import type {
  RuntimeCleanupFailure,
  CommitTurnResult,
  RuntimeCommandError,
  RuntimeCommandErrorKind,
  RuntimeEvent,
  RuntimeSourceError,
  RuntimeSourceErrorKind,
  RuntimeStopError,
  StartedTurn,
  StartTurnError,
  StartTurnErrorKind,
  TurnFailure,
  TurnOutcome,
} from "./events.js";
import { RUNTIME_LIMITS } from "./limits.js";
import type { ModelStreamEvent, StreamingModel } from "./model.js";
import type { RuntimeSession } from "./session.js";


type Settled<T> =
  | Readonly<{ kind: "unexpected"; cause: unknown }>
  | Readonly<{ kind: "value"; value: T }>;

type ReadWinner<E> =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "read"; settled: Settled<Result<ModelStreamEvent, E>> }>;

type OwnedModelStream<E> = Readonly<{
  close: () => Promise<Result<void, E>>;
  read: (() => Promise<Result<ModelStreamEvent, E>>) | undefined;
}>;

type TurnState<E> = {
  candidate: Conversation;
  readonly chunks: string[];
  readonly cancellation: CancellationSource;
  readonly turnId: number;
  checkpointed: boolean;
  cleanup: RuntimeCleanupFailure<E>[];
  eventCount: number;
  pendingTool: PendingTool | undefined;
  prepared:
    | Readonly<{
        assistant: Message;
        cleanup: readonly RuntimeCleanupFailure<E>[];
      }>
    | undefined;
  responseCodeUnits: number;
  stream: OwnedModelStream<E> | undefined;
  toolFailurePending: boolean;
  toolSteps: number;
};

type ToolDecision = "approved" | "denied";

type PendingTool = {
  readonly approvalRequired: boolean;
  readonly prepared: PreparedToolCall;
  readonly whenDecided: Promise<ToolDecision>;
  decide: ((decision: ToolDecision) => void) | undefined;
  decision: ToolDecision | undefined;
  phase: "requested" | "started";
};

function countCodePoints(text: string): number {
  let count = 0;
  for (const _character of text) {
    count += 1;
    if (count > RUNTIME_LIMITS.inputCodePoints) {
      break;
    }
  }
  return count;
}

type ResultSnapshot =
  | Readonly<{ ok: false; error: unknown }>
  | Readonly<{ ok: true; value: unknown }>;

function readResult(value: unknown): ResultSnapshot | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const candidate = value as Readonly<{
      error?: unknown;
      ok?: unknown;
      value?: unknown;
    }>;
    const keys = Object.keys(value).sort().join(",");
    const resultKind = candidate.ok;
    if (resultKind === true && keys === "ok,value") {
      return Object.freeze({ ok: true as const, value: candidate.value });
    }
    if (resultKind === false && keys === "error,ok") {
      return Object.freeze({ error: candidate.error, ok: false as const });
    }
  } catch (_cause: unknown) {
    return undefined;
  }
  return undefined;
}

function readModelStream<E>(value: unknown): OwnedModelStream<E> | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  let close: unknown;
  try {
    const candidate = value as Readonly<{
      close?: unknown;
      read?: unknown;
    }>;
    close = candidate.close;
    if (typeof close !== "function") {
      return undefined;
    }
  } catch (_cause: unknown) {
    return undefined;
  }
  const closeOperation = () =>
    close.call(value) as Promise<Result<void, E>>;
  try {
    const read = (value as Readonly<{ read?: unknown }>).read;
    return Object.freeze({
      close: closeOperation,
      read:
        typeof read === "function"
          ? () => read.call(value) as Promise<Result<ModelStreamEvent, E>>
          : undefined,
    });
  } catch (_cause: unknown) {
    return Object.freeze({ close: closeOperation, read: undefined });
  }
}

function readModelStreamEvent(value: unknown): ModelStreamEvent | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  try {
    const candidate = value as Readonly<{
      kind?: unknown;
      callId?: unknown;
      input?: unknown;
      name?: unknown;
      text?: unknown;
    }>;
    const keys = Object.keys(value).sort().join(",");
    const kind = candidate.kind;
    if (kind === "done" && keys === "kind") {
      return Object.freeze({ kind: "done" as const });
    }
    if (kind === "delta" && keys === "kind,text") {
      const text = candidate.text;
      return typeof text === "string"
        ? Object.freeze({ kind: "delta" as const, text })
        : undefined;
    }
    if (kind === "toolCall" && keys === "callId,input,kind,name") {
      const callId = candidate.callId;
      const name = candidate.name;
      const input = structuredValueFromUnknown(candidate.input);
      return typeof callId === "string" &&
        typeof name === "string" &&
        input.ok &&
        input.value instanceof StructuredObject
        ? Object.freeze({
            callId,
            input: input.value,
            kind: "toolCall" as const,
            name,
          })
        : undefined;
    }
  } catch (_cause: unknown) {
    return undefined;
  }
  return undefined;
}

async function settle<T>(operation: () => Promise<T>): Promise<Settled<T>> {
  try {
    return Object.freeze({ kind: "value" as const, value: await operation() });
  } catch (cause: unknown) {
    return Object.freeze({ kind: "unexpected" as const, cause });
  }
}

function startError(kind: StartTurnErrorKind): StartTurnError {
  return Object.freeze({ kind });
}

function commandError(kind: RuntimeCommandErrorKind): RuntimeCommandError {
  return Object.freeze({ kind });
}

function sourceError(kind: RuntimeSourceErrorKind): RuntimeSourceError {
  return Object.freeze({ kind });
}

function failed<E>(failure: TurnFailure<E>): TurnOutcome<E> {
  return Object.freeze({ kind: "failed" as const, failure });
}

function createPendingTool(
  prepared: PreparedToolCall,
  approvalRequired: boolean,
): PendingTool {
  let decide: ((decision: ToolDecision) => void) | undefined;
  const whenDecided = new Promise<ToolDecision>((resolve) => {
    decide = resolve;
  });
  const decision = approvalRequired ? undefined : "approved";
  if (decision !== undefined) {
    decide?.(decision);
    decide = undefined;
  }
  return {
    approvalRequired,
    decide,
    decision,
    phase: "requested",
    prepared,
    whenDecided,
  };
}

/** One-model, one-turn streaming runtime with atomic conversation commits. */
export class AgentRuntime<E> implements RuntimeSession<E> {
  readonly #model: StreamingModel<E>;
  readonly #tools: ToolEngine | undefined;
  #closed = false;
  #conversation = Conversation.empty();
  #finished:
    | Readonly<{
        cleanup: readonly RuntimeCleanupFailure<E>[];
        turnId: number;
      }>
    | undefined;
  #nextTurnId = 1;
  #pendingRead:
    | Promise<Result<RuntimeEvent<E>, RuntimeSourceError>>
    | undefined;
  #state: TurnState<E> | undefined;
  #stopOperation: Promise<Result<void, RuntimeStopError<E>>> | undefined;

  constructor(model: StreamingModel<E>, tools?: ToolEngine) {
    this.#model = model;
    this.#tools = tools;
  }

  /** Returns the last completely committed immutable conversation. */
  get conversation(): Conversation {
    return this.#conversation;
  }

  /** Returns the active turn id, if a prospective turn exists. */
  get activeTurnId(): number | undefined {
    return this.#state?.turnId ?? this.#finished?.turnId;
  }

  /** Validates and starts one prospective turn without committing personal text. */
  startTurn(input: string): Result<StartedTurn, StartTurnError> {
    if (this.#closed) {
      return err(startError("closed"));
    }
    if (this.#state !== undefined || this.#finished !== undefined) {
      return err(startError("busy"));
    }
    if (this.#nextTurnId > Number.MAX_SAFE_INTEGER) {
      return err(startError("turnIdExhausted"));
    }
    if (countCodePoints(input) > RUNTIME_LIMITS.inputCodePoints) {
      return err(startError("inputTooLong"));
    }
    const user = Message.create(Role.User, input);
    if (!user.ok) {
      return err(startError("emptyInput"));
    }
    if (
      this.#conversation.length + 2 >
      RUNTIME_LIMITS.conversationMessages
    ) {
      return err(startError("conversationTooLong"));
    }
    const candidate = this.#conversation.append(user.value);
    if (
      candidate.codeUnits > RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return err(startError("conversationTooLong"));
    }

    const turnId = this.#nextTurnId;
    this.#nextTurnId += 1;
    this.#state = {
      candidate,
      chunks: [],
      cancellation: new CancellationSource(),
      checkpointed: false,
      cleanup: [],
      eventCount: 0,
      pendingTool: undefined,
      prepared: undefined,
      responseCodeUnits: 0,
      stream: undefined,
      toolFailurePending: false,
      toolSteps: 0,
      turnId,
    };
    return ok(Object.freeze({ turnId, user: user.value }));
  }

  /** Requests cancellation for the exact active turn idempotently. */
  requestCancel(
    turnId: number,
  ): Result<boolean, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    const state = this.#state;
    if (state === undefined) {
      const finished = this.#finished;
      if (finished !== undefined) {
        return finished.turnId === turnId
          ? ok(false)
          : err(commandError("staleTurn"));
      }
      return err(commandError("idle"));
    }
    if (state.turnId !== turnId) {
      return err(commandError("staleTurn"));
    }
    return ok(state.cancellation.request());
  }

  /** Resolves one exact pending approval without widening its scope. */
  resolveToolApproval(
    turnId: number,
    callId: string,
    approved: boolean,
  ): Result<void, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    const state = this.#state;
    if (state === undefined) {
      return err(commandError("idle"));
    }
    if (state.turnId !== turnId) {
      return err(commandError("staleTurn"));
    }
    const pending = state.pendingTool;
    if (
      pending === undefined ||
      !pending.approvalRequired ||
      pending.prepared.call.callId !== callId ||
      pending.decision !== undefined ||
      pending.phase !== "requested"
    ) {
      return err(commandError("notAwaitingApproval"));
    }
    const decision = approved ? "approved" : "denied";
    pending.decision = decision;
    const decide = pending.decide;
    pending.decide = undefined;
    decide?.(decision);
    return ok(undefined);
  }

  /** Resolves the exact prepared turn after application event ordering. */
  commitTurn(
    turnId: number,
  ): Result<CommitTurnResult, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    const state = this.#state;
    if (state === undefined) {
      return err(commandError("idle"));
    }
    if (state.turnId !== turnId) {
      return err(commandError("staleTurn"));
    }
    const prepared = state.prepared;
    if (prepared === undefined) {
      return err(commandError("notPrepared"));
    }
    if (state.cancellation.requested) {
      this.#discardState(state);
      return ok(Object.freeze({ kind: "cancelled" as const }));
    }
    if (
      state.candidate.length + 1 > RUNTIME_LIMITS.conversationMessages ||
      state.candidate.codeUnits + prepared.assistant.content.length >
        RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return err(commandError("conversationTooLong"));
    }
    this.#conversation = state.candidate.append(prepared.assistant);
    this.#discardState(state);
    return ok(Object.freeze({ kind: "committed" as const }));
  }

  /** Releases one delivered terminal receipt after the application consumes it. */
  acknowledgeTurn(turnId: number): Result<void, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    const finished = this.#finished;
    if (finished === undefined) {
      return err(commandError("notFinished"));
    }
    if (finished.turnId !== turnId) {
      return err(commandError("staleTurn"));
    }
    this.#finished = undefined;
    return ok(undefined);
  }

  /** Resolves the next ordered delta or single terminal turn event. */
  nextEvent(): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    if (this.#pendingRead !== undefined) {
      return Promise.resolve(err(sourceError("concurrentRead")));
    }
    const state = this.#state;
    if (state === undefined) {
      if (this.#finished !== undefined) {
        return Promise.resolve(err(sourceError("awaitingAcknowledge")));
      }
      return Promise.resolve(
        err(sourceError(this.#closed ? "closed" : "idle")),
      );
    }
    if (state.prepared !== undefined) {
      return Promise.resolve(err(sourceError("awaitingCommit")));
    }

    const operation = this.#advance(state);
    this.#pendingRead = operation;
    void operation.then(
      () => {
        if (this.#pendingRead === operation) {
          this.#pendingRead = undefined;
        }
      },
      () => {
        if (this.#pendingRead === operation) {
          this.#pendingRead = undefined;
        }
      },
    );
    return operation;
  }

  /** Closes the runtime idempotently, cancelling and cleaning active work. */
  stop(): Promise<Result<void, RuntimeStopError<E>>> {
    if (this.#stopOperation !== undefined) {
      return this.#stopOperation;
    }
    this.#closed = true;
    this.#stopOperation = this.#performStop();
    return this.#stopOperation;
  }

  async #advance(
    state: TurnState<E>,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    if (state.cancellation.requested) {
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }

    if (state.toolFailurePending) {
      state.toolFailurePending = false;
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }

    if (state.pendingTool !== undefined) {
      return this.#advanceTool(state, state.pendingTool);
    }

    if (state.stream === undefined) {
      const opened = await settle(() =>
        this.#model.open(
          state.candidate,
          state.cancellation.signal,
          this.#tools?.descriptors ?? Object.freeze([]),
        ),
      );
      const openedResult =
        opened.kind === "value" ? readResult(opened.value) : undefined;
      if (state.cancellation.requested) {
        if (
          openedResult?.ok === true
        ) {
          state.stream = readModelStream<E>(openedResult.value);
        }
        return this.#finish(state, Object.freeze({ kind: "cancelled" }));
      }
      if (opened.kind === "unexpected") {
        return this.#finish(
          state,
          failed(
            Object.freeze({
              kind: "unexpected" as const,
              operation: "open" as const,
            }),
          ),
        );
      }
      if (openedResult === undefined) {
        return this.#finish(
          state,
          failed(
            Object.freeze({
              kind: "invalidModelResult" as const,
              operation: "open" as const,
            }),
          ),
        );
      }
      if (!openedResult.ok) {
        return this.#finish(
          state,
          failed(
            Object.freeze({
              kind: "model" as const,
              operation: "open" as const,
              error: openedResult.error as E,
            }),
          ),
        );
      }
      const stream = readModelStream<E>(openedResult.value);
      if (stream === undefined || stream.read === undefined) {
        state.stream = stream;
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "invalidModelStream" })),
        );
      }
      state.stream = stream;
    }

    return this.#readStream(state, state.stream);
  }

  async #readStream(
    state: TurnState<E>,
    stream: OwnedModelStream<E>,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const readOperation = stream.read;
    if (readOperation === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "invalidModelStream" })),
      );
    }
    const read = settle(() => readOperation());
    const winner = await Promise.race<ReadWinner<E>>([
      read.then((settled) =>
        Object.freeze({ kind: "read" as const, settled }),
      ),
      state.cancellation.whenRequested.then(() =>
        Object.freeze({ kind: "cancelled" as const }),
      ),
    ]);
    if (winner.kind === "cancelled" || state.cancellation.requested) {
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }
    const settled = winner.settled;
    if (settled.kind === "unexpected") {
      return this.#finish(
        state,
        failed(
          Object.freeze({
            kind: "unexpected" as const,
            operation: "read" as const,
          }),
        ),
      );
    }
    const readResultValue = readResult(settled.value);
    if (readResultValue === undefined) {
      return this.#finish(
        state,
        failed(
          Object.freeze({
            kind: "invalidModelResult" as const,
            operation: "read" as const,
          }),
        ),
      );
    }
    if (!readResultValue.ok) {
      return this.#finish(
        state,
        failed(
          Object.freeze({
            kind: "model" as const,
            operation: "read" as const,
            error: readResultValue.error as E,
          }),
        ),
      );
    }
    const event = readModelStreamEvent(readResultValue.value);
    if (event === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "invalidModelEvent" })),
      );
    }

    state.eventCount += 1;
    if (state.eventCount > RUNTIME_LIMITS.streamEvents) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "eventLimit" })),
      );
    }
    if (event.kind === "delta") {
      if (event.text.length === 0) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "emptyDelta" })),
        );
      }
      if (event.text.length > RUNTIME_LIMITS.deltaCodeUnits) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "responseTooLong" })),
        );
      }
      state.responseCodeUnits += event.text.length;
      if (state.responseCodeUnits > RUNTIME_LIMITS.responseCodeUnits) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "responseTooLong" })),
        );
      }
      state.chunks.push(event.text);
      return ok(
        Object.freeze({
          kind: "assistantDelta" as const,
          turnId: state.turnId,
          text: event.text,
        }),
      );
    }

    if (event.kind === "toolCall") {
      return this.#requestTool(state, event);
    }

    const response = state.chunks.join("");
    const assistant = Message.create(Role.Assistant, response);
    if (!assistant.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "emptyResponse" })),
      );
    }
    if (
      state.candidate.length + 1 > RUNTIME_LIMITS.conversationMessages ||
      state.candidate.codeUnits + assistant.value.content.length >
      RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "responseTooLong" })),
      );
    }
    return this.#complete(state, assistant.value);
  }

  async #requestTool(
    state: TurnState<E>,
    event: Extract<ModelStreamEvent, { kind: "toolCall" }>,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const tools = this.#tools;
    if (tools === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolUnavailable" })),
      );
    }
    state.toolSteps += 1;
    if (state.toolSteps > RUNTIME_LIMITS.toolSteps) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    const prepared = tools.prepare(event.callId, event.name, event.input);
    if (!prepared.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "invalidToolCall" })),
      );
    }
    const response = state.chunks.join("");
    if (response.trim().length > 0) {
      const preamble = Message.create(Role.Assistant, response);
      if (!preamble.ok) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "invalidToolCall" })),
        );
      }
      state.candidate = state.candidate.append(preamble.value);
    }
    state.chunks.splice(0);
    state.responseCodeUnits = 0;
    state.eventCount = 0;
    if (state.candidate.length + 3 > RUNTIME_LIMITS.conversationMessages) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    const reservedCodeUnits =
      state.candidate.codeUnits +
      conversationEntryCodeUnits(prepared.value.call) +
      prepared.value.call.callId.length +
      prepared.value.call.name.length +
      TOOL_ENGINE_LIMITS.outputCodeUnits;
    if (reservedCodeUnits > RUNTIME_LIMITS.conversationCodeUnits) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    const cleanup = await this.#closeStream(state);
    state.cleanup.push(...cleanup);
    const approvalRequired = prepared.value.descriptor.risk !== "read";
    state.pendingTool = createPendingTool(prepared.value, approvalRequired);
    return ok(
      Object.freeze({
        approvalRequired,
        approvalPreview: prepared.value.approvalPreview,
        callId: prepared.value.call.callId,
        kind: "toolRequested" as const,
        name: prepared.value.call.name,
        risk: prepared.value.descriptor.risk,
        turnId: state.turnId,
      }),
    );
  }

  async #advanceTool(
    state: TurnState<E>,
    pending: PendingTool,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const tools = this.#tools;
    if (tools === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolUnavailable" })),
      );
    }
    if (pending.phase === "requested") {
      const decision =
        pending.decision ??
        (await Promise.race([
          pending.whenDecided,
          state.cancellation.whenRequested.then(
            () => "cancelled" as const,
          ),
        ]));
      if (decision === "cancelled" || state.cancellation.requested) {
        return this.#finish(state, Object.freeze({ kind: "cancelled" }));
      }
      if (decision === "denied") {
        const denied = tools.deny(pending.prepared);
        return denied.ok
          ? this.#checkpointTool(state, pending, denied.value)
          : this.#finish(
              state,
              failed(Object.freeze({ kind: "toolEngine" })),
            );
      }
      pending.phase = "started";
      return ok(
        Object.freeze({
          callId: pending.prepared.call.callId,
          kind: "toolStarted" as const,
          name: pending.prepared.call.name,
          risk: pending.prepared.descriptor.risk,
          turnId: state.turnId,
        }),
      );
    }

    const executed = await tools.execute(
      pending.prepared,
      state.cancellation.signal,
    );
    if (!executed.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    return this.#checkpointTool(state, pending, executed.value);
  }

  #checkpointTool(
    state: TurnState<E>,
    pending: PendingTool,
    executed: ToolExecution,
  ): Result<RuntimeEvent<E>, RuntimeSourceError> {
    const candidate = state.candidate
      .append(executed.call)
      .append(executed.result);
    if (
      candidate.length > RUNTIME_LIMITS.conversationMessages ||
      candidate.codeUnits > RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return this.#terminalEvent(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
        Object.freeze([...state.cleanup]),
      );
    }
    state.candidate = candidate;
    state.checkpointed = true;
    state.toolFailurePending = executed.contractFailure;
    this.#conversation = candidate;
    state.pendingTool = undefined;
    return ok(
      Object.freeze({
        callId: pending.prepared.call.callId,
        kind: "toolFinished" as const,
        name: pending.prepared.call.name,
        risk: pending.prepared.descriptor.risk,
        status: executed.result.status,
        turnId: state.turnId,
      }),
    );
  }

  async #complete(
    state: TurnState<E>,
    assistant: Message,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const cleanup = Object.freeze([
      ...state.cleanup,
      ...(await this.#closeStream(state)),
    ]);
    if (state.cancellation.requested) {
      return this.#terminalEvent(
        state,
        Object.freeze({ kind: "cancelled" }),
        cleanup,
      );
    }
    state.chunks.splice(0);
    state.prepared = Object.freeze({ assistant, cleanup });
    return ok(
      Object.freeze({
        assistant,
        cleanup,
        checkpointed: state.checkpointed,
        kind: "turnPrepared" as const,
        turnId: state.turnId,
      }),
    );
  }

  async #finish(
    state: TurnState<E>,
    outcome: TurnOutcome<E>,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const cleanup = Object.freeze([
      ...state.cleanup,
      ...(await this.#closeStream(state)),
    ]);
    return this.#terminalEvent(
      state,
      state.cancellation.requested
        ? Object.freeze({ kind: "cancelled" })
        : outcome,
      cleanup,
    );
  }

  #terminalEvent(
    state: TurnState<E>,
    outcome: TurnOutcome<E>,
    cleanup: readonly RuntimeCleanupFailure<E>[],
  ): Result<RuntimeEvent<E>, RuntimeSourceError> {
    state.chunks.splice(0);
    if (this.#state === state) {
      this.#state = undefined;
    }
    this.#finished = Object.freeze({ cleanup, turnId: state.turnId });
    return ok(
      Object.freeze({
        kind: "turnFinished" as const,
        turnId: state.turnId,
        outcome,
        cleanup,
        checkpointed: state.checkpointed,
      }),
    );
  }

  async #closeStream(
    state: TurnState<E>,
  ): Promise<readonly RuntimeCleanupFailure<E>[]> {
    const stream = state.stream;
    state.stream = undefined;
    if (stream === undefined) {
      return Object.freeze([]);
    }
    const closed = await settle(() => stream.close());
    if (closed.kind === "unexpected") {
      return Object.freeze([
        Object.freeze({ kind: "unexpected" as const }),
      ]);
    }
    const closeResult = readResult(closed.value);
    if (closeResult === undefined) {
      return Object.freeze([
        Object.freeze({ kind: "invalidModelResult" as const }),
      ]);
    }
    return closeResult.ok
      ? Object.freeze([])
      : Object.freeze([
          Object.freeze({ kind: "model" as const, error: closeResult.error as E }),
        ]);
  }

  #discardState(state: TurnState<E>): void {
    state.chunks.splice(0);
    state.cleanup.splice(0);
    state.pendingTool = undefined;
    state.prepared = undefined;
    if (this.#state === state) {
      this.#state = undefined;
    }
  }

  async #performStop(): Promise<Result<void, RuntimeStopError<E>>> {
    const finished = this.#finished;
    if (finished !== undefined) {
      this.#finished = undefined;
      return finished.cleanup.length === 0
        ? ok(undefined)
        : err(Object.freeze({ failures: finished.cleanup }));
    }
    const state = this.#state;
    if (state === undefined) {
      return ok(undefined);
    }
    state.cancellation.request();
    if (state.prepared !== undefined) {
      const cleanup = state.prepared.cleanup;
      this.#discardState(state);
      return cleanup.length === 0
        ? ok(undefined)
        : err(Object.freeze({ failures: cleanup }));
    }
    let terminal =
      this.#pendingRead === undefined
        ? await this.nextEvent()
        : await this.#pendingRead;
    while (
      terminal.ok &&
      terminal.value.kind !== "turnFinished" &&
      terminal.value.kind !== "turnPrepared" &&
      this.#state === state
    ) {
      terminal = await this.#advance(state);
    }
    const failures: RuntimeCleanupFailure<E>[] = [];
    if (
      terminal.ok &&
      (terminal.value.kind === "turnFinished" ||
        terminal.value.kind === "turnPrepared")
    ) {
      failures.push(...terminal.value.cleanup);
    }
    if (this.#state === state) {
      failures.push(...(await this.#closeStream(state)));
      this.#discardState(state);
    }
    if (this.#finished?.turnId === state.turnId) {
      this.#finished = undefined;
    }
    return failures.length === 0
      ? ok(undefined)
      : err(Object.freeze({ failures: Object.freeze(failures) }));
  }
}
