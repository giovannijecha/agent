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

function message(
  role: "assistant" | "user",
  content: string,
  reasoning?: string,
) {
  const created = Message.create(role, content, reasoning);
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
    "I need the exact file content.",
  );
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("exchange fixture failed");
  return created.value;
}

function wideExchange() {
  const values = Array.from({ length: 1_024 }, () => null);
  const payload = structuredValueFromUnknown({ left: values, right: values });
  assert.equal(payload.ok, true);
  if (!payload.ok || !(payload.value instanceof StructuredObject)) {
    throw new Error("wide structured fixture failed");
  }
  const ownedPayload = payload.value;
  const calls = ["call-1", "call-2"].map((callId) =>
    ToolCall.create(callId, "read_file", ownedPayload)
  );
  const results = ["call-1", "call-2"].map((callId) =>
    ToolResult.create(
      callId,
      "read_file",
      "success",
      ownedPayload,
    )
  );
  assert.equal(calls.every((call) => call.ok), true);
  assert.equal(results.every((result) => result.ok), true);
  const created = ToolExchange.create(
    undefined,
    calls.map((call) => {
      if (!call.ok) throw new Error("wide call fixture failed");
      return call.value;
    }),
    results.map((result) => {
      if (!result.ok) throw new Error("wide result fixture failed");
      return result.value;
    }),
  );
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("wide exchange fixture failed");
  return created.value;
}

test("round-trips an immutable branched tree through owned journal records", () => {
  let tree = ConversationTree.empty();
  const first = tree.appendTurn(
    [
      message(Role.User, "inspect"),
      exchange(),
      message(Role.Assistant, "done", "The inspection is complete."),
    ],
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
    assert.equal(
      record.entries
        .filter((entry) =>
          entry.kind === "message" && entry.role !== Role.Assistant
        )
        .every((entry) => !("reasoning" in entry)),
      true,
    );
    assert.equal(
      record.entries
        .filter((entry) =>
          entry.kind === "message" && entry.role === Role.Assistant
        )
        .every((entry) => "reasoning" in entry),
      true,
    );
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
    assert.equal(restoredInput.reasoning, "I need the exact file content.");
    assert.equal(
      Object.is(restoredInput.calls.at(0)?.input.get("line"), -0),
      true,
    );
  }
  const restoredAssistant = restored.value.turns.at(0)?.entries.at(-1);
  assert.equal(restoredAssistant instanceof Message, true);
  if (restoredAssistant instanceof Message) {
    assert.equal(restoredAssistant.reasoning, "The inspection is complete.");
  }
});

test("selects exact version-one and version-two record schemas", () => {
  const versionOne = {
    entries: [
      { content: "question", kind: "message", role: "user" },
      { content: "answer", kind: "message", role: "assistant" },
    ],
    id: 1,
    kind: "turn",
    parentId: 0,
    settlement: "completed",
  };
  assert.equal(conversationJournalTurnFromUnknown(versionOne, 1).ok, true);
  assert.equal(conversationJournalTurnFromUnknown(versionOne, 2).ok, false);

  const illicitVersionOne = {
    ...versionOne,
    entries: [
      versionOne.entries.at(0),
      { ...versionOne.entries.at(1), reasoning: null },
    ],
  };
  assert.equal(
    conversationJournalTurnFromUnknown(illicitVersionOne, 1).ok,
    false,
  );

  const versionTwo = {
    entries: [
      {
        content: "question",
        kind: "message",
        role: "user",
      },
      {
        content: "answer",
        kind: "message",
        reasoning: "trace",
        role: "assistant",
      },
    ],
    id: 1,
    kind: "turn",
    parentId: 0,
    settlement: "completed",
  };
  const decoded = conversationJournalTurnFromUnknown(versionTwo, 2);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    const assistant = decoded.value.entries.at(1);
    assert.equal(assistant instanceof Message, true);
    if (assistant instanceof Message) assert.equal(assistant.reasoning, "trace");
  }
  assert.equal(
    conversationJournalTurnFromUnknown(
      {
        ...versionTwo,
        entries: [{
          ...versionTwo.entries.at(0),
          reasoning: null,
        }, versionTwo.entries.at(1)],
      },
      2,
    ).ok,
    false,
  );
  assert.equal(
    conversationJournalTurnFromUnknown(
      {
        ...versionTwo,
        entries: [versionTwo.entries.at(0), {
          content: "answer",
          kind: "message",
          role: "assistant",
        }],
      },
      2,
    ).ok,
    false,
  );
  assert.equal(
    conversationJournalTurnFromUnknown(
      {
        ...versionTwo,
        entries: [
          { content: "policy", kind: "message", role: "system" },
          versionTwo.entries.at(0),
          versionTwo.entries.at(1),
        ],
      },
      2,
    ).ok,
    true,
  );
  assert.equal(
    conversationJournalTurnFromUnknown(
      {
        ...versionTwo,
        entries: [{
          content: "policy",
          kind: "message",
          reasoning: null,
          role: "system",
        }, versionTwo.entries.at(0), versionTwo.entries.at(1)],
      },
      2,
    ).ok,
    false,
  );
  assert.equal(
    conversationJournalTurnFromUnknown(
      {
        ...versionTwo,
        entries: [versionTwo.entries.at(0), {
          ...versionTwo.entries.at(1),
          reasoning: " ",
        }],
      },
      2,
    ).ok,
    false,
  );
});

test("budgets every structured journal payload independently", () => {
  const appended = ConversationTree.empty().appendTurn(
    [message(Role.User, "inspect both"), wideExchange()],
    "checkpointed",
  );
  assert.equal(appended.ok, true);
  if (!appended.ok) return;
  const turn = appended.value.turns.at(0);
  assert.ok(turn !== undefined);

  const parsed = conversationJournalTurnFromUnknown(
    JSON.parse(JSON.stringify(conversationJournalTurnRecord(turn))),
  );

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.entries.at(1) instanceof ToolExchange, true);
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
