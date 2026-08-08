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
      entry instanceof Message ? entry.content : entry.name,
    ),
    ["first", "second"],
  );
  assert.ok(Object.isFrozen(conversation));
  assert.ok(Object.isFrozen(conversation.entries));
});

test("preserves explicit structured tool entries", () => {
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

  const conversation = Conversation.empty()
    .append(call.value)
    .append(result.value);

  assert.equal(conversation.entries.at(0), call.value);
  assert.equal(conversation.entries.at(1), result.value);
  assert.equal(conversation.codeUnits > 0, true);
});
