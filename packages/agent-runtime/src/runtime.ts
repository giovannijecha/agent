import {
  Conversation,
  err,
  Message,
  ok,
  type Result,
  Role,
  StructuredObject,
  structuredValueFromUnknown,
  ToolExchange,
} from "@agent/core";
import {
  type PreparedToolCall,
  type PlannedToolCall,
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
import type { ModelStreamEvent, ModelToolCall, StreamingModel } from "./model.js";
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
  toolBatch: ActiveToolBatch | undefined;
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

type ToolDecision = "allowed" | "denied";

type PendingTool = {
  readonly planned: PlannedToolCall;
  readonly whenDecided: Promise<ToolDecision>;
  decide: ((decision: ToolDecision) => void) | undefined;
  decision: ToolDecision | undefined;
  phase: "unannounced" | "requested" | "started";
};

type ActiveToolBatch = {
  readonly assistant: Message | undefined;
  readonly executions: ToolExecution[];
  readonly outputBudgets: readonly number[];
  readonly prepared: readonly PreparedToolCall[];
  index: number;
  pending: PendingTool | undefined;
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
      calls?: unknown;
      text?: unknown;
      kind?: unknown;
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
    if (kind === "toolCalls" && keys === "calls,kind") {
      const source = candidate.calls;
      if (
        !Array.isArray(source) ||
        source.length === 0 ||
        source.length > RUNTIME_LIMITS.toolSteps
      ) {
        return undefined;
      }
      const calls: ModelToolCall[] = [];
      const callIds = new Set<string>();
      for (const sourceCall of source) {
        if (sourceCall === null || typeof sourceCall !== "object") {
          return undefined;
        }
        const callKeys = Object.keys(sourceCall).sort().join(",");
        const raw = sourceCall as Readonly<{
          callId?: unknown;
          input?: unknown;
          name?: unknown;
        }>;
        const callId = raw.callId;
        const name = raw.name;
        const input = structuredValueFromUnknown(raw.input);
        if (
          callKeys !== "callId,input,name" ||
          typeof callId !== "string" ||
          typeof name !== "string" ||
          callIds.has(callId) ||
          !input.ok ||
          !(input.value instanceof StructuredObject)
        ) {
          return undefined;
        }
        callIds.add(callId);
        calls.push(Object.freeze({ callId, input: input.value, name }));
      }
      return Object.freeze({
        calls: Object.freeze(calls),
        kind: "toolCalls" as const,
      });
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
  planned: PlannedToolCall,
  phase: PendingTool["phase"] = "requested",
): PendingTool {
  let decide: ((decision: ToolDecision) => void) | undefined;
  const whenDecided = new Promise<ToolDecision>((resolve) => {
    decide = resolve;
  });
  return {
    decide,
    decision: undefined,
    phase,
    planned,
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
      this.#conversation.messageUnits + 2 >
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
      toolBatch: undefined,
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

  /** Resolves one exact pending permission without widening its scope. */
  resolveToolPermission(
    turnId: number,
    callId: string,
    allowed: boolean,
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
    const pending = state.toolBatch?.pending;
    if (
      pending === undefined ||
      pending.planned.call.callId !== callId ||
      pending.decision !== undefined ||
      pending.phase !== "requested"
    ) {
      return err(commandError("notAwaitingPermission"));
    }
    const decision = allowed ? "allowed" : "denied";
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
      state.candidate.messageUnits + 1 >
        RUNTIME_LIMITS.conversationMessages ||
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
      if (state.toolBatch !== undefined) {
        return this.#cancelToolBatch(state, state.toolBatch);
      }
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }

    if (state.toolFailurePending) {
      state.toolFailurePending = false;
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }

    if (state.toolBatch !== undefined) {
      return this.#advanceToolBatch(state, state.toolBatch);
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

    if (event.kind === "toolCalls") {
      return this.#requestTools(state, event);
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
      state.candidate.messageUnits + 1 >
        RUNTIME_LIMITS.conversationMessages ||
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

  async #requestTools(
    state: TurnState<E>,
    event: Extract<ModelStreamEvent, { kind: "toolCalls" }>,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const tools = this.#tools;
    if (tools === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolUnavailable" })),
      );
    }
    if (state.toolSteps + event.calls.length > RUNTIME_LIMITS.toolSteps) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    const preparedCalls: PreparedToolCall[] = [];
    for (const call of event.calls) {
      const prepared = tools.prepare(call.callId, call.name, call.input);
      if (!prepared.ok) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "invalidToolCall" })),
        );
      }
      preparedCalls.push(prepared.value);
    }
    const response = state.chunks.join("");
    let assistant: Message | undefined;
    if (response.trim().length > 0) {
      const preamble = Message.create(Role.Assistant, response);
      if (!preamble.ok) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "invalidToolCall" })),
        );
      }
      assistant = preamble.value;
    }
    if (
      state.candidate.messageUnits + preparedCalls.length + 2 >
      RUNTIME_LIMITS.conversationMessages
    ) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    let fixedCodeUnits =
      state.candidate.codeUnits +
      (assistant?.content.length ?? 0) +
      RUNTIME_LIMITS.responseCodeUnits;
    for (const prepared of preparedCalls) {
      fixedCodeUnits +=
        prepared.call.callId.length * 2 +
        prepared.call.name.length * 2 +
        prepared.call.input.codeUnits;
    }
    const availableOutputCodeUnits =
      RUNTIME_LIMITS.conversationCodeUnits - fixedCodeUnits;
    const minimumOutputCodeUnits =
      preparedCalls.length * TOOL_ENGINE_LIMITS.minimumOutputCodeUnits;
    if (availableOutputCodeUnits < minimumOutputCodeUnits) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    const sharedOutputCodeUnits = Math.floor(
      (availableOutputCodeUnits - minimumOutputCodeUnits) /
        preparedCalls.length,
    );
    const outputRemainder =
      availableOutputCodeUnits -
      minimumOutputCodeUnits -
      sharedOutputCodeUnits * preparedCalls.length;
    const outputBudgets = Object.freeze(
      preparedCalls.map((_prepared, index) =>
        Math.min(
          TOOL_ENGINE_LIMITS.outputCodeUnits,
          TOOL_ENGINE_LIMITS.minimumOutputCodeUnits +
            sharedOutputCodeUnits +
            (index < outputRemainder ? 1 : 0),
        ),
      ),
    );
    const cleanup = await this.#closeStream(state);
    state.cleanup.push(...cleanup);
    state.chunks.splice(0);
    state.responseCodeUnits = 0;
    state.eventCount = 0;
    state.toolSteps += preparedCalls.length;
    const prepared = Object.freeze(preparedCalls);
    const first = prepared.at(0);
    if (first === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "invalidToolCall" })),
      );
    }
    const planned = await tools.plan(first, state.cancellation.signal);
    if (state.cancellation.requested) {
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }
    if (!planned.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    const pending = createPendingTool(planned.value);
    const batch: ActiveToolBatch = {
      assistant,
      executions: [],
      index: 0,
      outputBudgets,
      pending,
      prepared,
    };
    state.toolBatch = batch;
    return ok(this.#toolRequestedEvent(state, pending));
  }

  #toolRequestedEvent(
    state: TurnState<E>,
    pending: PendingTool,
  ): Extract<RuntimeEvent<E>, { kind: "toolRequested" }> {
    return Object.freeze({
      approvalRequired: pending.planned.approvalRequired,
      approvalPreview: pending.planned.approvalPreview,
      callId: pending.planned.call.callId,
      kind: "toolRequested" as const,
      name: pending.planned.call.name,
      risk: pending.planned.descriptor.risk,
      turnId: state.turnId,
    });
  }

  async #advanceToolBatch(
    state: TurnState<E>,
    batch: ActiveToolBatch,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const tools = this.#tools;
    if (tools === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolUnavailable" })),
      );
    }
    let pending = batch.pending;
    if (pending === undefined) {
      const prepared = batch.prepared.at(batch.index);
      if (prepared === undefined) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "toolEngine" })),
        );
      }
      const planned = await tools.plan(prepared, state.cancellation.signal);
      if (state.cancellation.requested) {
        return this.#cancelToolBatch(state, batch);
      }
      if (!planned.ok) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "toolEngine" })),
        );
      }
      pending = createPendingTool(planned.value, "unannounced");
      batch.pending = pending;
    }
    if (pending.phase === "unannounced") {
      pending.phase = "requested";
      return ok(this.#toolRequestedEvent(state, pending));
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
        return this.#cancelToolBatch(state, batch);
      }
      if (decision === "denied") {
        const denied = tools.deny(pending.planned);
        return denied.ok
          ? this.#settleToolExecution(state, batch, denied.value)
          : this.#finish(
              state,
              failed(Object.freeze({ kind: "toolEngine" })),
            );
      }
      pending.phase = "started";
      return ok(
        Object.freeze({
          callId: pending.planned.call.callId,
          kind: "toolStarted" as const,
          name: pending.planned.call.name,
          risk: pending.planned.descriptor.risk,
          turnId: state.turnId,
        }),
      );
    }

    const outputCodeUnits = batch.outputBudgets.at(batch.index);
    if (outputCodeUnits === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    const executed = await tools.execute(
      pending.planned,
      state.cancellation.signal,
      outputCodeUnits,
    );
    if (!executed.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    return this.#settleToolExecution(state, batch, executed.value);
  }

  #settleToolExecution(
    state: TurnState<E>,
    batch: ActiveToolBatch,
    executed: ToolExecution,
  ): Result<RuntimeEvent<E>, RuntimeSourceError> {
    const pending = batch.pending;
    if (pending === undefined) {
      return this.#terminalEvent(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
        Object.freeze([...state.cleanup]),
      );
    }
    batch.executions.push(executed);
    const terminalFailure = executed.contractFailure;
    let batchInvariantFailure = false;
    if (terminalFailure) {
      batchInvariantFailure = !this.#fillNotRun(batch, "blocked");
    } else if (state.cancellation.requested) {
      batchInvariantFailure = !this.#fillNotRun(batch, "cancelled");
    } else {
      const nextIndex = batch.index + 1;
      const next = batch.prepared.at(nextIndex);
      if (next !== undefined) {
        batch.index = nextIndex;
        batch.pending = undefined;
      }
    }
    if (
      terminalFailure ||
      state.cancellation.requested ||
      batch.executions.length === batch.prepared.length
    ) {
      if (
        batchInvariantFailure ||
        !this.#checkpointToolBatch(state, batch)
      ) {
        return this.#terminalEvent(
          state,
          failed(
            Object.freeze({
              kind: batchInvariantFailure ? "toolEngine" : "toolLimit",
            }),
          ),
          Object.freeze([...state.cleanup]),
        );
      }
      state.toolFailurePending = terminalFailure;
    }
    return ok(
      Object.freeze({
        callId: pending.planned.call.callId,
        kind: "toolFinished" as const,
        name: pending.planned.call.name,
        risk: pending.planned.descriptor.risk,
        status: executed.result.status,
        turnId: state.turnId,
      }),
    );
  }

  #fillNotRun(
    batch: ActiveToolBatch,
    reason: "blocked" | "cancelled",
  ): boolean {
    const tools = this.#tools;
    if (tools === undefined) {
      return false;
    }
    for (
      let index = batch.executions.length;
      index < batch.prepared.length;
      index += 1
    ) {
      const prepared = batch.prepared.at(index);
      if (prepared === undefined) {
        return false;
      }
      const notRun = tools.notRun(prepared, reason);
      if (!notRun.ok) {
        return false;
      }
      batch.executions.push(notRun.value);
    }
    return true;
  }

  async #cancelToolBatch(
    state: TurnState<E>,
    batch: ActiveToolBatch,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    if (batch.executions.length === 0) {
      state.toolBatch = undefined;
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }
    if (
      !this.#fillNotRun(batch, "cancelled") ||
      !this.#checkpointToolBatch(state, batch)
    ) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    return this.#finish(state, Object.freeze({ kind: "cancelled" }));
  }

  #checkpointToolBatch(
    state: TurnState<E>,
    batch: ActiveToolBatch,
  ): boolean {
    const exchange = ToolExchange.create(
      batch.assistant,
      batch.executions.map((execution) => execution.call),
      batch.executions.map((execution) => execution.result),
    );
    if (!exchange.ok) {
      return false;
    }
    const candidate = state.candidate.append(exchange.value);
    if (
      candidate.messageUnits + 1 > RUNTIME_LIMITS.conversationMessages ||
      candidate.codeUnits > RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return false;
    }
    state.candidate = candidate;
    state.checkpointed = true;
    this.#conversation = candidate;
    state.toolBatch = undefined;
    return true;
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
    state.toolBatch = undefined;
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
