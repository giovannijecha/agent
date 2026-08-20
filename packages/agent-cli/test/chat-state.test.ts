import assert from "node:assert/strict";
import test from "node:test";

import { RUNTIME_LIMITS } from "@agent/runtime";
import { TUI_LIMITS } from "@agent/tui";

import { ChatState } from "../dist/chat-state.js";

function publishSizedTurn(
  chat: ChatState,
  turnId: number,
  historyParentNodeId: number,
  responseCodeUnits: number,
): void {
  const response = "a".repeat(responseCodeUnits);
  assert.ok(chat.begin(turnId, "u", historyParentNodeId).ok);
  let remaining = responseCodeUnits;
  while (remaining > 0) {
    const chunk = Math.min(remaining, RUNTIME_LIMITS.deltaCodeUnits);
    assert.ok(chat.append(turnId, "a".repeat(chunk)).ok);
    remaining -= chunk;
  }
  assert.ok(chat.prepare(turnId, response).ok);
  assert.ok(chat.commit(turnId, turnId).ok);
}

test("publishes a streamed pair only after exact completion", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question", 0).ok);
  assert.ok(chat.append(1, "ans").ok);

  assert.equal(chat.transcriptText(), "question\n\nans");
  assert.deepEqual(chat.transcriptEntries(), [
    { content: "question", document: 0, role: "user" },
    { content: "ans", document: 1, role: "assistant" },
  ]);
  assert.ok(chat.append(1, "wer").ok);
  assert.ok(chat.prepare(1, "answer").ok);
  assert.ok(chat.commit(1, 1).ok);

  assert.equal(chat.activeTurnId, undefined);
  assert.equal(chat.transcriptText(), "question\n\nanswer");
  assert.deepEqual(chat.transcriptEntries(), [
    { content: "question", document: 0, role: "user" },
    { content: "answer", document: 1, role: "assistant" },
  ]);
});

test("keeps live reasoning in its own transcript document", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question", 0).ok);
  assert.ok(chat.appendReasoning(1, "inspect ").ok);
  assert.ok(chat.appendReasoning(1, "carefully").ok);
  assert.ok(chat.append(1, "answer").ok);

  assert.deepEqual(chat.transcriptEntries(), [
    { content: "question", document: 0, role: "user" },
    {
      content: "inspect carefully",
      document: 1,
      role: "reasoning",
    },
    { content: "answer", document: 2, role: "assistant" },
  ]);
  assert.ok(chat.prepare(1, "answer", "inspect carefully").ok);
  assert.ok(chat.commit(1, 1).ok);
  assert.equal(chat.settledTurn(1)?.reasoning, "inspect carefully");
  assert.equal(
    chat.transcriptText(),
    "question\n\ninspect carefully\n\nanswer",
  );
});

test("discards reasoning when final settlement does not match the stream", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "private question", 0).ok);
  assert.ok(chat.appendReasoning(1, "private trace").ok);
  assert.ok(chat.append(1, "answer").ok);

  const mismatch = chat.prepare(1, "answer", "different trace");

  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error.kind, "responseMismatch");
  assert.equal(chat.hasContent, false);
  assert.equal(chat.transcriptText(), "");
});

test("discards prospective personal content on cancellation", () => {
  const chat = new ChatState();
  chat.begin(7, "private question", 0);
  chat.append(7, "partial private answer");

  const discarded = chat.discard(7);

  assert.ok(discarded.ok);
  assert.equal(chat.hasContent, false);
  assert.equal(chat.transcriptText(), "");
});

test("rejects stale and mismatched events without retaining content in errors", () => {
  const chat = new ChatState();
  chat.begin(1, "private question", 0);
  chat.append(1, "private partial");

  const stale = chat.append(2, "ignored private delta");
  const mismatch = chat.prepare(1, "different private response");

  assert.equal(stale.ok, false);
  assert.equal(mismatch.ok, false);
  if (!stale.ok) {
    assert.equal(stale.error.kind, "staleTurn");
    assert.equal(JSON.stringify(stale.error).includes("private"), false);
  }
  if (!mismatch.ok) {
    assert.equal(mismatch.error.kind, "responseMismatch");
    assert.equal(JSON.stringify(mismatch.error).includes("private"), false);
  }
  assert.equal(chat.activeTurnId, undefined);
});

test("retains branches and rejects display history beyond the tree bound", () => {
  const chat = new ChatState();
  for (let turnId = 1; turnId <= 128; turnId += 1) {
    const user = turnId === 1 ? "oldest-marker" : "user-" + turnId;
    const assistant = "assistant-" + turnId;
    assert.ok(chat.begin(turnId, user, turnId - 1).ok);
    assert.ok(chat.append(turnId, assistant).ok);
    assert.ok(chat.prepare(turnId, assistant).ok);
    assert.ok(chat.commit(turnId, turnId).ok);
  }
  assert.equal(chat.begin(129, "overflow", 128).ok, true);
  assert.ok(chat.append(129, "overflow").ok);
  assert.ok(chat.prepare(129, "overflow").ok);
  assert.equal(chat.commit(129, 129).ok, false);

  const transcript = chat.transcriptText();
  assert.equal(transcript.includes("oldest-marker"), true);
  assert.equal(transcript.includes("user-128"), true);
});

