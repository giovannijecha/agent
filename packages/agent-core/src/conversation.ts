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
export type MessageErrorKind = "blank" | "invalidContent" | "invalidRole";

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
  readonly #role: Role;

  private constructor(role: Role, content: string) {
    this.#role = role;
    this.#content = content;
    Object.freeze(this);
  }

  static create(role: Role, content: string): Result<Message, MessageError> {
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
    return ok(new Message(role, content));
  }

  get content(): string {
    return this.#content;
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

export type ConversationEntry = Message | ToolCall | ToolResult;

/** Returns retained text units for deterministic conversation limits. */
export function conversationEntryCodeUnits(entry: ConversationEntry): number {
  if (entry instanceof Message) {
    return entry.content.length;
  }
  if (entry instanceof ToolCall) {
    return entry.callId.length + entry.name.length + entry.input.codeUnits;
  }
  return (
    entry.callId.length +
    entry.name.length +
    structuredValueCodeUnits(entry.output)
  );
}

export class Conversation {
  readonly #codeUnits: number;
  readonly #entries: readonly ConversationEntry[];

  private constructor(
    entries: readonly ConversationEntry[],
    codeUnits: number,
  ) {
    this.#entries = Object.freeze([...entries]);
    this.#codeUnits = codeUnits;
    Object.freeze(this);
  }

  static empty(): Conversation {
    return new Conversation([], 0);
  }

  append(entry: ConversationEntry): Conversation {
    return new Conversation(
      [...this.#entries, entry],
      this.#codeUnits + conversationEntryCodeUnits(entry),
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

  get length(): number {
    return this.#entries.length;
  }
}
