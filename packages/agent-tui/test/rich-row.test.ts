import assert from "node:assert/strict";
import test from "node:test";

import {
  RichRow,
  RichRowError,
  TextSpan,
  TUI_LIMITS,
} from "@agent/tui";

function span(
  text: string,
  tone: "accent" | "attention" | "emphasis" | "muted" | "plain" = "plain",
): TextSpan {
  const result = TextSpan.create(text, tone);
  assert.ok(result.ok);
  return result.value;
}

test("normalizes one immutable structured row", () => {
  const result = RichRow.create([
    span("agent", "accent"),
    span("", "muted"),
    span(" ", "muted"),
    span("ready", "muted"),
  ]);

  assert.ok(result.ok);
  assert.equal(result.value.text, "agent ready");
  assert.equal(result.value.cellWidth, 11);
  assert.deepEqual(
    result.value.spans.map((item) => ({ text: item.text, tone: item.tone })),
    [
      { text: "agent", tone: "accent" },
      { text: " ready", tone: "muted" },
    ],
  );
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.spans));
  assert.ok(result.value.spans.every((item) => Object.isFrozen(item)));
});

test("rejects unsafe text and tones without retaining rejected content", () => {
  const control = TextSpan.create("before\u001Bafter", "plain");
  const scalar = TextSpan.create("before\uD800after", "plain");
  const tone = TextSpan.create("safe", "loud" as never);

  for (const result of [control, scalar, tone]) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error instanceof RichRowError);
      assert.equal("text" in result.error, false);
      assert.equal("cause" in result.error, false);
    }
  }
  if (!control.ok) assert.equal(control.error.kind, "controlCharacter");
  if (!scalar.ok) assert.equal(scalar.error.kind, "invalidScalar");
  if (!tone.ok) assert.equal(tone.error.kind, "invalidTone");
});

test("enforces span and code-point bounds before oversized work", () => {
  const exactSpans = RichRow.create(
    Array.from({ length: TUI_LIMITS.rowSpans }, (_value, index) =>
      span("x", index % 2 === 0 ? "accent" : "muted"),
    ),
  );
  const exact = RichRow.fromText(
    "x".repeat(TUI_LIMITS.frameLineCodePoints),
    "plain",
  );
  const tooLong = RichRow.fromText(
    "x".repeat(TUI_LIMITS.frameLineCodePoints + 1),
    "plain",
  );
  const oversized = new Proxy(
    Array.from({ length: TUI_LIMITS.rowSpans + 1 }, () => span("x")),
    {
      get(target, property) {
        if (property !== "length") throw new Error("member read escaped");
        return target.length;
      },
    },
  );
  const tooMany = RichRow.create(oversized);

  assert.ok(exactSpans.ok);
  assert.equal(exactSpans.value.spans.length, TUI_LIMITS.rowSpans);
  assert.ok(exact.ok);
  assert.equal(tooLong.ok, false);
  assert.equal(tooMany.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.error.kind, "lineTooLong");
  if (!tooMany.ok) assert.equal(tooMany.error.kind, "tooManySpans");
});

test("contains hostile arrays and proxied spans behind typed failures", () => {
  const item = span("safe");
  const hostileArray = new Proxy([item], {
    get(target, property) {
      if (property === "0") throw new Error("array getter escaped");
      if (property === "length") return target.length;
      return property === "at" ? target.at : undefined;
    },
  });
  const hostileSpan = new Proxy(item, {});

  const arrayResult = RichRow.create(hostileArray);
  const spanResult = RichRow.create([hostileSpan]);

  assert.equal(arrayResult.ok, false);
  assert.equal(spanResult.ok, false);
  if (!arrayResult.ok) assert.equal(arrayResult.error.kind, "invalidSpan");
  if (!spanResult.ok) assert.equal(spanResult.error.kind, "invalidSpan");
});

test("clips by terminal cells while preserving semantic span boundaries", () => {
  const row = RichRow.create([
    span("ab", "accent"),
    span("\u{1F642}cd", "muted"),
  ]);
  assert.ok(row.ok);

  const fitted = row.value.fit(4);
  const narrow = row.value.fit(3);
  const wideOnly = RichRow.fromText("\u{1F642}", "attention");
  assert.ok(wideOnly.ok);
  const oneColumn = wideOnly.value.fit(1);

  assert.ok(fitted.ok);
  assert.equal(fitted.value.text, "ab\u{1F642}");
  assert.deepEqual(fitted.value.spans.map((item) => item.tone), [
    "accent",
    "muted",
  ]);
  assert.ok(narrow.ok);
  assert.equal(narrow.value.text, "ab");
  assert.ok(oneColumn.ok);
  assert.equal(oneColumn.value.text, "");
});

test("snapshots rows without trusting public accessors", () => {
  const row = RichRow.fromText("agent", "accent");
  assert.ok(row.ok);
  const snapshot = RichRow.snapshot(row.value);
  const hostile = RichRow.snapshot(new Proxy(row.value, {}));

  assert.ok(snapshot.ok);
  assert.equal(snapshot.value === row.value, false);
  assert.equal(snapshot.value.equals(row.value), true);
  assert.equal(hostile.ok, false);
  if (!hostile.ok) assert.equal(hostile.error.kind, "invalidRow");
});

test("contains a proxied receiver while fitting a row", () => {
  const row = RichRow.fromText("agent", "accent");
  assert.ok(row.ok);

  const fitted = new Proxy(row.value, {}).fit(3);

  assert.equal(fitted.ok, false);
  if (!fitted.ok) assert.equal(fitted.error.kind, "invalidRow");
});

test("fits against any positive safe terminal width without allocating by width", () => {
  const row = RichRow.fromText("agent", "accent");
  assert.ok(row.ok);

  const wide = row.value.fit(Number.MAX_SAFE_INTEGER);
  const invalid = row.value.fit(0);

  assert.ok(wide.ok);
  assert.equal(wide.value, row.value);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.kind, "invalidWidth");
});
