import { err, ok, type Result } from "./result.js";
import {
  StructuredObject,
  type StructuredValue,
  structuredValueCodeUnits,
  structuredValueFromUnknown,
} from "./structured-value.js";

export const Role = Object.freeze({
  Assistant: "assistant",
  System: "system",
  User: "user",
} as const);

export type Role = "assistant" | "system" | "user";
export type MessageErrorKind =
  | "blank"
  | "invalidContent"
  | "invalidReasoning"
  | "invalidRole";

export class MessageError {
  readonly #kind: MessageErrorKind;

  constructor(kind: MessageErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): MessageErrorKind {
    return this.#kind;
  }
}

export class Message {
  readonly #content: string;
  readonly #reasoning: string | undefined;
  readonly #role: Role;

  private constructor(role: Role, content: string, reasoning?: string) {
    this.#role = role;
    this.#content = content;
    this.#reasoning = reasoning;
    Object.freeze(this);
  }

  static create(
    role: Role,
    content: string,
    reasoning?: string,
  ): Result<Message, MessageError> {
    if (
      role !== Role.System &&
      role !== Role.User &&
      role !== Role.Assistant
    ) {
      return err(new MessageError("invalidRole"));
    }
    if (typeof content !== "string") {
      return err(new MessageError("invalidContent"));
    }
    if (content.trim().length === 0) {
      return err(new MessageError("blank"));
    }
    if (
      reasoning !== undefined &&
      (role !== Role.Assistant ||
        typeof reasoning !== "string" ||
        reasoning.trim().length === 0)
    ) {
      return err(new MessageError("invalidReasoning"));
    }
    return ok(new Message(role, content, reasoning));
  }

  get content(): string {
    return this.#content;
  }

  get reasoning(): string | undefined {
    return this.#reasoning;
  }

  get role(): Role {
    return this.#role;
  }
}

export type ToolEntryErrorKind =
  | "invalidCallId"
  | "invalidName"
  | "invalidValue";

export class ToolEntryError {
  readonly #kind: ToolEntryErrorKind;

  constructor(kind: ToolEntryErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ToolEntryErrorKind {
    return this.#kind;
  }
}

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

function validCallId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !/\p{Cc}/u.test(value)
  );
}

export class ToolCall {
  readonly #callId: string;
  readonly #input: StructuredObject;
  readonly #name: string;

  private constructor(callId: string, name: string, input: StructuredObject) {
    this.#callId = callId;
    this.#name = name;
    this.#input = input;
    Object.freeze(this);
  }

  static create(
    callId: string,
    name: string,
    input: StructuredObject,
  ): Result<ToolCall, ToolEntryError> {
    if (!validCallId(callId)) {
      return err(new ToolEntryError("invalidCallId"));
    }
    if (typeof name !== "string" || !VALID_TOOL_NAME.test(name)) {
      return err(new ToolEntryError("invalidName"));
    }
    const snapshot = structuredValueFromUnknown(input);
    if (!snapshot.ok || !(snapshot.value instanceof StructuredObject)) {
      return err(new ToolEntryError("invalidValue"));
    }
    return ok(new ToolCall(callId, name, snapshot.value));
  }

  get callId(): string {
    return this.#callId;
  }

  get input(): StructuredObject {
    return this.#input;
  }

  get name(): string {
    return this.#name;
  }
}

export type ToolResultStatus = "failure" | "success";

export class ToolResult {
  readonly #callId: string;
  readonly #name: string;
  readonly #output: StructuredValue;
  readonly #status: ToolResultStatus;

  private constructor(
    callId: string,
    name: string,
    status: ToolResultStatus,
    output: StructuredValue,
  ) {
    this.#callId = callId;
    this.#name = name;
    this.#status = status;
    this.#output = output;
    Object.freeze(this);
  }

  static create(
    callId: string,
    name: string,
    status: ToolResultStatus,
    output: StructuredValue,
  ): Result<ToolResult, ToolEntryError> {
    if (!validCallId(callId)) {
      return err(new ToolEntryError("invalidCallId"));
    }
    if (typeof name !== "string" || !VALID_TOOL_NAME.test(name)) {
      return err(new ToolEntryError("invalidName"));
    }
    if (status !== "success" && status !== "failure") {
      return err(new ToolEntryError("invalidValue"));
    }
    const snapshot = structuredValueFromUnknown(output);
    return snapshot.ok
      ? ok(new ToolResult(callId, name, status, snapshot.value))
      : err(new ToolEntryError("invalidValue"));
  }

  get callId(): string {
    return this.#callId;
  }

  get name(): string {
    return this.#name;
  }

  get output(): StructuredValue {
    return this.#output;
  }

  get status(): ToolResultStatus {
    return this.#status;
  }
}

export const TOOL_EXCHANGE_LIMITS = Object.freeze({ calls: 32 });

export type ToolExchangeErrorKind =
  | "duplicateCallId"
  | "empty"
  | "invalidAssistant"
  | "invalidEntry"
  | "invalidReasoning"
  | "mismatchedResult"
  | "tooManyCalls";

export class ToolExchangeError {
  readonly #kind: ToolExchangeErrorKind;