test("projects and selects retained display branches without flattening siblings", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "root question", 0).ok);
  assert.ok(chat.append(1, "root answer").ok);
  assert.ok(chat.prepare(1, "root answer").ok);
  assert.ok(chat.commit(1, 1).ok);
  assert.ok(chat.begin(2, "original question", 1).ok);
  assert.ok(chat.append(2, "original answer").ok);
  assert.ok(chat.prepare(2, "original answer").ok);
  assert.ok(chat.commit(2, 2).ok);

  assert.ok(chat.selectHistoryNode(1).ok);
  assert.ok(chat.begin(3, "branch question", 1).ok);
  assert.ok(chat.append(3, "branch answer").ok);
  assert.ok(chat.prepare(3, "branch answer").ok);
  assert.ok(chat.commit(3, 3).ok);

  assert.equal(
    chat.transcriptText(),
    "root question\n\nroot answer\n\nbranch question\n\nbranch answer",
  );
  assert.deepEqual(
    chat.timelineEntries().map((item) => ({
      childCount: item.childCount,
      depth: item.depth,
      id: item.id,
      parentId: item.parentId,
      selected: item.selected,
    })),
    [
      { childCount: 1, depth: 0, id: 0, parentId: 0, selected: false },
      { childCount: 2, depth: 1, id: 1, parentId: 0, selected: false },
      { childCount: 0, depth: 2, id: 2, parentId: 1, selected: false },
      { childCount: 0, depth: 2, id: 3, parentId: 1, selected: true },
    ],
  );

  assert.ok(chat.selectHistoryNode(2).ok);
  assert.equal(chat.transcriptText().includes("original question"), true);
  assert.equal(chat.transcriptText().includes("branch question"), false);
});

test("retains a checkpointed display node as an explicit incomplete turn", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question", 0).ok);
  assert.ok(chat.append(1, "tool preamble").ok);
  assert.ok(chat.checkpoint(1).ok);
  const oversized = chat.finishCheckpointed(1, "x".repeat(129), 1);
  assert.equal(oversized.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.error.kind, "invalidHistoryNode");
  }
  assert.ok(chat.finishCheckpointed(1, "Turn cancelled.", 1).ok);

  assert.equal(
    chat.transcriptText(),
    "question\n\ntool preamble\n\nTurn cancelled.",
  );
  assert.equal(chat.timelineEntries().at(1)?.settlement, "checkpointed");
});

test("creates the checkpoint marker document after a reasoning-only tool step", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question", 0).ok);
  assert.ok(chat.appendReasoning(1, "inspect first").ok);
  assert.ok(chat.checkpoint(1).ok);
  assert.ok(chat.finishCheckpointed(1, "Turn cancelled.", 1).ok);

  assert.deepEqual(
    chat.transcriptEntries().map((entry) => [entry.document, entry.role, entry.content]),
    [
      [0, "user", "question"],
      [1, "reasoning", "inspect first"],
      [2, "assistant", "Turn cancelled."],
    ],
  );
});

test("keeps synthetic checkpoint display within authoritative history bounds", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "u", 0).ok);
  assert.ok(chat.append(1, "a").ok);
  assert.ok(chat.checkpoint(1).ok);
  assert.ok(chat.finishCheckpointed(1, "Turn cancelled.", 1).ok);

  for (let turnId = 2; turnId <= 4; turnId += 1) {
    publishSizedTurn(
      chat,
      turnId,
      turnId - 1,
      RUNTIME_LIMITS.responseCodeUnits,
    );
  }
  const finalResponseCodeUnits =
    RUNTIME_LIMITS.conversationCodeUnits -
    2 -
    3 * (RUNTIME_LIMITS.responseCodeUnits + 1) -
    1;
  publishSizedTurn(chat, 5, 4, finalResponseCodeUnits);

  assert.equal(chat.timelineEntries().length, 6);
  assert.equal(chat.timelineEntries().at(5)?.selected, true);
});

test("enforces independent delta and accumulated response bounds atomically", () => {
  const chat = new ChatState();
  chat.begin(1, "question", 0);
  const oversized = chat.append(1, "x".repeat(16_385));
  assert.equal(oversized.ok, false);

  for (let count = 0; count < 16; count += 1) {
    assert.ok(chat.append(1, "x".repeat(16_384)).ok);
  }
  const overflow = chat.append(1, "x");

  assert.equal(overflow.ok, false);
  if (!overflow.ok) assert.equal(overflow.error.kind, "responseTooLong");
});

test("rejects an oversized prospective user before retaining it", () => {
  const chat = new ChatState();
  const result = chat.begin(1, "private".repeat(600), 0);

  assert.equal(result.ok, false);
  assert.equal(chat.hasContent, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalidTurn");
    assert.equal(JSON.stringify(result.error).includes("private"), false);
  }
});

test("explicitly releases completed and prospective display content", () => {
  const chat = new ChatState();
  chat.begin(1, "private completed question", 0);
  chat.append(1, "private completed answer");
  chat.prepare(1, "private completed answer");
  chat.commit(1, 1);
  chat.begin(2, "private active question", 1);
  chat.append(2, "private active answer");

  chat.clear();

  assert.equal(chat.activeTurnId, undefined);
  assert.equal(chat.hasContent, false);
  assert.equal(chat.transcriptText(), "");
});

test("tail-clips active role entries without joining their Markdown", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "```text\nquestion", 0).ok);
  for (let step = 0; step < 4; step += 1) {
    for (let chunk = 0; chunk < 16; chunk += 1) {
      const text =
        step === 3 && chunk === 15
          ? "x".repeat(16_381) + "```"
          : "x".repeat(16_384);
      assert.ok(chat.append(1, text).ok);
    }
    assert.ok(chat.checkpoint(1).ok);
  }

  const entries = chat.transcriptEntries();
  const transcript = entries.map((entry) => entry.content).join("\n\n");

  assert.equal(entries.length, 2);
  assert.deepEqual(entries.at(0), {
    content: "```text\nquestion",
    document: 0,
    role: "user",
  });
  assert.equal(entries.at(1)?.role, "assistant");
  assert.equal(entries.at(1)?.content.endsWith("```"), true);
  assert.equal(transcript.length, TUI_LIMITS.displayTextCodeUnits);
});
