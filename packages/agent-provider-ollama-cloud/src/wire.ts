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
  UnionSchema,
  type ObjectSchemaField,
  type ToolDescriptor,
  type ToolSchema,
} from "@agent/tools";

import { OLLAMA_CLOUD_LIMITS } from "./limits.js";
import type { OllamaCloudModelId } from "./models.js";

export type WireError = Readonly<{
  kind:
    | "finishReason"
    | "limit"
    | "protocolEnvelope"
    | "protocolMessage"
    | "protocolTerminal"
    | "protocolToolCall"
    | "request";
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
  if (schema instanceof UnionSchema) {
    return Object.freeze({
      oneOf: Object.freeze(
        schema.variants.map((variant) => schemaValue(variant)),
      ),
    });
  }
  return Object.freeze({
    additionalProperties: false,
    properties: Object.fromEntries(
      schema.fields.map((field) => schemaEntry(field)),
    ),
    required: schema.fields
      .filter((field) => field.required)
      .map((field) => field.name),
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
    return Object.freeze([
      Object.freeze({
        content: entry.assistant?.content ?? "",
        role: Role.Assistant,
        tool_calls: Object.freeze(
          entry.calls.map((call, index) => Object.freeze({
            function: Object.freeze({
              arguments: structuredValue(call.input),
              index,
              name: call.name,
            }),
            type: "function",
          })),
        ),
      }),
      ...entry.results.map((result) => Object.freeze({
        content: JSON.stringify(Object.freeze({
          output: structuredValue(result.output),
          status: result.status,
        })),
        role: "tool",
        tool_name: result.name,
      })),
    ]);
  }
  throw new Error("owned conversation invariant");
}

/** Encodes one immutable runtime snapshot into the native Ollama Chat shape. */
export function encodeRequest(
  conversation: Conversation,
  instructions: string,
  tools: readonly ToolDescriptor[],
  model: OllamaCloudModelId,
): Result<string, WireError> {
  try {
    const request = Object.freeze({
      messages: Object.freeze([
        Object.freeze({ content: instructions, role: Role.System }),
        ...conversation.entries.flatMap((entry) => messageValues(entry)),
      ]),
      model,
      stream: true,
      think: false,
      ...(tools.length === 0
        ? Object.freeze({})
        : Object.freeze({ tools: tools.map((tool) => toolValue(tool)) })),
    });
    const body = JSON.stringify(request);
    return body.length <= OLLAMA_CLOUD_LIMITS.requestCodeUnits
      ? ok(body)
      : err(failure("limit"));
  } catch (_cause: unknown) {
    return err(failure("request"));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

/** Stateful validator for one native Ollama NDJSON chat response. */
export class OllamaChatDecoder {
  readonly #model: OllamaCloudModelId;
  #hasContribution = false;
  #terminal = false;
  #thinkingCodeUnits = 0;
  #toolArgumentCodeUnits = 0;
  readonly #tools: ModelToolCall[] = [];
  #wireEvents = 0;

  constructor(model: OllamaCloudModelId) {
    this.#model = model;
  }

  accept(data: string): Result<readonly ModelStreamEvent[], WireError> {
    if (this.#terminal || typeof data !== "string") {
      return err(failure("protocolTerminal"));
    }
    this.#wireEvents += 1;
    if (this.#wireEvents > OLLAMA_CLOUD_LIMITS.wireEvents) {
      return err(failure("limit"));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch (_cause: unknown) {
      return err(failure("protocolEnvelope"));
    }
    if (
      !isRecord(parsed) ||
      parsed.model !== this.#model ||
      typeof parsed.done !== "boolean" ||
      !isRecord(parsed.message) ||
      parsed.message.role !== Role.Assistant
    ) {
      return err(failure("protocolEnvelope"));
    }

    const message = parsed.message;
    const content = message.content;
    if (typeof content !== "string") {
      return err(failure("protocolMessage"));
    }
    if (message.thinking !== undefined && message.thinking !== null) {
      if (typeof message.thinking !== "string") {
        return err(failure("protocolMessage"));
      }
      this.#thinkingCodeUnits += message.thinking.length;
      if (this.#thinkingCodeUnits > OLLAMA_CLOUD_LIMITS.thinkingCodeUnits) {
        return err(failure("limit"));
      }
      if (message.thinking.length > 0) {
        this.#hasContribution = true;
      }
    }
    if (message.tool_calls !== undefined && message.tool_calls !== null) {
      const toolCount = this.#tools.length;
      const accepted = this.#acceptTools(message.tool_calls);
      if (!accepted.ok) {
        return accepted;
      }
      if (this.#tools.length > toolCount) {
        this.#hasContribution = true;
      }
    }

    const events: ModelStreamEvent[] = [];
    if (content.length > 0) {
      this.#hasContribution = true;
      events.push(Object.freeze({
        kind: "delta" as const,
        text: content,
      }));
    }
    if (!parsed.done) {
      return ok(Object.freeze(events));
    }
    if (
      parsed.done_reason !== undefined &&
      parsed.done_reason !== null &&
      parsed.done_reason !== "stop"
    ) {
      return err(failure("finishReason"));
    }
    events.push(this.#complete());
    return ok(Object.freeze(events));
  }

  end(): Result<readonly ModelStreamEvent[], WireError> {
    if (this.#terminal) {
      return ok(Object.freeze([]));
    }
    return this.#hasContribution
      ? ok(Object.freeze([this.#complete()]))
      : err(failure("protocolTerminal"));
  }

  #complete(): ModelStreamEvent {
    this.#terminal = true;
    return this.#tools.length === 0
      ? Object.freeze({ kind: "done" as const })
      : Object.freeze({
          calls: Object.freeze([...this.#tools]),
          kind: "toolCalls" as const,
        });
  }

  #acceptTools(value: unknown): Result<void, WireError> {
    if (!Array.isArray(value)) {
      return err(failure("protocolToolCall"));
    }
    if (value.length === 0) {
      return ok(undefined);
    }
    if (
      this.#tools.length + value.length >
      OLLAMA_CLOUD_LIMITS.toolCallsPerBatch
    ) {
      return err(failure("limit"));
    }
    for (const item of value) {
      if (
        !isRecord(item) ||
        (item.type !== undefined && item.type !== "function") ||
        !isRecord(item.function)
      ) {
        return err(failure("protocolToolCall"));
      }
      const name = item.function.name;
      const input = item.function.arguments;
      const index = item.function.index;
      const expectedIndex = this.#tools.length;
      if (typeof name !== "string" || !VALID_TOOL_NAME.test(name)) {
        return err(failure("protocolToolCall"));
      }
      if (
        index !== undefined &&
        (
          typeof index !== "number" ||
          !Number.isSafeInteger(index) ||
          index < 0 ||
          index !== expectedIndex
        )
      ) {
        return err(failure("protocolToolCall"));
      }
      if (!isRecord(input)) {
        return err(failure("protocolToolCall"));
      }
      let encoded: string;
      try {
        encoded = JSON.stringify(input);
      } catch (_cause: unknown) {
        return err(failure("protocolToolCall"));
      }
      this.#toolArgumentCodeUnits += encoded.length;
      if (
        encoded.length > OLLAMA_CLOUD_LIMITS.toolArgumentCodeUnits ||
        this.#toolArgumentCodeUnits >
          OLLAMA_CLOUD_LIMITS.toolBatchArgumentCodeUnits
      ) {
        return err(failure("limit"));
      }
      const structured = structuredValueFromUnknown(input);
      if (!structured.ok || !(structured.value instanceof StructuredObject)) {
        return err(failure("protocolToolCall"));
      }
      this.#tools.push(Object.freeze({
        callId: "ollama-call-" + String(this.#tools.length + 1),
        input: structured.value,
        name,
      }));
    }
    return ok(undefined);
  }
}
