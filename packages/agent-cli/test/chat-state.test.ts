import assert from "node:assert/strict";
import test from "node:test";

import { TUI_LIMITS } from "@agent/tui";

import { ChatState } from "../dist/chat-state.js";

test("publishes a streamed pair only after exact completion", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question").ok);
  assert.ok(chat.append(1, "ans").ok);

  assert.equal(chat.transcriptText(), "you\nquestion\n\nagent\nans");
  assert.deepEqual(chat.transcriptDocuments(), [
    "you\nquestion",
    "agent\nans",
  ]);
  assert.ok(chat.append(1, "wer").ok);
  assert.ok(chat.prepare(1, "answer").ok);
  assert.ok(chat.commit(1).ok);

  assert.equal(chat.activeTurnId, undefined);
  assert.equal(chat.transcriptText(), "you\nquestion\n\nagent\nanswer");
  assert.deepEqual(chat.transcriptDocuments(), [
    "you\nquestion",
    "agent\nanswer",
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

test("tail-clips a multi-tool active display before the TUI boundary", () => {
  const chat = new ChatState();
  assert.ok(chat.begin(1, "question").ok);
  for (let step = 0; step < 4; step += 1) {
    for (let chunk = 0; chunk < 16; chunk += 1) {
      assert.ok(chat.append(1, "x".repeat(16_384)).ok);
    }
    assert.ok(chat.checkpoint(1).ok);
  }

  const transcript = chat.transcriptText();

  assert.equal(transcript.length, TUI_LIMITS.displayTextCodeUnits);
  assert.equal(transcript.endsWith("x"), true);
});
