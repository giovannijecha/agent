import assert from "node:assert/strict";
import test from "node:test";

import { TUI_LIMITS } from "@agent/tui";

import { ChatState } from "../dist/chat-state.js";

test("publishes a streamed pair only after exact completion", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question").ok);
  assert.ok(chat.append(1, "ans").ok);

  assert.equal(chat.transcriptText(), "question\n\nans");
  assert.deepEqual(chat.transcriptEntries(), [
    { content: "question", document: 0, role: "user" },
    { content: "ans", document: 1, role: "assistant" },
  ]);
  assert.ok(chat.append(1, "wer").ok);
  assert.ok(chat.prepare(1, "answer").ok);
  assert.ok(chat.commit(1).ok);

  assert.equal(chat.activeTurnId, undefined);
  assert.equal(chat.transcriptText(), "question\n\nanswer");
  assert.deepEqual(chat.transcriptEntries(), [
    { content: "question", document: 0, role: "user" },
    { content: "answer", document: 1, role: "assistant" },
  ]);
});

test("discards prospective personal content on cancellation", () => {
  const chat = new ChatState();
  chat.begin(7, "private question");
  chat.append(7, "partial private answer");

  const discarded = chat.discard(7);

  assert.ok(discarded.ok);
  assert.equal(chat.hasContent, false);
  assert.equal(chat.transcriptText(), "");
});

test("rejects stale and mismatched events without retaining content in errors", () => {
  const chat = new ChatState();
  chat.begin(1, "private question");
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

test("evicts only the oldest completed display turns at the count bound", () => {
  const chat = new ChatState();
  for (let turnId = 1; turnId <= 129; turnId += 1) {
    const user = turnId === 1 ? "oldest-marker" : "user-" + turnId;
    const assistant = "assistant-" + turnId;
    assert.ok(chat.begin(turnId, user).ok);
    assert.ok(chat.append(turnId, assistant).ok);
    assert.ok(chat.prepare(turnId, assistant).ok);
    assert.ok(chat.commit(turnId).ok);
  }

  const transcript = chat.transcriptText();
  assert.equal(transcript.includes("oldest-marker"), false);
  assert.equal(transcript.includes("user-129"), true);
});

test("enforces independent delta and accumulated response bounds atomically", () => {
  const chat = new ChatState();
  chat.begin(1, "question");
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
  const result = chat.begin(1, "private".repeat(600));

  assert.equal(result.ok, false);
  assert.equal(chat.hasContent, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalidTurn");
    assert.equal(JSON.stringify(result.error).includes("private"), false);
  }
});

test("explicitly releases completed and prospective display content", () => {
  const chat = new ChatState();
  chat.begin(1, "private completed question");
  chat.append(1, "private completed answer");
  chat.prepare(1, "private completed answer");
  chat.commit(1);
  chat.begin(2, "private active question");
  chat.append(2, "private active answer");

  chat.clear();

  assert.equal(chat.activeTurnId, undefined);
  assert.equal(chat.hasContent, false);
  assert.equal(chat.transcriptText(), "");
});

test("tail-clips active role entries without joining their Markdown", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "```text\nquestion").ok);
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
