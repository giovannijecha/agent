import {
  Message,
  Role,
  ToolCall,
  ToolExchange,
  ToolResult,
  type ConversationEntry,
  type ToolResultStatus,
} from "./conversation.js";
import {
  ConversationTree,
  type ConversationTreeTurnSnapshot,
  type ConversationTurnSettlement,
} from "./conversation-tree.js";
import { err, ok, type Result } from "./result.js";
import {
  STRUCTURED_VALUE_LIMITS,
  StructuredList,
  StructuredObject,
  type StructuredValue,
} from "./structured-value.js";

export type ConversationJournalErrorKind =
  | "invalidActiveNode"
  | "invalidRecord"
  | "invalidTree";

export class ConversationJournalError {
  readonly #kind: ConversationJournalErrorKind;

  constructor(kind: ConversationJournalErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ConversationJournalErrorKind {
    return this.#kind;
  }
}

type StructuredValueRecord =
  | Readonly<{ kind: "boolean"; value: boolean }>
  | Readonly<{ kind: "list"; values: readonly StructuredValueRecord[] }>
  | Readonly<{ kind: "null" }>
  | Readonly<{ kind: "number"; value: string }>
  | Readonly<{
      fields: readonly Readonly<{
        name: string;
        value: StructuredValueRecord;
      }>[];
      kind: "object";
    }>
  | Readonly<{ kind: "string"; value: string }>;

type MessageRecord = Readonly<{
  content: string;
  kind: "message";
  role: "assistant" | "system" | "user";
}>;

type ToolExchangeRecord = Readonly<{
  assistant: MessageRecord | null;
  calls: readonly Readonly<{
    callId: string;
    input: StructuredValueRecord;
    name: string;
  }>[];
  kind: "toolExchange";
  results: readonly Readonly<{
    callId: string;
    name: string;
    output: StructuredValueRecord;
    status: ToolResultStatus;
  }>[];
}>;

export type ConversationJournalTurnRecord = Readonly<{
  entries: readonly (MessageRecord | ToolExchangeRecord)[];
  id: number;
  kind: "turn";
  parentId: number;
  settlement: ConversationTurnSettlement;
}>;

export type ConversationJournalTurn = Readonly<{
  entries: readonly ConversationEntry[];
  id: number;
  parentId: number;
  settlement: ConversationTurnSettlement;
}>;

type ParseBudget = { nodes: number; textCodeUnits: number };

function failure(kind: ConversationJournalErrorKind): ConversationJournalError {
  return new ConversationJournalError(kind);
}

function exactKeys(value: object, expected: string): boolean {
  return Object.keys(value).sort().join(",") === expected;
}

function numberRecord(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function numberFromRecord(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return undefined;
  }
  if (value === "-0") {
    return -0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(parsed) === value
    ? parsed
    : undefined;
}

function structuredRecord(value: StructuredValue): StructuredValueRecord {
  if (value === null) {
    return Object.freeze({ kind: "null" as const });
  }
  if (typeof value === "boolean") {
    return Object.freeze({ kind: "boolean" as const, value });
  }
  if (typeof value === "number") {
    return Object.freeze({
      kind: "number" as const,
      value: numberRecord(value),
    });
  }
  if (typeof value === "string") {
    return Object.freeze({ kind: "string" as const, value });
  }
  if (value instanceof StructuredList) {
    return Object.freeze({
      kind: "list" as const,
      values: Object.freeze(value.values.map((item) => structuredRecord(item))),
    });
  }
  return Object.freeze({
    fields: Object.freeze(
      value.fields.map((field) =>
        Object.freeze({
          name: field.name,
          value: structuredRecord(field.value),
        }),
      ),
    ),
    kind: "object" as const,
  });
}

function enter(budget: ParseBudget, depth: number): boolean {
  if (depth > STRUCTURED_VALUE_LIMITS.depth) {
    return false;
  }
  budget.nodes += 1;
  return budget.nodes <= STRUCTURED_VALUE_LIMITS.nodes;
}

function addText(budget: ParseBudget, codeUnits: number): boolean {
  budget.textCodeUnits += codeUnits;
  return budget.textCodeUnits <= STRUCTURED_VALUE_LIMITS.totalCodeUnits;
}

function structuredValue(
  input: unknown,
  budget: ParseBudget,
  depth: number,
): StructuredValue | undefined {
  if (input === null || typeof input !== "object" || !enter(budget, depth)) {
    return undefined;
  }
  const candidate = input as Readonly<{
    fields?: unknown;
    kind?: unknown;
    value?: unknown;
    values?: unknown;
  }>;
  const kind = candidate.kind;
  if (kind === "null" && exactKeys(input, "kind")) {
    return null;
  }
  if (kind === "boolean" && exactKeys(input, "kind,value")) {
    return typeof candidate.value === "boolean" ? candidate.value : undefined;
  }
  if (kind === "number" && exactKeys(input, "kind,value")) {
    return numberFromRecord(candidate.value);
  }
  if (kind === "string" && exactKeys(input, "kind,value")) {
    const value = candidate.value;
    return typeof value === "string" &&
        value.length <= STRUCTURED_VALUE_LIMITS.stringCodeUnits &&
        addText(budget, value.length)
      ? value
      : undefined;
  }
  if (kind === "list" && exactKeys(input, "kind,values")) {
    const values = candidate.values;
    if (
      !Array.isArray(values) ||
      values.length > STRUCTURED_VALUE_LIMITS.listItems
    ) {
      return undefined;
    }
    const owned: StructuredValue[] = [];
    let codeUnits = 0;
    for (let index = 0; index < values.length; index += 1) {
      const child = structuredValue(values.at(index), budget, depth + 1);
      if (child === undefined) {
        return undefined;
      }
      owned.push(child);
      codeUnits +=
        typeof child === "string" ||
          child instanceof StructuredList ||
          child instanceof StructuredObject
          ? typeof child === "string" ? child.length : child.codeUnits
          : 0;
    }
    return StructuredList.owned(owned, codeUnits);
  }
  if (kind !== "object" || !exactKeys(input, "fields,kind")) {
    return undefined;
  }
  const fields = candidate.fields;
  if (!Array.isArray(fields) || fields.length > STRUCTURED_VALUE_LIMITS.fields) {
    return undefined;
  }
  const names = new Set<string>();
  const ownedFields: Array<Readonly<{ name: string; value: StructuredValue }>> = [];
  let codeUnits = 0;
  for (let index = 0; index < fields.length; index += 1) {
    const raw = fields.at(index);
    if (raw === null || typeof raw !== "object" || !exactKeys(raw, "name,value")) {
      return undefined;
    }
    const field = raw as Readonly<{ name?: unknown; value?: unknown }>;
    const name = field.name;
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.length > STRUCTURED_VALUE_LIMITS.keyCodeUnits ||
      !/^[A-Za-z][A-Za-z0-9_]*$/u.test(name) ||
      names.has(name) ||
      !addText(budget, name.length)
    ) {
      return undefined;
    }
    const child = structuredValue(field.value, budget, depth + 1);
    if (child === undefined) {
      return undefined;
    }
    names.add(name);
    ownedFields.push(Object.freeze({ name, value: child }));
    codeUnits += name.length +
      (typeof child === "string"
        ? child.length
        : child instanceof StructuredList || child instanceof StructuredObject
        ? child.codeUnits
        : 0);
  }
  return StructuredObject.owned(ownedFields, codeUnits);
}

function messageRecord(message: Message): MessageRecord {
  return Object.freeze({
    content: message.content,
    kind: "message" as const,
    role: message.role,
  });
}

function messageFromRecord(input: unknown): Message | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const candidate = input as Readonly<{
    content?: unknown;
    kind?: unknown;
    role?: unknown;
  }>;
  if (candidate.kind !== "message" || !exactKeys(input, "content,kind,role")) {
    return undefined;
  }
  const role = candidate.role;
  const content = candidate.content;
  if (
    (role !== Role.Assistant && role !== Role.System && role !== Role.User) ||
    typeof content !== "string"
  ) {
    return undefined;
  }
  const created = Message.create(role, content);
  return created.ok ? created.value : undefined;
}

