import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationTree,
  Message,
  Role,
  StructuredObject,
  ToolCall,
  ToolExchange,
  ToolResult,
  conversationJournalTurnFromUnknown,
  conversationJournalTurnRecord,
  restoreConversationJournal,
  structuredValueFromUnknown,
} from "../dist/index.js";

function message(role: "assistant" | "user", content: string) {
  const created = Message.create(role, content);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("message fixture failed");
  return created.value;
}

function exchange() {
  const input = structuredValueFromUnknown({ path: "notes.txt", line: -0 });
  const output = structuredValueFromUnknown({ content: "owned" });
  assert.equal(input.ok, true);
  assert.equal(output.ok, true);
  if (
    !input.ok ||
    !(input.value instanceof StructuredObject) ||
    !output.ok
  ) {
    throw new Error("structured fixture failed");
  }
  const call = ToolCall.create("call-1", "read_file", input.value);
  const result = ToolResult.create(
    "call-1",
    "read_file",
    "success",
    output.value,
  );
  assert.equal(call.ok, true);
  assert.equal(result.ok, true);
  if (!call.ok || !result.ok) throw new Error("tool fixture failed");
  const created = ToolExchange.create(
    message(Role.Assistant, "I will inspect it."),
    [call.value],
    [result.value],
  );
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("exchange fixture failed");
  return created.value;
}

test("round-trips an immutable branched tree through owned journal records", () => {
  let tree = ConversationTree.empty();
  const first = tree.appendTurn(
    [message(Role.User, "inspect"), exchange(), message(Role.Assistant, "done")],
    "completed",
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  tree = first.value;
  const root = tree.select(0);
  assert.equal(root.ok, true);
  if (!root.ok) return;
  const sibling = root.value.appendTurn(
    [message(Role.User, "alternate"), exchange()],
    "checkpointed",
  );
  assert.equal(sibling.ok, true);
  if (!sibling.ok) return;
  tree = sibling.value;

  const decoded = tree.turns.map((turn) => {
    const record = conversationJournalTurnRecord(turn);
    const parsed = conversationJournalTurnFromUnknown(
      JSON.parse(JSON.stringify(record)),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) throw new Error("journal decode failed");
    return parsed.value;
  });
  const restored = restoreConversationJournal(decoded, tree.activeNodeId);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;

  assert.deepEqual(restored.value.nodes, tree.nodes);
  assert.deepEqual(
    restored.value.conversation.entries.map((entry) =>
      entry instanceof Message ? [entry.role, entry.content] : "exchange"
    ),
    [["user", "alternate"], "exchange"],
  );
  const restoredInput = restored.value.conversation.entries.at(1);
  assert.equal(restoredInput instanceof ToolExchange, true);
  if (restoredInput instanceof ToolExchange) {
    assert.equal(
      Object.is(restoredInput.calls.at(0)?.input.get("line"), -0),
      true,
    );
  }
});

test("rejects malformed records and impossible parent or active identities", () => {
  assert.equal(
    conversationJournalTurnFromUnknown({
      entries: [],
      id: 1,
      kind: "turn",
      parentId: 0,
      settlement: "completed",
      extra: true,
    }).ok,
    false,
  );
  const impossible = restoreConversationJournal(
    [
      {
        entries: [
          message(Role.User, "question"),
          message(Role.Assistant, "answer"),
        ],
        id: 1,
        parentId: 7,
        settlement: "completed",
      },
    ],
    1,
  );
  assert.equal(impossible.ok, false);
  if (!impossible.ok) {
    assert.equal(impossible.error.kind, "invalidTree");
  }
  assert.equal(restoreConversationJournal([], 1).ok, false);
});
