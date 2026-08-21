import {
  Message,
  Role,
  StructuredList,
  StructuredObject,
  ToolExchange,
  err,
  ok,
  structuredValueFromUnknown,
  type Conversation,
  type ConversationEntry,
  type Result,
  type StructuredField,
  type StructuredValue,
} from "@agent/core";
import type { ModelStreamEvent, ModelToolCall, ThinkingEffort } from "@agent/runtime";
import {
  BooleanSchema,
  IntegerSchema,
  ListSchema,
  LiteralStringSchema,
  StringSchema,
  UnionSchema,
  type ObjectSchemaField,
  type ToolDescriptor,
  type ToolSchema,
} from "@agent/tools";

import { OPENAI_PROVIDER_LIMITS } from "./limits.js";
import type { OpenAIModelId } from "./models.js";
import type { SseEvent } from "./sse.js";

export type OpenAIWireError = Readonly<{
  kind: "limit" | "protocolMessage" | "protocolTerminal" |
    "protocolToolCall" | "request";
}>;

function failure(kind: OpenAIWireError["kind"]): OpenAIWireError {
  return Object.freeze({ kind });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function structuredValue(value: StructuredValue): unknown {
  if (value instanceof StructuredList) {
    return value.values.map((item) => structuredValue(item));
  }
  if (value instanceof StructuredObject) {
    return Object.fromEntries(value.fields.map((field) => structuredEntry(field)));
  }
  return value;
}

function structuredEntry(field: StructuredField) {
  return Object.freeze([field.name, structuredValue(field.value)] as const);
}

function schemaEntry(field: ObjectSchemaField) {
  return Object.freeze([
    field.name,
    Object.freeze({
      ...schemaValue(field.schema) as object,
      description: field.description,
    }),
  ] as const);
}

function schemaValue(schema: ToolSchema): unknown {
  if (schema instanceof LiteralStringSchema) {
    return Object.freeze({ const: schema.value, type: "string" });
  }
  if (schema instanceof StringSchema) {
    return Object.freeze({
      maxLength: schema.maximum,
      minLength: schema.minimum,
      type: "string",
    });
  }
  if (schema instanceof IntegerSchema) {
    return Object.freeze({
      maximum: schema.maximum,
      minimum: schema.minimum,
      type: "integer",
    });
  }
  if (schema instanceof BooleanSchema) return Object.freeze({ type: "boolean" });
  if (schema instanceof ListSchema) {
    return Object.freeze({
      items: schemaValue(schema.item),
      maxItems: schema.maximum,
      minItems: schema.minimum,
      type: "array",
    });
  }
  if (schema instanceof UnionSchema) {
    return Object.freeze({
      oneOf: Object.freeze(schema.variants.map((variant) => schemaValue(variant))),
    });
  }
  return Object.freeze({
    additionalProperties: false,
    properties: Object.fromEntries(schema.fields.map((field) => schemaEntry(field))),
    required: schema.fields.filter((field) => field.required).map((field) => field.name),
    type: "object",
  });
}

function toolValue(descriptor: ToolDescriptor): unknown {
  return Object.freeze({
    description: descriptor.description,
    name: descriptor.name,
    parameters: schemaValue(descriptor.input),
    strict: false,
    type: "function",
  });
}

function textItem(role: Role, text: string): unknown {
  return Object.freeze({
    content: Object.freeze([Object.freeze({
      text,
      type: role === Role.Assistant ? "output_text" : "input_text",
    })]),
    role,
    type: "message",
  });
}

function messageValues(entry: ConversationEntry): readonly unknown[] {
  if (entry instanceof Message) {
    return Object.freeze([textItem(entry.role, entry.content)]);
  }
  if (entry instanceof ToolExchange) {
    const assistant = entry.assistant === undefined
      ? Object.freeze([])
      : Object.freeze([textItem(Role.Assistant, entry.assistant.content)]);
    const calls = entry.calls.map((call) => Object.freeze({
      arguments: JSON.stringify(structuredValue(call.input)),
      call_id: call.callId,
      name: call.name,
      type: "function_call",
    }));
    const outputs = entry.results.map((result) => Object.freeze({
      call_id: result.callId,
      output: JSON.stringify(Object.freeze({
        output: structuredValue(result.output),
        status: result.status,
      })),
      type: "function_call_output",
    }));
    return Object.freeze([...assistant, ...calls, ...outputs]);
  }
  throw new Error("owned conversation invariant");
}

/** Encodes one canonical candidate without provider-private reasoning state. */
export function encodeOpenAIRequest(
  conversation: Conversation,
  instructions: string,
  tools: readonly ToolDescriptor[],
  model: OpenAIModelId,
  thinkingEffort: ThinkingEffort,
): Result<string, OpenAIWireError> {
  try {
    const body = JSON.stringify(Object.freeze({
      include: Object.freeze([]),
      input: Object.freeze(conversation.entries.flatMap((entry) => messageValues(entry))),
      instructions,
      model,
      parallel_tool_calls: false,
      reasoning: thinkingEffort === "off"
        ? null
        : Object.freeze({ effort: thinkingEffort, summary: "auto" }),
      store: false,
      stream: true,
      tool_choice: "auto",
      tools: Object.freeze(tools.map((tool) => toolValue(tool))),
    }));
    return body.length <= OPENAI_PROVIDER_LIMITS.requestCodeUnits
      ? ok(body)
      : err(failure("limit"));
  } catch (_cause: unknown) {
    return err(failure("request"));
  }
}

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;
type OutputKind = "function_call" | "message" | "reasoning";
type PartPhase = "added" | "done" | "none" | "textDone";
type OutputState = {
  argumentDone: string | undefined;
  callId: string | undefined;
  contentIndex: number | undefined;
  contentPhase: PartPhase;
  contentText: string;
  done: boolean;
  id: string;
  kind: OutputKind;
  name: string | undefined;
  outputIndex: number;
  summaryIndex: number | undefined;
  summaryPhase: PartPhase;
  summaryText: string;
};

function validIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 &&
    (value as number) < OPENAI_PROVIDER_LIMITS.wireEvents;
}

