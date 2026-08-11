import {
  Message,
  Role,
  StructuredList,
  StructuredObject,
  type StructuredValue,
  ToolExchange,
  err,
  ok,
  structuredValueFromUnknown,
  type Conversation,
  type ConversationEntry,
  type Result,
  type StructuredField,
} from "@agent/core";
import type { ModelStreamEvent, ModelToolCall } from "@agent/runtime";
import {
  BooleanSchema,
  IntegerSchema,
  ListSchema,
  LiteralStringSchema,
  StringSchema,
  type ObjectSchemaField,
  type ToolDescriptor,
  type ToolSchema,
} from "@agent/tools";

import { OPENCODE_GO_LIMITS } from "./limits.js";

export const OPENCODE_GO_MODEL = "kimi-k2.7-code";

export type WireError = Readonly<{
  kind: "finishReason" | "limit" | "protocol" | "request";
}>;

function failure(kind: WireError["kind"]): WireError {
  return Object.freeze({ kind });
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
  if (schema instanceof BooleanSchema) {
    return Object.freeze({ type: "boolean" });
  }
  if (schema instanceof ListSchema) {
    return Object.freeze({
      items: schemaValue(schema.item),
      maxItems: schema.maximum,
      minItems: schema.minimum,
      type: "array",
    });
  }
  const required = schema.fields
    .filter((field) => field.required)
    .map((field) => field.name);
  const properties = Object.fromEntries(
    schema.fields.map((field) => schemaEntry(field)),
  );
  return Object.freeze({
    additionalProperties: false,
    properties,
    required,
    type: "object",
  });
}

function toolValue(descriptor: ToolDescriptor): unknown {
  return Object.freeze({
    function: Object.freeze({
      description: descriptor.description,
      name: descriptor.name,
      parameters: schemaValue(descriptor.input),
    }),
    type: "function",
  });
}

function messageValues(entry: ConversationEntry): readonly unknown[] {
  if (entry instanceof Message) {
    return Object.freeze([
      Object.freeze({ content: entry.content, role: entry.role }),
    ]);
  }
  if (entry instanceof ToolExchange) {
    const assistant = Object.freeze({
      content: entry.assistant?.content ?? null,
      role: "assistant",
      tool_calls: Object.freeze(
        entry.calls.map((call) => Object.freeze({
          function: Object.freeze({
            arguments: JSON.stringify(structuredValue(call.input)),
            name: call.name,
          }),
          id: call.callId,
          type: "function",
        })),
      ),
    });
    return Object.freeze([
      assistant,
      ...entry.results.map((result) => Object.freeze({
        content: JSON.stringify(
          Object.freeze({
            output: structuredValue(result.output),
            status: result.status,
          }),
        ),
        role: "tool",
        tool_call_id: result.callId,
      })),
    ]);
  }
  throw new Error("owned conversation invariant");
}

