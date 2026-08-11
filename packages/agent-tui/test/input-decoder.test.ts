import assert from "node:assert/strict";
import test from "node:test";

import { InputDecoder, type KeyEvent } from "@agent/tui";

function kinds(events: readonly KeyEvent[]): readonly string[] {
  return events.map((event) => event.kind);
}

test("decodes text and every supported editing key", () => {
  const decoder = new InputDecoder();
  const events = decoder.feed(
    "ab" +
      "\u001B[D" +
      "\u001B[C" +
      "\u001B[H" +
      "\u001B[F" +
      "\u001B[3~" +
      "\u007F" +
      "\t" +
      "\r" +
      "\u0003" +
      "\u0004",
  );

  assert.deepEqual(kinds(events), [
    "text",
    "left",
    "right",
    "home",
    "end",
    "delete",
    "backspace",
    "tab",
    "enter",
    "interrupt",
    "eof",
  ]);
  assert.equal(events[0]?.kind === "text" ? events[0].text : "", "ab");
});

test("decodes word navigation and deletion controls", () => {
  const decoder = new InputDecoder();
  const events = decoder.feed(
    "\u001B[1;5D" +
      "\u001B[1;5C" +
      "\u001B[5D" +
      "\u001B[5C" +
      "\u0008" +
      "\u0017" +
      "\u001B[3;5~",
  );

  assert.deepEqual(kinds(events), [
    "wordLeft",
    "wordRight",
    "wordLeft",
    "wordRight",
    "wordBackspace",
    "wordBackspace",
    "wordDelete",
  ]);
});

test("retains word-control sequences across every chunk split", () => {
  for (const [sequence, expected] of [
    ["\u001B[1;5D", "wordLeft"],
    ["\u001B[1;5C", "wordRight"],
    ["\u001B[3;5~", "wordDelete"],
  ] as const) {
    for (let split = 1; split < sequence.length; split += 1) {
      const decoder = new InputDecoder();
      assert.deepEqual(decoder.feed(sequence.slice(0, split)), []);
      assert.deepEqual(kinds(decoder.feed(sequence.slice(split))), [expected]);
    }
  }
});

test("retains an escape sequence across every chunk split", () => {
  const sequence = "\u001B[3~";
  for (let split = 1; split < sequence.length; split += 1) {
    const decoder = new InputDecoder();
    assert.deepEqual(decoder.feed(sequence.slice(0, split)), []);
    assert.deepEqual(kinds(decoder.feed(sequence.slice(split))), ["delete"]);
  }
});

test("decodes transcript navigation keys across CSI and SS3 forms", () => {
  const decoder = new InputDecoder();

  assert.deepEqual(
    kinds(
      decoder.feed(
        "\u001B[A" +
          "\u001BOA" +
          "\u001B[B" +
          "\u001BOB" +
          "\u001B[5~" +
          "\u001B[6~",
      ),
    ),
    ["up", "up", "down", "down", "pageUp", "pageDown"],
  );
});

test("retains page navigation sequences across every chunk split", () => {
  for (const [sequence, expected] of [
    ["\u001B[5~", "pageUp"],
    ["\u001B[6~", "pageDown"],
  ] as const) {
    for (let split = 1; split < sequence.length; split += 1) {
      const decoder = new InputDecoder();
      assert.deepEqual(decoder.feed(sequence.slice(0, split)), []);
      assert.deepEqual(kinds(decoder.feed(sequence.slice(split))), [expected]);
    }
  }
});

test("preserves shutdown controls after an incomplete escape", () => {
  for (const control of ["\u0003", "\u0004"]) {
    const decoder = new InputDecoder();
    assert.deepEqual(decoder.feed("\u001B"), []);

    const events = decoder.feed(control);

    assert.deepEqual(kinds(events), [
      "unsupported",
      control === "\u0003" ? "interrupt" : "eof",
    ]);
  }
});