  constructor(kind: ToolExchangeErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ToolExchangeErrorKind {
    return this.#kind;
  }
}

/** One complete assistant tool-call message and its ordered results. */
export class ToolExchange {
  readonly #assistant: Message | undefined;
  readonly #calls: readonly ToolCall[];
  readonly #reasoning: string | undefined;
  readonly #results: readonly ToolResult[];

  private constructor(
    assistant: Message | undefined,
    calls: readonly ToolCall[],
    results: readonly ToolResult[],
    reasoning?: string,
  ) {
    this.#assistant = assistant;
    this.#calls = Object.freeze([...calls]);
    this.#results = Object.freeze([...results]);
    this.#reasoning = reasoning;
    Object.freeze(this);
  }

  static create(
    assistant: Message | undefined,
    calls: readonly ToolCall[],
    results: readonly ToolResult[],
    reasoning?: string,
  ): Result<ToolExchange, ToolExchangeError> {
    try {
      if (
        assistant !== undefined &&
        (!(assistant instanceof Message) ||
          assistant.role !== Role.Assistant ||
          assistant.reasoning !== undefined)
      ) {
        return err(new ToolExchangeError("invalidAssistant"));
      }
      if (
        reasoning !== undefined &&
        (typeof reasoning !== "string" || reasoning.trim().length === 0)
      ) {
        return err(new ToolExchangeError("invalidReasoning"));
      }
      if (!Array.isArray(calls) || !Array.isArray(results)) {
        return err(new ToolExchangeError("invalidEntry"));
      }
      if (calls.length === 0) {
        return err(new ToolExchangeError("empty"));
      }
      if (calls.length > TOOL_EXCHANGE_LIMITS.calls) {
        return err(new ToolExchangeError("tooManyCalls"));
      }
      if (calls.length !== results.length) {
        return err(new ToolExchangeError("mismatchedResult"));
      }
      const ownedCalls: ToolCall[] = [];
      const ownedResults: ToolResult[] = [];
      const callIds = new Set<string>();
      for (let index = 0; index < calls.length; index += 1) {
        const call = calls.at(index);
        const result = results.at(index);
        if (!(call instanceof ToolCall) || !(result instanceof ToolResult)) {
          return err(new ToolExchangeError("invalidEntry"));
        }
        if (callIds.has(call.callId)) {
          return err(new ToolExchangeError("duplicateCallId"));
        }
        if (call.callId !== result.callId || call.name !== result.name) {
          return err(new ToolExchangeError("mismatchedResult"));
        }
        callIds.add(call.callId);
        ownedCalls.push(call);
        ownedResults.push(result);
      }
      return ok(new ToolExchange(assistant, ownedCalls, ownedResults, reasoning));
    } catch (_cause: unknown) {
      return err(new ToolExchangeError("invalidEntry"));
    }
  }

  get assistant(): Message | undefined {
    return this.#assistant;
  }

  get calls(): readonly ToolCall[] {
    return this.#calls;
  }

  get reasoning(): string | undefined {
    return this.#reasoning;
  }

  get results(): readonly ToolResult[] {
    return this.#results;
  }
}

export type ConversationEntry = Message | ToolExchange;

/** Returns retained text units for deterministic conversation limits. */
export function conversationEntryCodeUnits(entry: ConversationEntry): number {
  if (entry instanceof Message) {
    return entry.content.length + (entry.reasoning?.length ?? 0);
  }
  let codeUnits =
    (entry.assistant?.content.length ?? 0) + (entry.reasoning?.length ?? 0);
  for (const call of entry.calls) {
    codeUnits += call.callId.length + call.name.length + call.input.codeUnits;
  }
  for (const result of entry.results) {
    codeUnits +=
      result.callId.length +
      result.name.length +
      structuredValueCodeUnits(result.output);
  }
  return codeUnits;
}

/** Returns the number of provider messages represented by one entry. */
export function conversationEntryMessageUnits(entry: ConversationEntry): number {
  return entry instanceof Message ? 1 : 1 + entry.results.length;
}

export class Conversation {
  readonly #codeUnits: number;
  readonly #entries: readonly ConversationEntry[];
  readonly #messageUnits: number;

  private constructor(
    entries: readonly ConversationEntry[],
    codeUnits: number,
    messageUnits: number,
  ) {
    this.#entries = Object.freeze([...entries]);
    this.#codeUnits = codeUnits;
    this.#messageUnits = messageUnits;
    Object.freeze(this);
  }

  static empty(): Conversation {
    return new Conversation([], 0, 0);
  }

  append(entry: ConversationEntry): Conversation {
    return new Conversation(
      [...this.#entries, entry],
      this.#codeUnits + conversationEntryCodeUnits(entry),
      this.#messageUnits + conversationEntryMessageUnits(entry),
    );
  }

  get codeUnits(): number {
    return this.#codeUnits;
  }

  get entries(): readonly ConversationEntry[] {
    return this.#entries;
  }

  get isEmpty(): boolean {
    return this.#entries.length === 0;
  }

  get messageUnits(): number {
    return this.#messageUnits;
  }

  get length(): number {
    return this.#entries.length;
  }
}