/** Encodes one immutable runtime snapshot into the fixed Go request shape. */
export function encodeRequest(
  conversation: Conversation,
  instructions: string,
  tools: readonly ToolDescriptor[],
): Result<string, WireError> {
  try {
    const messages = [
      Object.freeze({ content: instructions, role: Role.System }),
      ...conversation.entries.flatMap((entry) => messageValues(entry)),
    ];
    const request =
      tools.length === 0
        ? Object.freeze({
            messages,
            model: OPENCODE_GO_MODEL,
            stream: true,
          })
        : Object.freeze({
            messages,
            model: OPENCODE_GO_MODEL,
            parallel_tool_calls: true,
            stream: true,
            tools: tools.map((tool) => toolValue(tool)),
          });
    const body = JSON.stringify(request);
    return body.length <= OPENCODE_GO_LIMITS.requestCodeUnits
      ? ok(body)
      : err(failure("limit"));
  } catch (_cause: unknown) {
    return err(failure("request"));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ToolAssembly = {
  argumentParts: string[];
  argumentCodeUnits: number;
  callIdParts: string[];
  callIdCodeUnits: number;
  nameParts: string[];
  nameCodeUnits: number;
};

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

/** Stateful validator for one streamed Chat Completions response. */
export class ChatCompletionDecoder {
  #terminal = false;
  #toolArgumentCodeUnits = 0;
  readonly #tools: ToolAssembly[] = [];
  #wireEvents = 0;

  accept(data: string): Result<readonly ModelStreamEvent[], WireError> {
    if (this.#terminal || typeof data !== "string") {
      return err(failure("protocol"));
    }
    this.#wireEvents += 1;
    if (this.#wireEvents > OPENCODE_GO_LIMITS.wireEvents) {
      return err(failure("limit"));
    }
    if (data === "[DONE]") {
      if (this.#tools.length > 0) {
        return err(failure("protocol"));
      }
      this.#terminal = true;
      return ok(
        Object.freeze([Object.freeze({ kind: "done" as const })]),
      );
    }
    if (data.length > OPENCODE_GO_LIMITS.sseDataCodeUnits) {
      return err(failure("limit"));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch (_cause: unknown) {
      return err(failure("protocol"));
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.choices)) {
      return err(failure("protocol"));
    }
    if (parsed.choices.length !== 1) {
      return err(failure("protocol"));
    }
    const choice = parsed.choices.at(0);
    if (
      !isRecord(choice) ||
      choice.index !== 0 ||
      !isRecord(choice.delta)
    ) {
      return err(failure("protocol"));
    }
    const delta = choice.delta;
    if (
      delta.role !== undefined &&
      delta.role !== null &&
      delta.role !== Role.Assistant
    ) {
      return err(failure("protocol"));
    }

    const events: ModelStreamEvent[] = [];
    if (delta.content !== undefined && delta.content !== null) {
      if (typeof delta.content !== "string") {
        return err(failure("protocol"));
      }
      if (delta.content.length > 0) {
        events.push(
          Object.freeze({ kind: "delta" as const, text: delta.content }),
        );
      }
    }
    if (delta.tool_calls !== undefined && delta.tool_calls !== null) {
      const assembled = this.#acceptToolFragment(delta.tool_calls);
      if (!assembled.ok) {
        return assembled;
      }
    }

    const finishReason = choice.finish_reason;
    if (finishReason !== undefined && finishReason !== null) {
      if (finishReason === "stop") {
        if (this.#tools.length > 0) {
          return err(failure("protocol"));
        }
        this.#terminal = true;
        events.push(Object.freeze({ kind: "done" as const }));
      } else if (finishReason === "tool_calls") {
        const toolCalls = this.#finishTools();
        if (!toolCalls.ok) {
          return toolCalls;
        }
        this.#terminal = true;
        events.push(toolCalls.value);
      } else {
        return err(failure("finishReason"));
      }
    }
    return ok(Object.freeze(events));
  }

  end(): Result<readonly ModelStreamEvent[], WireError> {
    if (this.#terminal) {
      return ok(Object.freeze([]));
    }
    return err(failure("protocol"));
  }

  #acceptToolFragment(value: unknown): Result<void, WireError> {
    if (
      !Array.isArray(value) ||
      value.length === 0 ||
      value.length > OPENCODE_GO_LIMITS.toolCallsPerBatch
    ) {
      return err(failure("protocol"));
    }
    const seen = new Set<number>();
    for (const fragment of value) {
      if (!isRecord(fragment)) {
        return err(failure("protocol"));
      }
      const index = fragment.index;
      if (
        typeof index !== "number" ||
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= OPENCODE_GO_LIMITS.toolCallsPerBatch ||
        seen.has(index) ||
        index > this.#tools.length
      ) {
        return err(failure("protocol"));
      }
      seen.add(index);
      if (
        fragment.type !== undefined &&
        fragment.type !== null &&
        fragment.type !== "function"
      ) {
        return err(failure("protocol"));
      }
      const assembly =
        index === this.#tools.length
          ? {
              argumentCodeUnits: 0,
              argumentParts: [],
              callIdCodeUnits: 0,
              callIdParts: [],
              nameCodeUnits: 0,
              nameParts: [],
            }
          : this.#tools.at(index);
      if (assembly === undefined) {
        return err(failure("protocol"));
      }
      let contributed = false;
      if (fragment.id !== undefined && fragment.id !== null) {
        if (typeof fragment.id !== "string" || fragment.id.length === 0) {
          return err(failure("protocol"));
        }
        assembly.callIdCodeUnits += fragment.id.length;
        if (assembly.callIdCodeUnits > 128 || /\p{Cc}/u.test(fragment.id)) {
          return err(failure("protocol"));
        }
        assembly.callIdParts.push(fragment.id);
        contributed = true;
      }
      const functionFragment = fragment.function;
      if (functionFragment !== undefined && functionFragment !== null) {
        if (!isRecord(functionFragment)) {
          return err(failure("protocol"));
        }
        const name = functionFragment.name;
        if (name !== undefined && name !== null) {
          if (typeof name !== "string" || name.length === 0) {
            return err(failure("protocol"));
          }
          assembly.nameCodeUnits += name.length;
          if (assembly.nameCodeUnits > 64) {
            return err(failure("protocol"));
          }
          assembly.nameParts.push(name);
          contributed = true;
        }
        const argument = functionFragment.arguments;
        if (argument !== undefined && argument !== null) {
          if (typeof argument !== "string") {
            return err(failure("protocol"));
          }
          assembly.argumentCodeUnits += argument.length;
          this.#toolArgumentCodeUnits += argument.length;
          if (
            assembly.argumentCodeUnits > OPENCODE_GO_LIMITS.toolArgumentCodeUnits ||
            this.#toolArgumentCodeUnits >
              OPENCODE_GO_LIMITS.toolBatchArgumentCodeUnits
          ) {
            return err(failure("limit"));
          }
          assembly.argumentParts.push(argument);
          contributed = true;
        }
      }
      if (
        !contributed ||
        (index === this.#tools.length && this.#tools.length >=
          OPENCODE_GO_LIMITS.toolCallsPerBatch)
      ) {
        return err(failure("protocol"));
      }
      if (index === this.#tools.length) {
        this.#tools.push(assembly);
      }
    }
    return ok(undefined);
  }

  #finishTools(): Result<Extract<ModelStreamEvent, { kind: "toolCalls" }>, WireError> {
    if (this.#tools.length === 0) {
      return err(failure("protocol"));
    }
    const callIds = new Set<string>();
    const calls: ModelToolCall[] = [];
    for (const assembly of this.#tools) {
      const callId = assembly.callIdParts.join("");
      const name = assembly.nameParts.join("");
      if (
        callId.length === 0 ||
        /\p{Cc}/u.test(callId) ||
        !VALID_TOOL_NAME.test(name) ||
        callIds.has(callId)
      ) {
        return err(failure("protocol"));
      }
      let input: unknown;
      try {
        input = JSON.parse(assembly.argumentParts.join("")) as unknown;
      } catch (_cause: unknown) {
        return err(failure("protocol"));
      }
      const structured = structuredValueFromUnknown(input);
      if (!structured.ok || !(structured.value instanceof StructuredObject)) {
        return err(failure("protocol"));
      }
      callIds.add(callId);
      calls.push(Object.freeze({ callId, input: structured.value, name }));
    }
    return ok(
      Object.freeze({
        calls: Object.freeze(calls),
        kind: "toolCalls" as const,
      }),
    );
  }
}