function exchangeRecord(exchange: ToolExchange): ToolExchangeRecord {
  return Object.freeze({
    assistant:
      exchange.assistant === undefined
        ? null
        : messageRecord(exchange.assistant),
    calls: Object.freeze(
      exchange.calls.map((call) =>
        Object.freeze({
          callId: call.callId,
          input: structuredRecord(call.input),
          name: call.name,
        }),
      ),
    ),
    kind: "toolExchange" as const,
    results: Object.freeze(
      exchange.results.map((result) =>
        Object.freeze({
          callId: result.callId,
          name: result.name,
          output: structuredRecord(result.output),
          status: result.status,
        }),
      ),
    ),
  });
}

function exchangeFromRecord(input: unknown): ToolExchange | undefined {
  if (input === null || typeof input !== "object") {
    return undefined;
  }
  const candidate = input as Readonly<{
    assistant?: unknown;
    calls?: unknown;
    kind?: unknown;
    results?: unknown;
  }>;
  if (
    candidate.kind !== "toolExchange" ||
    !exactKeys(input, "assistant,calls,kind,results") ||
    !Array.isArray(candidate.calls) ||
    !Array.isArray(candidate.results) ||
    candidate.calls.length !== candidate.results.length
  ) {
    return undefined;
  }
  const assistant = candidate.assistant === null
    ? undefined
    : messageFromRecord(candidate.assistant);
  if (candidate.assistant !== null && assistant === undefined) {
    return undefined;
  }
  const calls: ToolCall[] = [];
  const results: ToolResult[] = [];
  for (let index = 0; index < candidate.calls.length; index += 1) {
    const rawCall = candidate.calls.at(index);
    const rawResult = candidate.results.at(index);
    if (
      rawCall === null ||
      typeof rawCall !== "object" ||
      rawResult === null ||
      typeof rawResult !== "object" ||
      !exactKeys(rawCall, "callId,input,name") ||
      !exactKeys(rawResult, "callId,name,output,status")
    ) {
      return undefined;
    }
    const call = rawCall as Readonly<{
      callId?: unknown;
      input?: unknown;
      name?: unknown;
    }>;
    const result = rawResult as Readonly<{
      callId?: unknown;
      name?: unknown;
      output?: unknown;
      status?: unknown;
    }>;
    const callInput = structuredValue(
      call.input,
      { nodes: 0, textCodeUnits: 0 },
      0,
    );
    const resultOutput = structuredValue(
      result.output,
      { nodes: 0, textCodeUnits: 0 },
      0,
    );
    if (
      typeof call.callId !== "string" ||
      typeof call.name !== "string" ||
      !(callInput instanceof StructuredObject) ||
      typeof result.callId !== "string" ||
      typeof result.name !== "string" ||
      (result.status !== "success" && result.status !== "failure") ||
      resultOutput === undefined
    ) {
      return undefined;
    }
    const createdCall = ToolCall.create(call.callId, call.name, callInput);
    const createdResult = ToolResult.create(
      result.callId,
      result.name,
      result.status,
      resultOutput,
    );
    if (!createdCall.ok || !createdResult.ok) {
      return undefined;
    }
    calls.push(createdCall.value);
    results.push(createdResult.value);
  }
  const created = ToolExchange.create(assistant, calls, results);
  return created.ok ? created.value : undefined;
}

