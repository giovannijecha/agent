import {
  CONVERSATION_TREE_LIMITS,
  Conversation,
  ConversationTree,
  type ConversationTreeTurnSnapshot,
  type ConversationEntry,
  type ConversationTurnSettlement,
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
  type ToolEngineError,
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
  StartedTurn,
  StartTurnError,
  StartTurnErrorKind,
  TurnFailure,
  TurnOutcome,
} from "./events.js";
import { RUNTIME_LIMITS } from "./limits.js";
import type {
  ModelStreamEvent,
  ModelToolCall,
  ModelTurnOptions,
  StreamingModel,
  ThinkingEffort,
} from "./model.js";
import type {
  RuntimeHistorySource,
  RuntimeSession,
  RuntimeStoppedTurn,
  RuntimeStopReport,
} from "./session.js";


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
  readonly baseCodeUnits: number;
  readonly baseLength: number;
  readonly baseMessageUnits: number;
  candidate: Conversation;
  readonly chunks: string[];
  readonly reasoningChunks: string[];
  readonly cancellation: CancellationSource;
  readonly historyParentNodeId: number;
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
  reasoningCodeUnits: number;
  stream: OwnedModelStream<E> | undefined;
  toolFailurePending: boolean;
  toolSteps: number;
  readonly thinkingEffort: ThinkingEffort;
};

type ToolDecision = "allowed" | "denied";

type PendingTool = {
  readonly planned: PlannedToolCall;
  readonly whenDecided: Promise<ToolDecision>;
  decide: ((decision: ToolDecision) => void) | undefined;
  decision: ToolDecision | undefined;
  phase: "unannounced" | "requested" | "started";
};

type SequentialToolBatch = {
  readonly kind: "sequential";
  readonly assistant: Message | undefined;
  readonly executions: ToolExecution[];
  readonly outputBudgets: readonly number[];
  readonly prepared: readonly PreparedToolCall[];
  readonly reasoning: string | undefined;
  index: number;
  pending: PendingTool | undefined;
};

type ParallelReadCall = {
  readonly planned: PlannedToolCall;
  readonly outputCodeUnits: number;
  decision: ToolDecision | undefined;
  execution: ToolExecution | undefined;
  settlement:
    | Promise<Settled<Result<ToolExecution, ToolEngineError>>>
    | undefined;
};

type ParallelReadBatch = {
  readonly kind: "parallelRead";
  readonly assistant: Message | undefined;
  readonly calls: ParallelReadCall[];
  readonly reasoning: string | undefined;
  finishIndex: number;
  pending: PendingTool | undefined;
  permissionIndex: number;
  phase:
    | "finishing"
    | "launching"
    | "permissions"
    | "running"
    | "starting";
  startIndex: number;
};