function validWireId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 &&
    !/\p{Cc}/u.test(value);
}

function validUsage(value: unknown, depth = 0): boolean {
  if (!isRecord(value) || depth > 4 || Object.keys(value).length > 32) return false;
  return Object.values(value).every((member) => {
    if (typeof member === "number") return Number.isSafeInteger(member) && member >= 0;
    return validUsage(member, depth + 1);
  });
}

function validResponse(
  value: unknown,
  expectedId: string | undefined,
  status: "completed" | "in_progress",
): value is Record<string, unknown> {
  return isRecord(value) && validWireId(value.id) &&
    (expectedId === undefined || value.id === expectedId) &&
    value.object === "response" && value.status === status &&
    (value.usage === undefined || validUsage(value.usage));
}

function outputKind(value: unknown): value is OutputKind {
  return value === "function_call" || value === "message" || value === "reasoning";
}

/** Stateful decoder for the strict Responses SSE event subset. */
export class OpenAIResponsesDecoder {
  readonly #exposeReasoning: boolean;
  #answerStarted = false;
  #created = false;
  #inProgress = false;
  #responseId: string | undefined;
  #reasoningCodeUnits = 0;
  #argumentCodeUnits = 0;
  #argumentDeltaCodeUnits = 0;
  readonly #argumentDeltas = new Map<string, string>();
  #rejected = false;
  #terminal = false;
  readonly #calls: ModelToolCall[] = [];
  readonly #callIds = new Set<string>();
  readonly #outputs = new Map<string, OutputState>();
  readonly #outputIndices = new Set<number>();

  constructor(exposeReasoning: boolean) {
    this.#exposeReasoning = exposeReasoning;
  }