/** Encodes one immutable settled turn without selecting a storage format. */
export function conversationJournalTurnRecord(
  turn: ConversationTreeTurnSnapshot,
): ConversationJournalTurnRecord {
  return Object.freeze({
    entries: Object.freeze(
      turn.entries.map((entry) =>
        entry instanceof Message ? messageRecord(entry) : exchangeRecord(entry),
      ),
    ),
    id: turn.id,
    kind: "turn" as const,
    parentId: turn.parentId,
    settlement: turn.settlement,
  });
}

/** Decodes one untrusted storage record into bounded owned conversation state. */
export function conversationJournalTurnFromUnknown(
  input: unknown,
): Result<ConversationJournalTurn, ConversationJournalError> {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      !exactKeys(input, "entries,id,kind,parentId,settlement")
    ) {
      return err(failure("invalidRecord"));
    }
    const candidate = input as Readonly<{
      entries?: unknown;
      id?: unknown;
      kind?: unknown;
      parentId?: unknown;
      settlement?: unknown;
    }>;
    if (
      candidate.kind !== "turn" ||
      !Number.isSafeInteger(candidate.id) ||
      typeof candidate.id !== "number" ||
      candidate.id < 1 ||
      !Number.isSafeInteger(candidate.parentId) ||
      typeof candidate.parentId !== "number" ||
      candidate.parentId < 0 ||
      (candidate.settlement !== "completed" &&
        candidate.settlement !== "checkpointed") ||
      !Array.isArray(candidate.entries)
    ) {
      return err(failure("invalidRecord"));
    }
    const entries: ConversationEntry[] = [];
    for (let index = 0; index < candidate.entries.length; index += 1) {
      const raw = candidate.entries.at(index);
      let entry: ConversationEntry | undefined = messageFromRecord(raw);
      if (entry === undefined) {
        entry = exchangeFromRecord(raw);
      }
      if (entry === undefined) {
        return err(failure("invalidRecord"));
      }
      entries.push(entry);
    }
    return ok(
      Object.freeze({
        entries: Object.freeze(entries),
        id: candidate.id,
        parentId: candidate.parentId,
        settlement: candidate.settlement,
      }),
    );
  } catch (_cause: unknown) {
    return err(failure("invalidRecord"));
  }
}

/** Replays only validated turn deltas and one exact active-node pointer. */
export function restoreConversationJournal(
  turns: readonly ConversationJournalTurn[],
  activeNodeId: number,
): Result<ConversationTree, ConversationJournalError> {
  if (!Array.isArray(turns)) {
    return err(failure("invalidRecord"));
  }
  let tree = ConversationTree.empty();
  try {
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns.at(index);
      if (turn === undefined || turn.id !== index + 1) {
        return err(failure("invalidTree"));
      }
      const selected = tree.select(turn.parentId);
      if (!selected.ok) {
        return err(failure("invalidTree"));
      }
      const appended = selected.value.appendTurn(turn.entries, turn.settlement);
      if (!appended.ok || appended.value.activeNodeId !== turn.id) {
        return err(failure("invalidTree"));
      }
      tree = appended.value;
    }
    const selected = tree.select(activeNodeId);
    return selected.ok
      ? ok(selected.value)
      : err(failure("invalidActiveNode"));
  } catch (_cause: unknown) {
    return err(failure("invalidTree"));
  }
}