test("decodes or discards complete fragmented SS3 sequences", () => {
  for (const [sequence, expected] of [
    ["\u001BOC", "right"],
    ["\u001BOD", "left"],
    ["\u001BOX", "unsupported"],
  ] as const) {
    for (let split = 1; split < sequence.length; split += 1) {
      const decoder = new InputDecoder();
      assert.deepEqual(decoder.feed(sequence.slice(0, split)), []);
      assert.deepEqual(kinds(decoder.feed(sequence.slice(split))), [expected]);
    }
  }
});

test("coalesces CRLF into one submission", () => {
  const decoder = new InputDecoder();

  const first = decoder.feed("\r");
  const second = decoder.feed("\n");

  assert.deepEqual(kinds(first), ["enter"]);
  assert.deepEqual(second, []);
});

test("emits bracketed paste as one atomic normalized event", () => {
  const decoder = new InputDecoder();
  const events = decoder.feed(
    "\u001B[200~first\r\nsecond\rthird\tfourth\u001B[201~",
  );

  assert.deepEqual(kinds(events), ["paste"]);
  assert.equal(
    events[0]?.kind === "paste" ? events[0].text : "",
    "first\nsecond\nthird\tfourth",
  );
});

test("retains bracketed paste delimiters and content across every chunk boundary", () => {
  const source = "\u001B[200~alpha\nbeta\u001B[201~tail";
  for (let split = 1; split < source.length; split += 1) {
    const decoder = new InputDecoder();
    const events = [
      ...decoder.feed(source.slice(0, split)),
      ...decoder.feed(source.slice(split)),
    ];

    assert.deepEqual(kinds(events).slice(0, 1), ["paste"]);
    assert.equal(events.slice(1).every((event) => event.kind === "text"), true);
    assert.equal(events[0]?.kind === "paste" ? events[0].text : "", "alpha\nbeta");
    assert.equal(
      events
        .slice(1)
        .map((event) => (event.kind === "text" ? event.text : ""))
        .join(""),
      "tail",
    );
  }
});

test("fails closed on incomplete and oversized bracketed paste", () => {
  const incomplete = new InputDecoder();
  assert.deepEqual(incomplete.feed("\u001B[200~private"), []);
  assert.deepEqual(kinds(incomplete.finish()), ["unsupported"]);

  const oversized = new InputDecoder();
  assert.deepEqual(oversized.feed("\u001B[200~"), []);
  assert.deepEqual(kinds(oversized.feed("x".repeat(65_536))), []);
  assert.deepEqual(
    kinds(oversized.feed("y\u001B[201~safe")),
    ["unsupported", "text"],
  );
});

test("never inserts unknown, incomplete, or oversized control input", () => {
  const unknown = new InputDecoder().feed("\u001B[1;9D");
  const incompleteDecoder = new InputDecoder();
  assert.deepEqual(incompleteDecoder.feed("\u001B["), []);
  const incomplete = incompleteDecoder.finish();
  const oversized = new InputDecoder().feed("x".repeat(65_537));

  assert.deepEqual(kinds(unknown), ["unsupported"]);
  assert.deepEqual(kinds(incomplete), ["unsupported"]);
  assert.deepEqual(kinds(oversized), ["unsupported"]);
});

test("discards every fragment of an overlong escape sequence", () => {
  const decoder = new InputDecoder();
  const first = decoder.feed("\u001B[" + "1".repeat(40));
  const second = decoder.feed(";5Dsafe");

  assert.deepEqual(kinds(first), ["unsupported"]);
  assert.deepEqual(kinds(second), ["text"]);
  assert.equal(second[0]?.kind === "text" ? second[0].text : "", "safe");
});

test("does not split a surrogate pair delivered across chunks", () => {
  const decoder = new InputDecoder();
  assert.deepEqual(decoder.feed("\uD83D"), []);

  const events = decoder.feed("\uDE42");

  assert.deepEqual(kinds(events), ["text"]);
  assert.equal(events[0]?.kind === "text" ? events[0].text : "", "🙂");
});