type ActiveToolBatch = ParallelReadBatch | SequentialToolBatch;

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
    if (
      (kind === "delta" || kind === "reasoningDelta") &&
      keys === "kind,text"
    ) {
      const text = candidate.text;
      return typeof text === "string"
        ? Object.freeze({ kind, text })
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

function stopReport<E>(
  failures: readonly RuntimeCleanupFailure<E>[],
  settledTurn: RuntimeStoppedTurn<E> | undefined,
): RuntimeStopReport<E> {
  return Object.freeze({
    cleanup: failures.length === 0
      ? ok(undefined)
      : err(Object.freeze({ failures: Object.freeze([...failures]) })),
    settledTurn,
  });
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

function admitsParallelReads(
  prepared: readonly PreparedToolCall[],
): boolean {
  if (
    prepared.length < 2 ||
    prepared.length > RUNTIME_LIMITS.parallelReads
  ) {
    return false;
  }
  for (const call of prepared) {
    if (call.scheduling !== "independentRead") {
      return false;
    }
  }
  return true;
}

/** One-model, one-turn streaming runtime with atomic conversation commits. */
export class AgentRuntime<E> implements RuntimeHistorySource, RuntimeSession<E> {
  readonly #model: StreamingModel<E>;
  readonly #tools: ToolEngine | undefined;
  #closed = false;
  #conversation: Conversation;
  #history: ConversationTree;
  #finished:
    | Readonly<{
        cleanup: readonly RuntimeCleanupFailure<E>[];
        settledTurn: RuntimeStoppedTurn<E> | undefined;
        turnId: number;
      }>
    | undefined;
  #nextTurnId = 1;
  #pendingRead:
    | Promise<Result<RuntimeEvent<E>, RuntimeSourceError>>
    | undefined;
  #state: TurnState<E> | undefined;
  #stopOperation: Promise<RuntimeStopReport<E>> | undefined;

  constructor(
    model: StreamingModel<E>,
    tools?: ToolEngine,
    history: ConversationTree = ConversationTree.empty(),
  ) {
    this.#model = model;
    this.#tools = tools;
    this.#history = history;
    this.#conversation = history.conversation;
  }

  /** Returns the last completely committed immutable conversation. */
  get conversation(): Conversation {
    return this.#conversation;
  }

  /** Returns the active turn id, if a prospective turn exists. */
  get activeTurnId(): number | undefined {
    return this.#state?.turnId ?? this.#finished?.turnId;
  }

  /** Returns one immutable settled turn without changing active history. */
  conversationTurn(
    nodeId: number,
  ): Result<ConversationTreeTurnSnapshot, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    if (!Number.isSafeInteger(nodeId) || nodeId < 1) {
      return err(commandError("invalidHistoryNode"));
    }
    const turn = this.#history.turns.at(nodeId - 1);
    return turn?.id === nodeId
      ? ok(turn)
      : err(commandError("invalidHistoryNode"));
  }

  /** Selects one existing process-memory branch while the runtime is idle. */
  selectConversationNode(
    nodeId: number,
  ): Result<void, RuntimeCommandError> {
    if (this.#closed) {
      return err(commandError("closed"));
    }
    if (this.#state !== undefined || this.#finished !== undefined) {
      return err(commandError("busy"));
    }
    const selected = this.#history.select(nodeId);
    if (!selected.ok) {
      return err(commandError("invalidHistoryNode"));
    }
    this.#history = selected.value;
    this.#conversation = this.#history.conversation;
    return ok(undefined);
  }

  /** Validates and starts one prospective turn without committing personal text. */
  startTurn(
    input: string,
    thinkingEffort: ThinkingEffort = "off",
  ): Result<StartedTurn, StartTurnError> {
    if (this.#closed) {
      return err(startError("closed"));
    }
    if (this.#state !== undefined || this.#finished !== undefined) {
      return err(startError("busy"));
    }
    if (this.#nextTurnId > Number.MAX_SAFE_INTEGER) {
      return err(startError("turnIdExhausted"));
    }
    if (
      thinkingEffort !== "off" &&
      thinkingEffort !== "low" &&
      thinkingEffort !== "medium" &&
      thinkingEffort !== "high"
    ) {
      return err(startError("invalidThinkingEffort"));
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
    if (
      this.#history.turnCount >= CONVERSATION_TREE_LIMITS.turns ||
      this.#history.retainedMessageUnits + 2 >
        CONVERSATION_TREE_LIMITS.messageUnits ||
      this.#history.retainedCodeUnits + user.value.content.length + 1 >
        CONVERSATION_TREE_LIMITS.codeUnits
    ) {
      return err(startError("historyTooLong"));
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
      baseCodeUnits: this.#conversation.codeUnits,
      baseLength: this.#conversation.length,
      baseMessageUnits: this.#conversation.messageUnits,
      candidate,
      chunks: [],
      reasoningChunks: [],
      cancellation: new CancellationSource(),
      checkpointed: false,
      cleanup: [],
      eventCount: 0,
      historyParentNodeId: this.#history.activeNodeId,
      toolBatch: undefined,
      prepared: undefined,
      responseCodeUnits: 0,
      reasoningCodeUnits: 0,
      stream: undefined,
      toolFailurePending: false,
      toolSteps: 0,
      thinkingEffort,
      turnId,
    };
    return ok(
      Object.freeze({
        historyParentNodeId: this.#history.activeNodeId,
        turnId,
        user: user.value,
      }),
    );
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
      const historyNodeId = state.checkpointed
        ? this.#appendHistory(state, "checkpointed")
        : undefined;
      if (state.checkpointed && historyNodeId === undefined) {
        return err(commandError("conversationTooLong"));
      }
      if (!state.checkpointed) {
        this.#conversation = this.#history.conversation;
      }
      this.#discardState(state);
      return ok(
        Object.freeze({ historyNodeId, kind: "cancelled" as const }),
      );
    }
    if (
      state.candidate.messageUnits + 1 >
        RUNTIME_LIMITS.conversationMessages ||
      state.candidate.codeUnits + prepared.assistant.content.length >
        RUNTIME_LIMITS.conversationCodeUnits
    ) {
      return err(commandError("conversationTooLong"));
    }
    const historyNodeId = this.#appendHistory(
      state,
      "completed",
      prepared.assistant,
    );
    if (historyNodeId === undefined) {
      return err(commandError("conversationTooLong"));
    }
    this.#discardState(state);
    return ok(
      Object.freeze({ historyNodeId, kind: "committed" as const }),
    );
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
  stop(): Promise<RuntimeStopReport<E>> {
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
    const activeBatch = state.toolBatch;
    if (
      activeBatch?.kind === "parallelRead" &&
      (activeBatch.phase === "running" ||
        activeBatch.phase === "finishing")
    ) {
      return this.#advanceParallelReadBatch(state, activeBatch);
    }
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
          Object.freeze({
            thinkingEffort: state.thinkingEffort,
          }) satisfies ModelTurnOptions,
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

    if (event.kind === "reasoningDelta") {
      if (
        state.thinkingEffort === "off" ||
        state.responseCodeUnits > 0
      ) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "invalidModelEvent" })),
        );
      }
      if (event.text.length === 0) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "emptyReasoningDelta" })),
        );
      }
      if (event.text.length > RUNTIME_LIMITS.reasoningDeltaCodeUnits) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "reasoningTooLong" })),
        );
      }
      state.reasoningCodeUnits += event.text.length;
      if (
        state.reasoningCodeUnits > RUNTIME_LIMITS.reasoningResponseCodeUnits
      ) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "reasoningTooLong" })),
        );
      }
      state.reasoningChunks.push(event.text);
      return ok(
        Object.freeze({
          kind: "reasoningDelta" as const,
          turnId: state.turnId,
          text: event.text,
        }),
      );
    }

    if (event.kind === "toolCalls") {
      return this.#requestTools(state, event);
    }

    const response = state.chunks.join("");
    const reasoning = state.reasoningChunks.join("");
    const assistant = Message.create(
      Role.Assistant,
      response,
      reasoning.trim().length === 0 ? undefined : reasoning,
    );
    if (!assistant.ok) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "emptyResponse" })),
      );
    }
    if (
      state.candidate.messageUnits + 1 >
        RUNTIME_LIMITS.conversationMessages ||
      state.candidate.codeUnits +
          assistant.value.content.length +
          (assistant.value.reasoning?.length ?? 0) >
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
          failed(
            Object.freeze({
              kind: "invalidToolCall",
              reason: prepared.error.kind,
            }),
          ),
        );
      }
      preparedCalls.push(prepared.value);
    }
    const response = state.chunks.join("");
    const reasoningText = state.reasoningChunks.join("");
    const reasoning = reasoningText.trim().length === 0
      ? undefined
      : reasoningText;
    let assistant: Message | undefined;
    if (response.trim().length > 0) {
      const preamble = Message.create(Role.Assistant, response);
      if (!preamble.ok) {
        return this.#finish(
          state,
          failed(
            Object.freeze({
              kind: "invalidToolCall",
              reason: "invalidCall",
            }),
          ),
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
    const retainedDeltaMessageUnits =
      state.candidate.messageUnits - state.baseMessageUnits;
    if (
      this.#history.retainedMessageUnits +
        retainedDeltaMessageUnits +
        preparedCalls.length +
        2 >
      CONVERSATION_TREE_LIMITS.messageUnits
    ) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolLimit" })),
      );
    }
    let fixedCodeUnits =
      state.candidate.codeUnits +
      (assistant?.content.length ?? 0) +
      (reasoning?.length ?? 0) +
      (state.thinkingEffort !== "off"
        ? RUNTIME_LIMITS.reasoningResponseCodeUnits
        : 0) +
      RUNTIME_LIMITS.responseCodeUnits;
    for (const prepared of preparedCalls) {
      fixedCodeUnits +=
        prepared.call.callId.length * 2 +
        prepared.call.name.length * 2 +
        prepared.call.input.codeUnits;
    }
    const activeAvailableOutputCodeUnits =
      RUNTIME_LIMITS.conversationCodeUnits - fixedCodeUnits;
    let retainedFixedCodeUnits =
      this.#history.retainedCodeUnits +
      (state.candidate.codeUnits - state.baseCodeUnits) +
      (assistant?.content.length ?? 0) +
      (reasoning?.length ?? 0) +
      (state.thinkingEffort !== "off"
        ? RUNTIME_LIMITS.reasoningResponseCodeUnits
        : 0) +
      RUNTIME_LIMITS.responseCodeUnits;
    for (const prepared of preparedCalls) {
      retainedFixedCodeUnits +=
        prepared.call.callId.length * 2 +
        prepared.call.name.length * 2 +
        prepared.call.input.codeUnits;
    }
    const availableOutputCodeUnits = Math.min(
      activeAvailableOutputCodeUnits,
      CONVERSATION_TREE_LIMITS.codeUnits - retainedFixedCodeUnits,
    );
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
    state.reasoningChunks.splice(0);
    state.responseCodeUnits = 0;
    state.reasoningCodeUnits = 0;
    state.eventCount = 0;
    state.toolSteps += preparedCalls.length;
    const prepared = Object.freeze(preparedCalls);
    const first = prepared.at(0);
    if (first === undefined) {
      return this.#finish(
        state,
        failed(
          Object.freeze({
            kind: "invalidToolCall",
            reason: "invalidCall",
          }),
        ),
      );
    }
    if (admitsParallelReads(prepared)) {
      const calls: ParallelReadCall[] = [];
      for (let index = 0; index < prepared.length; index += 1) {
        const current = prepared.at(index);
        const outputCodeUnits = outputBudgets.at(index);
        if (current === undefined || outputCodeUnits === undefined) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        const planned = await tools.plan(
          current,
          state.cancellation.signal,
        );
        if (state.cancellation.requested) {
          return this.#finish(state, Object.freeze({ kind: "cancelled" }));
        }
        if (!planned.ok) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        calls.push({
          decision: undefined,
          execution: undefined,
          outputCodeUnits,
          planned: planned.value,
          settlement: undefined,
        });
      }
      const firstCall = calls.at(0);
      if (firstCall === undefined) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "toolEngine" })),
        );
      }
      const pending = createPendingTool(firstCall.planned);
      const batch: ParallelReadBatch = {
        assistant,
        calls,
        finishIndex: 0,
        kind: "parallelRead",
        pending,
        permissionIndex: 0,
        phase: "permissions",
        reasoning,
        startIndex: 0,
      };
      state.toolBatch = batch;
      return ok(this.#toolRequestedEvent(state, pending));
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
      kind: "sequential",
      outputBudgets,
      pending,
      prepared,
      reasoning,
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
    return batch.kind === "parallelRead"
      ? this.#advanceParallelReadBatch(state, batch)
      : this.#advanceSequentialToolBatch(state, batch);
  }

  async #advanceSequentialToolBatch(
    state: TurnState<E>,
    batch: SequentialToolBatch,
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

  async #advanceParallelReadBatch(
    state: TurnState<E>,
    batch: ParallelReadBatch,
  ): Promise<Result<RuntimeEvent<E>, RuntimeSourceError>> {
    const tools = this.#tools;
    if (tools === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolUnavailable" })),
      );
    }
    if (batch.phase === "permissions") {
      const pending = batch.pending;
      const call = batch.calls.at(batch.permissionIndex);
      if (pending === undefined || call === undefined) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "toolEngine" })),
        );
      }
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
      call.decision = decision;
      if (decision === "denied") {
        const denied = tools.deny(call.planned);
        if (!denied.ok) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        call.execution = denied.value;
      }
      const nextIndex = batch.permissionIndex + 1;
      const next = batch.calls.at(nextIndex);
      if (next !== undefined) {
        batch.permissionIndex = nextIndex;
        const nextPending = createPendingTool(next.planned);
        batch.pending = nextPending;
        return ok(this.#toolRequestedEvent(state, nextPending));
      }
      batch.pending = undefined;
      batch.phase = "starting";
    }

    if (batch.phase === "starting") {
      while (batch.startIndex < batch.calls.length) {
        const call = batch.calls.at(batch.startIndex);
        batch.startIndex += 1;
        if (call === undefined || call.decision === undefined) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        if (call.decision === "denied") {
          continue;
        }
        let laterAllowed = false;
        for (
          let index = batch.startIndex;
          index < batch.calls.length;
          index += 1
        ) {
          if (batch.calls.at(index)?.decision === "allowed") {
            laterAllowed = true;
            break;
          }
        }
        if (!laterAllowed) {
          batch.phase = "launching";
        }
        return ok(
          Object.freeze({
            callId: call.planned.call.callId,
            kind: "toolStarted" as const,
            name: call.planned.call.name,
            risk: call.planned.descriptor.risk,
            turnId: state.turnId,
          }),
        );
      }
      batch.phase = "finishing";
    }

    if (batch.phase === "launching") {
      if (!this.#startParallelReadCohort(state, batch, tools)) {
        return this.#finish(
          state,
          failed(Object.freeze({ kind: "toolEngine" })),
        );
      }
      batch.phase = "running";
    }

    if (batch.phase === "running") {
      const pendingSettlements: Promise<
        Settled<Result<ToolExecution, ToolEngineError>>
      >[] = [];
      for (const call of batch.calls) {
        if (call.decision === "allowed") {
          const settlement = call.settlement;
          if (settlement === undefined) {
            return this.#finish(
              state,
              failed(Object.freeze({ kind: "toolEngine" })),
            );
          }
          pendingSettlements.push(settlement);
        }
      }
      await Promise.all(pendingSettlements);
      for (const call of batch.calls) {
        if (call.decision !== "allowed") {
          continue;
        }
        const settlement = call.settlement;
        if (settlement === undefined) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        const settled = await settlement;
        if (settled.kind === "unexpected" || !settled.value.ok) {
          return this.#finish(
            state,
            failed(Object.freeze({ kind: "toolEngine" })),
          );
        }
        call.execution = settled.value.value;
      }
      batch.phase = "finishing";
    }

    const call = batch.calls.at(batch.finishIndex);
    const executed = call?.execution;
    if (call === undefined || executed === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "toolEngine" })),
      );
    }
    batch.finishIndex += 1;
    if (batch.finishIndex === batch.calls.length) {
      let contractFailure = false;
      for (const entry of batch.calls) {
        if (entry.execution?.contractFailure === true) {
          contractFailure = true;
        }
      }
      if (!this.#checkpointToolBatch(state, batch)) {
        return this.#terminalEvent(
          state,
          failed(Object.freeze({ kind: "toolLimit" })),
          Object.freeze([...state.cleanup]),
        );
      }
      state.toolFailurePending = contractFailure;
    }
    return ok(
      Object.freeze({
        callId: call.planned.call.callId,
        kind: "toolFinished" as const,
        name: call.planned.call.name,
        risk: call.planned.descriptor.risk,
        status: executed.result.status,
        turnId: state.turnId,
      }),
    );
  }

  #startParallelReadCohort(
    state: TurnState<E>,
    batch: ParallelReadBatch,
    tools: ToolEngine,
  ): boolean {
    for (const call of batch.calls) {
      if (call.decision === "allowed") {
        if (call.settlement !== undefined) {
          return false;
        }
        call.settlement = settle(() =>
          tools.execute(
            call.planned,
            state.cancellation.signal,
            call.outputCodeUnits,
          ),
        );
      }
    }
    return true;
  }

  #settleToolExecution(
    state: TurnState<E>,
    batch: SequentialToolBatch,
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
    batch: SequentialToolBatch,
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
    if (batch.kind === "parallelRead") {
      if (batch.phase === "running" || batch.phase === "finishing") {
        return this.#advanceParallelReadBatch(state, batch);
      }
      state.toolBatch = undefined;
      return this.#finish(state, Object.freeze({ kind: "cancelled" }));
    }
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
    const executions: ToolExecution[] = [];
    if (batch.kind === "parallelRead") {
      for (const call of batch.calls) {
        if (call.execution === undefined) {
          return false;
        }
        executions.push(call.execution);
      }
    } else {
      executions.push(...batch.executions);
    }
    const exchange = ToolExchange.create(
      batch.assistant,
      executions.map((execution) => execution.call),
      executions.map((execution) => execution.result),
      batch.reasoning,
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
    const retained = this.#previewHistory(state, "checkpointed", undefined, candidate);
    if (retained === undefined) {
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
    if (this.#previewHistory(state, "completed", assistant) === undefined) {
      return this.#finish(
        state,
        failed(Object.freeze({ kind: "responseTooLong" })),
      );
    }
    state.chunks.splice(0);
    state.reasoningChunks.splice(0);
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
    state.reasoningChunks.splice(0);
    const historyNodeId = state.checkpointed
      ? this.#appendHistory(state, "checkpointed")
      : undefined;
    if (!state.checkpointed) {
      this.#conversation = this.#history.conversation;
    }
    if (this.#state === state) {
      this.#state = undefined;
    }
    const settled = historyNodeId === undefined
      ? undefined
      : this.#history.turns.at(historyNodeId - 1);
    const settledTurn = settled === undefined
      ? undefined
      : Object.freeze({ outcome, turn: settled });
    this.#finished = Object.freeze({
      cleanup,
      settledTurn,
      turnId: state.turnId,
    });
    return ok(
      Object.freeze({
        kind: "turnFinished" as const,
        turnId: state.turnId,
        outcome,
        cleanup,
        checkpointed: state.checkpointed,
        historyNodeId,
      }),
    );
  }

  #previewHistory(
    state: TurnState<E>,
    settlement: ConversationTurnSettlement,
    assistant?: Message,
    candidate: Conversation = state.candidate,
  ): ConversationTree | undefined {
    if (this.#history.activeNodeId !== state.historyParentNodeId) {
      return undefined;
    }
    const entries: ConversationEntry[] = [];
    for (let index = state.baseLength; index < candidate.length; index += 1) {
      const entry = candidate.entries.at(index);
      if (entry === undefined) {
        return undefined;
      }
      entries.push(entry);
    }
    if (assistant !== undefined) {
      entries.push(assistant);
    }
    const appended = this.#history.appendTurn(entries, settlement);
    return appended.ok ? appended.value : undefined;
  }

  #appendHistory(
    state: TurnState<E>,
    settlement: ConversationTurnSettlement,
    assistant?: Message,
  ): number | undefined {
    const appended = this.#previewHistory(state, settlement, assistant);
    if (appended === undefined) {
      return undefined;
    }
    this.#history = appended;
    this.#conversation = this.#history.conversation;
    return this.#history.activeNodeId;
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
    state.reasoningChunks.splice(0);
    state.cleanup.splice(0);
    state.toolBatch = undefined;
    state.prepared = undefined;
    if (this.#state === state) {
      this.#state = undefined;
    }
  }

  async #performStop(): Promise<RuntimeStopReport<E>> {
    const finished = this.#finished;
    if (finished !== undefined) {
      this.#finished = undefined;
      return stopReport(finished.cleanup, finished.settledTurn);
    }
    const state = this.#state;
    if (state === undefined) {
      return stopReport(Object.freeze([]), undefined);
    }
    state.cancellation.request();
    if (state.prepared !== undefined) {
      const cleanup = state.prepared.cleanup;
      this.#terminalEvent(
        state,
        Object.freeze({ kind: "cancelled" }),
        cleanup,
      );
      const settledTurn = this.#finished?.turnId === state.turnId
        ? this.#finished.settledTurn
        : undefined;
      this.#finished = undefined;
      return stopReport(cleanup, settledTurn);
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
    if (
      terminal.ok &&
      terminal.value.kind === "turnPrepared" &&
      this.#state === state
    ) {
      terminal = this.#terminalEvent(
        state,
        Object.freeze({ kind: "cancelled" }),
        terminal.value.cleanup,
      );
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
    const settledTurn = this.#finished?.turnId === state.turnId
      ? this.#finished.settledTurn
      : undefined;
    if (this.#finished?.turnId === state.turnId) {
      this.#finished = undefined;
    }
    return stopReport(failures, settledTurn);
  }
}