  accept(event: SseEvent): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    if (this.#terminal || this.#rejected) return err(failure("protocolTerminal"));
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data) as unknown;
    } catch (_cause: unknown) {
      return this.#reject("protocolMessage");
    }
    if (!isRecord(parsed) || typeof parsed.type !== "string" ||
      (event.event !== undefined && event.event !== parsed.type)) {
      return this.#reject("protocolMessage");
    }
    const type = parsed.type;
    if (type === "response.created") {
      if (this.#created || !validResponse(parsed.response, undefined, "in_progress")) {
        return this.#reject("protocolMessage");
      }
      this.#created = true;
      this.#responseId = parsed.response.id as string;
      return ok(Object.freeze([]));
    }
    if (!this.#created) return this.#reject("protocolMessage");
    if (type === "response.in_progress") {
      if (this.#inProgress || this.#outputs.size !== 0 ||
        !validResponse(parsed.response, this.#responseId, "in_progress")) {
        return this.#reject("protocolMessage");
      }
      this.#inProgress = true;
      return ok(Object.freeze([]));
    }
    if (type === "response.output_item.added") return this.#outputItemAdded(parsed);
    if (type === "response.content_part.added") return this.#contentPart(parsed, false);
    if (type === "response.content_part.done") return this.#contentPart(parsed, true);
    if (type === "response.reasoning_summary_part.added") {
      return this.#summaryPart(parsed, false);
    }
    if (type === "response.reasoning_summary_part.done") {
      return this.#summaryPart(parsed, true);
    }
    if (type === "response.reasoning_summary_text.delta" ||
      type === "response.reasoning_text.delta") {
      return this.#textDelta(parsed, true);
    }
    if (type === "response.output_text.delta") {
      return this.#textDelta(parsed, false);
    }
    if (type === "response.reasoning_summary_text.done") {
      return this.#textDone(parsed, "summary");
    }
    if (type === "response.reasoning_text.done") {
      return this.#textDone(parsed, "reasoning");
    }
    if (type === "response.output_text.done") {
      return this.#textDone(parsed, "answer");
    }
    if (type === "response.function_call_arguments.delta") {
      const state = this.#outputState(parsed, "function_call");
      if (state === undefined || state.done || state.argumentDone !== undefined ||
        typeof parsed.delta !== "string" || parsed.delta.length < 1) {
        return this.#reject("protocolToolCall");
      }
      this.#argumentDeltaCodeUnits += parsed.delta.length;
      this.#argumentDeltas.set(
        state.id,
        (this.#argumentDeltas.get(state.id) ?? "") + parsed.delta,
      );
      return this.#argumentDeltaCodeUnits <= OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits
        ? ok(Object.freeze([]))
        : this.#reject("limit");
    }
    if (type === "response.function_call_arguments.done") {
      const state = this.#outputState(parsed, "function_call");
      if (state === undefined || state.done || state.argumentDone !== undefined ||
        parsed.name !== state.name || typeof parsed.arguments !== "string" ||
        parsed.arguments.length < 2 || parsed.arguments.length >
          OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits) {
        return this.#reject("protocolToolCall");
      }
      const accumulated = this.#argumentDeltas.get(state.id);
      if (accumulated !== undefined && accumulated !== parsed.arguments) {
        return this.#reject("protocolToolCall");
      }
      this.#argumentDeltas.delete(state.id);
      state.argumentDone = parsed.arguments;
      return ok(Object.freeze([]));
    }
    if (type === "response.output_item.done") {
      return this.#outputItem(parsed.item);
    }
    if (type === "response.completed") {
      if (this.#argumentDeltas.size !== 0 ||
        [...this.#outputs.values()].some((state) => !state.done) ||
        !validResponse(parsed.response, this.#responseId, "completed")) {
        return this.#reject("protocolTerminal");
      }
      this.#terminal = true;
      return ok(Object.freeze([
        this.#calls.length === 0
          ? Object.freeze({ kind: "done" as const })
          : Object.freeze({ calls: Object.freeze([...this.#calls]), kind: "toolCalls" as const }),
      ]));
    }
    if (type === "response.failed" || type === "response.incomplete" || type === "error") {
      return this.#reject("protocolTerminal");
    }
    return this.#reject("protocolMessage");
  }

  end(): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    return this.#terminal && !this.#rejected
      ? ok(Object.freeze([]))
      : err(failure("protocolTerminal"));
  }

  #textDelta(
    parsed: Record<string, unknown>,
    reasoning: boolean,
  ): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    const state = this.#outputState(parsed, reasoning ? "reasoning" : "message");
    const summary = parsed.type === "response.reasoning_summary_text.delta";
    const phase = summary ? state?.summaryPhase : state?.contentPhase;
    const index = summary ? parsed.summary_index : parsed.content_index;
    const expectedIndex = summary ? state?.summaryIndex : state?.contentIndex;
    const value = parsed.delta;
    if (typeof value !== "string" || value.length < 1 || (reasoning && this.#answerStarted)) {
      return this.#reject("protocolMessage");
    }
    if (state === undefined || state.done || phase !== "added" || index !== expectedIndex) {
      return this.#reject("protocolMessage");
    }
    if (reasoning) {
      this.#reasoningCodeUnits += value.length;
      if (this.#reasoningCodeUnits > OPENAI_PROVIDER_LIMITS.reasoningCodeUnits) {
        return this.#reject("limit");
      }
      if (summary) state.summaryText += value;
      else state.contentText += value;
      return this.#exposeReasoning
        ? ok(Object.freeze([Object.freeze({ kind: "reasoningDelta" as const, text: value })]))
        : ok(Object.freeze([]));
    }
    this.#answerStarted = true;
    state.contentText += value;
    return ok(Object.freeze([Object.freeze({ kind: "delta" as const, text: value })]));
  }

  #outputState(
    parsed: Record<string, unknown>,
    kind: OutputKind,
  ): OutputState | undefined {
    if (!validWireId(parsed.item_id) || !validIndex(parsed.output_index)) return undefined;
    const state = this.#outputs.get(parsed.item_id);
    return state !== undefined && state.kind === kind &&
      state.outputIndex === parsed.output_index ? state : undefined;
  }

  #outputItemAdded(
    parsed: Record<string, unknown>,
  ): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    if (!validIndex(parsed.output_index) || !isRecord(parsed.item) ||
      !validWireId(parsed.item.id) || !outputKind(parsed.item.type) ||
      parsed.item.status !== "in_progress" || this.#outputs.has(parsed.item.id) ||
      this.#outputIndices.has(parsed.output_index)) {
      return this.#reject("protocolMessage");
    }
    if (parsed.item.type === "message" &&
      (parsed.item.role !== "assistant" || !Array.isArray(parsed.item.content) ||
        parsed.item.content.length !== 0)) return this.#reject("protocolMessage");
    if (parsed.item.type === "reasoning" &&
      (!Array.isArray(parsed.item.summary) || parsed.item.summary.length !== 0 ||
        parsed.item.encrypted_content !== undefined)) return this.#reject("protocolMessage");
    if (parsed.item.type === "function_call" &&
      (!validWireId(parsed.item.call_id) || typeof parsed.item.name !== "string" ||
        !VALID_TOOL_NAME.test(parsed.item.name) || parsed.item.arguments !== "")) {
      return this.#reject("protocolToolCall");
    }
    const state: OutputState = {
      argumentDone: undefined,
      callId: parsed.item.type === "function_call" ? parsed.item.call_id as string : undefined,
      contentIndex: undefined,
      contentPhase: "none",
      contentText: "",
      done: false,
      id: parsed.item.id,
      kind: parsed.item.type,
      name: parsed.item.type === "function_call" ? parsed.item.name as string : undefined,
      outputIndex: parsed.output_index,
      summaryIndex: undefined,
      summaryPhase: "none",
      summaryText: "",
    };
    this.#outputs.set(state.id, state);
    this.#outputIndices.add(state.outputIndex);
    return ok(Object.freeze([]));
  }

  #contentPart(
    parsed: Record<string, unknown>,
    done: boolean,
  ): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    const message = this.#outputState(parsed, "message");
    const reasoning = this.#outputState(parsed, "reasoning");
    const state = message ?? reasoning;
    if (state === undefined || state.done || !validIndex(parsed.content_index) ||
      !isRecord(parsed.part)) return this.#reject("protocolMessage");
    const expectedType = state.kind === "message" ? "output_text" : "reasoning_text";
    if (parsed.part.type !== expectedType || typeof parsed.part.text !== "string") {
      return this.#reject("protocolMessage");
    }
    if (!done) {
      if (state.contentPhase !== "none" || parsed.part.text !== "") {
        return this.#reject("protocolMessage");
      }
      state.contentIndex = parsed.content_index;
      state.contentPhase = "added";
      return ok(Object.freeze([]));
    }
    if (state.contentPhase !== "textDone" || parsed.content_index !== state.contentIndex ||
      parsed.part.text !== state.contentText) return this.#reject("protocolMessage");
    state.contentPhase = "done";
    return ok(Object.freeze([]));
  }

  #summaryPart(
    parsed: Record<string, unknown>,
    done: boolean,
  ): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    const state = this.#outputState(parsed, "reasoning");
    if (state === undefined || state.done || !validIndex(parsed.summary_index) ||
      !isRecord(parsed.part) || parsed.part.type !== "summary_text" ||
      typeof parsed.part.text !== "string") return this.#reject("protocolMessage");
    if (!done) {
      if (state.summaryPhase !== "none" || parsed.part.text !== "") {
        return this.#reject("protocolMessage");
      }
      state.summaryIndex = parsed.summary_index;
      state.summaryPhase = "added";
      return ok(Object.freeze([]));
    }
    if (state.summaryPhase !== "textDone" || parsed.summary_index !== state.summaryIndex ||
      parsed.part.text !== state.summaryText) return this.#reject("protocolMessage");
    state.summaryPhase = "done";
    return ok(Object.freeze([]));
  }

  #textDone(
    parsed: Record<string, unknown>,
    family: "answer" | "reasoning" | "summary",
  ): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    const state = this.#outputState(parsed, family === "answer" ? "message" : "reasoning");
    const phase = family === "summary" ? state?.summaryPhase : state?.contentPhase;
    const expectedIndex = family === "summary" ? state?.summaryIndex : state?.contentIndex;
    const index = family === "summary" ? parsed.summary_index : parsed.content_index;
    const text = family === "summary" ? state?.summaryText : state?.contentText;
    if (state === undefined || state.done || phase !== "added" || index !== expectedIndex ||
      typeof parsed.text !== "string" || parsed.text !== text) {
      return this.#reject("protocolMessage");
    }
    if (family === "summary") state.summaryPhase = "textDone";
    else state.contentPhase = "textDone";
    return ok(Object.freeze([]));
  }

  #outputItem(value: unknown): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    if (!isRecord(value) || !outputKind(value.type) || !validWireId(value.id)) {
      return this.#reject("protocolMessage");
    }
    const state = this.#outputs.get(value.id);
    if (state === undefined || state.done || state.kind !== value.type ||
      value.status !== "completed") return this.#reject("protocolMessage");
    if (value.type === "reasoning") {
      if (value.encrypted_content !== undefined || !Array.isArray(value.summary) ||
        (state.summaryPhase !== "none" && state.summaryPhase !== "done") ||
        (state.contentPhase !== "none" && state.contentPhase !== "done")) {
        return this.#reject("protocolMessage");
      }
      state.done = true;
      return ok(Object.freeze([]));
    }
    if (value.type === "message") {
      const content = Array.isArray(value.content) ? value.content : undefined;
      const part = content?.at(0);
      if (value.role !== "assistant" || content?.length !== 1 || !isRecord(part) ||
        part.type !== "output_text" || part.text !== state.contentText ||
        state.contentPhase !== "done") return this.#reject("protocolMessage");
      state.done = true;
      return ok(Object.freeze([]));
    }
    if (value.type !== "function_call" || typeof value.call_id !== "string" ||
      value.call_id.length < 1 || value.call_id.length > 128 || /\p{Cc}/u.test(value.call_id) ||
      typeof value.name !== "string" || !VALID_TOOL_NAME.test(value.name) ||
      typeof value.arguments !== "string" || value.arguments.length < 2 ||
      value.call_id !== state.callId || value.name !== state.name ||
      (state.argumentDone !== undefined && value.arguments !== state.argumentDone) ||
      this.#callIds.has(value.call_id) ||
      this.#calls.length >= OPENAI_PROVIDER_LIMITS.toolCallsPerBatch) {
      return this.#reject("protocolToolCall");
    }
    this.#argumentCodeUnits += value.arguments.length;
    if (this.#argumentCodeUnits > OPENAI_PROVIDER_LIMITS.toolArgumentCodeUnits) {
      return this.#reject("limit");
    }
    let input: unknown;
    try {
      input = JSON.parse(value.arguments) as unknown;
    } catch (_cause: unknown) {
      return this.#reject("protocolToolCall");
    }
    const structured = structuredValueFromUnknown(input);
    if (!structured.ok || !(structured.value instanceof StructuredObject)) {
      return this.#reject("protocolToolCall");
    }
    this.#callIds.add(value.call_id);
    this.#calls.push(Object.freeze({
      callId: value.call_id,
      input: structured.value,
      name: value.name,
    }));
    state.done = true;
    return ok(Object.freeze([]));
  }

  #reject(kind: OpenAIWireError["kind"]): Result<readonly ModelStreamEvent[], OpenAIWireError> {
    this.#rejected = true;
    return err(failure(kind));
  }
}
