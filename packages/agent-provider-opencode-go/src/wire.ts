import {
  Message,
  Role,
  StructuredList,
  StructuredObject,
  type StructuredValue,
  ToolCall,
  ToolResult,
  err,
  ok,
  structuredValueFromUnknown,
  type Conversation,
  type ConversationEntry,
  type Result,
  type StructuredField,
} from "@agent/core";
import type { ModelStreamEvent } from "@agent/runtime";
import {
  BooleanSchema,
  IntegerSchema,
  ListSchema,
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

function messageValue(entry: ConversationEntry): unknown {
  if (entry instanceof Message) {
    return Object.freeze({ content: entry.content, role: entry.role });
  }
  if (entry instanceof ToolCall) {
    return Object.freeze({
      content: null,
      role: "assistant",
      tool_calls: Object.freeze([
        Object.freeze({
          function: Object.freeze({
            arguments: JSON.stringify(structuredValue(entry.input)),
            name: entry.name,
          }),
          id: entry.callId,
          type: "function",
        }),
      ]),
    });
  }
  if (entry instanceof ToolResult) {
    return Object.freeze({
      content: JSON.stringify(
        Object.freeze({
          output: structuredValue(entry.output),
          status: entry.status,
        }),
      ),
      role: "tool",
      tool_call_id: entry.callId,
    });
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
      ...conversation.entries.map((entry) => messageValue(entry)),
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
            parallel_tool_calls: false,
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
  arguments: string[];
  argumentCodeUnits: number;
  callId: string | undefined;
  name: string | undefined;
};

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

/** Stateful validator for one streamed Chat Completions response. */
export class ChatCompletionDecoder {
  #terminal = false;
  #tool: ToolAssembly | undefined;
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
      if (this.#tool !== undefined) {
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
        if (this.#tool !== undefined) {
          return err(failure("protocol"));
        }
        this.#terminal = true;
        events.push(Object.freeze({ kind: "done" as const }));
      } else if (finishReason === "tool_calls") {
        const toolCall = this.#finishTool();
        if (!toolCall.ok) {
          return toolCall;
        }
        this.#terminal = true;
        events.push(toolCall.value);
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
    if (!Array.isArray(value) || value.length !== 1) {
      return err(failure("protocol"));
    }
    const fragment = value.at(0);
    if (!isRecord(fragment) || fragment.index !== 0) {
      return err(failure("protocol"));
    }
    if (
      fragment.type !== undefined &&
      fragment.type !== null &&
      fragment.type !== "function"
    ) {
      return err(failure("protocol"));
    }
    if (!isRecord(fragment.function)) {
      return err(failure("protocol"));
    }
    const assembly = this.#tool ?? {
      argumentCodeUnits: 0,
      arguments: [],
      callId: undefined,
      name: undefined,
    };
    if (fragment.id !== undefined && fragment.id !== null) {
      if (
        typeof fragment.id !== "string" ||
        fragment.id.length === 0 ||
        fragment.id.length > 128 ||
        /\p{Cc}/u.test(fragment.id) ||
        (assembly.callId !== undefined && assembly.callId !== fragment.id)
      ) {
        return err(failure("protocol"));
      }
      assembly.callId = fragment.id;
    }
    const name = fragment.function.name;
    if (name !== undefined && name !== null) {
      if (
        typeof name !== "string" ||
        !VALID_TOOL_NAME.test(name) ||
        (assembly.name !== undefined && assembly.name !== name)
      ) {
        return err(failure("protocol"));
      }
      assembly.name = name;
    }
    const argument = fragment.function.arguments;
    if (argument !== undefined && argument !== null) {
      if (typeof argument !== "string") {
        return err(failure("protocol"));
      }
      assembly.argumentCodeUnits += argument.length;
      if (
        assembly.argumentCodeUnits >
        OPENCODE_GO_LIMITS.toolArgumentCodeUnits
      ) {
        return err(failure("limit"));
      }
      assembly.arguments.push(argument);
    }
    this.#tool = assembly;
    return ok(undefined);
  }

  #finishTool(): Result<Extract<ModelStreamEvent, { kind: "toolCall" }>, WireError> {
    const assembly = this.#tool;
    if (assembly?.callId === undefined || assembly.name === undefined) {
      return err(failure("protocol"));
    }
    let input: unknown;
    try {
      input = JSON.parse(assembly.arguments.join("")) as unknown;
    } catch (_cause: unknown) {
      return err(failure("protocol"));
    }
    const structured = structuredValueFromUnknown(input);
    if (!structured.ok || !(structured.value instanceof StructuredObject)) {
      return err(failure("protocol"));
    }
    return ok(
      Object.freeze({
        callId: assembly.callId,
        input: structured.value,
        kind: "toolCall" as const,
        name: assembly.name,
      }),
    );
  }
}
