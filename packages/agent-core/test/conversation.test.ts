import assert from "node:assert/strict";
import test from "node:test";

import {
  Conversation,
  Message,
  MessageError,
  Role,
  StructuredObject,
  structuredValueFromUnknown,
  ToolCall,
  ToolExchange,
  ToolResult,
} from "@agent/core";

test("rejects blank messages", () => {
  const result = Message.create(Role.User, "  \n");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof MessageError);
    assert.equal(result.error.kind, "blank");
  }
});

test("rejects an invalid runtime role without retaining content", () => {
  const result = Message.create("invalid" as Role, "private");

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalidRole");
    assert.equal("content" in result.error, false);
  }
});

test("rejects hostile message content without throwing or retaining it", () => {
  const result = Message.create(Role.User, Symbol("private") as never);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalidContent");
    assert.equal("content" in result.error, false);
  }
});

test("preserves message order", () => {
  const first = Message.create(Role.User, "first");
  const second = Message.create(Role.Assistant, "second");
  assert.ok(first.ok);
  assert.ok(second.ok);

  const conversation = Conversation.empty()
    .append(first.value)
    .append(second.value);

  assert.deepEqual(
    conversation.entries.map((entry) =>
      entry instanceof Message ? entry.content : "tool-exchange",
    ),
    ["first", "second"],
  );
  assert.ok(Object.isFrozen(conversation));
  assert.ok(Object.isFrozen(conversation.entries));
});

test("preserves one complete ordered tool exchange", () => {
  const input = structuredValueFromUnknown({ path: "src/index.ts" });
  const output = structuredValueFromUnknown({ text: "owned" });
  assert.ok(input.ok && input.value instanceof StructuredObject);
  assert.ok(output.ok);
  const call = ToolCall.create("call-1", "read_file", input.value);
  const result = ToolResult.create(
    "call-1",
    "read_file",
    "success",
    output.value,
  );
  assert.ok(call.ok);
  assert.ok(result.ok);
  const preamble = Message.create(Role.Assistant, "I will inspect it.");
  assert.ok(preamble.ok);
  const exchange = ToolExchange.create(
    preamble.value,
    Object.freeze([call.value]),
    Object.freeze([result.value]),
  );
  assert.ok(exchange.ok);

  const conversation = Conversation.empty().append(exchange.value);

  assert.equal(conversation.entries.at(0), exchange.value);
  assert.equal(exchange.value.calls.at(0), call.value);
  assert.equal(exchange.value.results.at(0), result.value);
  assert.equal(exchange.value.assistant, preamble.value);
  assert.equal(conversation.messageUnits, 2);
  assert.equal(conversation.codeUnits > 0, true);
  assert.ok(Object.isFrozen(exchange.value));
  assert.ok(Object.isFrozen(exchange.value.calls));
  assert.ok(Object.isFrozen(exchange.value.results));
});

test("rejects incomplete, reordered, and duplicate tool exchanges", () => {
  const input = structuredValueFromUnknown({ path: "src/index.ts" });
  const output = structuredValueFromUnknown({ text: "owned" });
  assert.ok(input.ok && input.value instanceof StructuredObject);
  assert.ok(output.ok);
  const first = ToolCall.create("call-1", "read_file", input.value);
  const duplicate = ToolCall.create("call-1", "list_directory", input.value);
  const wrong = ToolResult.create(
    "call-1",
    "list_directory",
    "success",
    output.value,
  );
  assert.ok(first.ok);
  assert.ok(duplicate.ok);
  assert.ok(wrong.ok);

  assert.equal(ToolExchange.create(undefined, [], []).ok, false);
  assert.equal(
    ToolExchange.create(undefined, [first.value, duplicate.value], []).ok,
    false,
  );
  assert.equal(
    ToolExchange.create(undefined, [first.value], [wrong.value]).ok,
    false,
  );
});
