import assert from "node:assert/strict";
import test from "node:test";

import {
  RichRow,
  RichRowError,
  TextSpan,
  TUI_LIMITS,
  type Tone,
} from "@agent/tui";

function span(
  text: string,
  tone: Tone = "plain",
): TextSpan {
  const result = TextSpan.create(text, tone);
  assert.ok(result.ok);
  return result.value;
}

test("composes and normalizes closed slant and surface dimensions", () => {
  const first = TextSpan.create(" quiet", "plain", {
    slant: "italic",
    surface: "subtle",
  });
  const second = TextSpan.create(" turn", "plain", {
    slant: "italic",
    surface: "subtle",
  });
  const plain = TextSpan.create(" plain", "plain");
  assert.ok(first.ok);
  assert.ok(second.ok);
  assert.ok(plain.ok);

  const row = RichRow.create([first.value, second.value, plain.value]);

  assert.ok(row.ok);
  assert.equal(row.value.spans.length, 2);
  assert.deepEqual(
    row.value.spans.map((item) => ({
      slant: item.slant,
      surface: item.surface,
      text: item.text,
      tone: item.tone,
    })),
    [
      {
        slant: "italic",
        surface: "subtle",
        text: " quiet turn",
        tone: "plain",
      },
      {
        slant: "normal",
        surface: "none",
        text: " plain",
        tone: "plain",
      },
    ],
  );
});

test("validates and preserves independent selection and interaction metadata", () => {
  const first = TextSpan.create(
    "https://example.com",
    "accent",
    { mark: "selected", slant: "italic", surface: "subtle" },
    {
      hyperlink: "https://example.com",
      position: { document: 7, offset: 3 },
    },
  );
  const continuation = TextSpan.create(
    "/path",
    "accent",
    { mark: "selected", slant: "italic", surface: "subtle" },
    {
      hyperlink: "https://example.com",
      position: { document: 7, offset: 22 },
    },
  );
  assert.ok(first.ok);
  assert.ok(continuation.ok);

  const row = RichRow.create([first.value, continuation.value]);
  assert.ok(row.ok);
  assert.equal(row.value.spans.length, 1);
  assert.equal(row.value.spans.at(0)?.mark, "selected");
  assert.equal(row.value.spans.at(0)?.hyperlink, "https://example.com");
  assert.deepEqual(row.value.spans.at(0)?.position, {
    document: 7,
    offset: 3,
  });

  const fitted = row.value.fit(10);
  assert.ok(fitted.ok);
  assert.equal(fitted.value.spans.at(0)?.mark, "selected");
  assert.equal(fitted.value.spans.at(0)?.hyperlink, "https://example.com");
  assert.deepEqual(fitted.value.spans.at(0)?.position, {
    document: 7,
    offset: 3,
  });
});

test("rejects hidden, unsafe, and malformed interaction metadata", () => {
  const scheme = TextSpan.create("visible", "plain", undefined, {
    hyperlink: "http://example.com",
  });
  const control = TextSpan.create("visible", "plain", undefined, {
    hyperlink: "https://example.com\u001B",
  });
  const credentials = TextSpan.create("visible", "plain", undefined, {
    hyperlink: "https://user:secret@example.com/path",
  });
  const missingHost = TextSpan.create("visible", "plain", undefined, {
    hyperlink: "https:///path",
  });
  const position = TextSpan.create("visible", "plain", undefined, {
    position: { document: -1, offset: 0 },
  });

  for (const result of [scheme, control, credentials, missingHost, position]) {
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, "invalidSpan");
  }
});

test("accepts only the closed semantic surface vocabulary", () => {
  for (const surface of [
    "attention",
    "failure",
    "inset",
    "none",
    "subtle",
    "success",
  ] as const) {
    const created = TextSpan.create("safe", "plain", { surface });
    assert.ok(created.ok);
    assert.equal(created.value.surface, surface);
  }

  const rejected = TextSpan.create("safe", "plain", {
    surface: "tool-specific" as never,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.kind, "invalidStyle");
});

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

test("rejects malformed or hostile text styles without retaining causes", () => {
  const slant = TextSpan.create("safe", "plain", {
    slant: "oblique" as never,
  });
  const surface = TextSpan.create("safe", "plain", {
    surface: "private" as never,
  });
  const hostile = TextSpan.create(
    "safe",
    "plain",
    new Proxy(
      {},
      {
        get(): never {
          throw new Error("private style getter");
        },
      },
    ),
  );

  for (const result of [slant, surface, hostile]) {
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.kind, "invalidStyle");
      assert.equal("cause" in result.error, false);
      assert.equal(JSON.stringify(result).includes("private"), false);
    }
  }
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

test("preserves composable style while fitting and comparing rows", () => {
  const surfaced = RichRow.fromText("message", "plain", {
    slant: "italic",
    surface: "subtle",
  });
  const plain = RichRow.fromText("mess", "plain");
  assert.ok(surfaced.ok);
  assert.ok(plain.ok);

  const fitted = surfaced.value.fit(4);

  assert.ok(fitted.ok);
  assert.equal(fitted.value.text, "mess");
  assert.equal(fitted.value.spans.at(0)?.slant, "italic");
  assert.equal(fitted.value.spans.at(0)?.surface, "subtle");
  assert.equal(fitted.value.equals(plain.value), false);
});

test("measures the closed structural and prompt glyph set as single cells", () => {
  const border = RichRow.fromText(
    "\u00b7\u2022\u2192\u250c\u2500\u2510\u2502\u2514\u2518\u258c",
  );

  assert.ok(border.ok);
  assert.equal(border.value.cellWidth, 10);
  const fitted = border.value.fit(4);
  assert.ok(fitted.ok);
  assert.equal(fitted.value.text, "\u00b7\u2022\u2192\u250c");
});

test("measures the closed Latin prose profile without widening unknown text", () => {
  const prose = RichRow.fromText(
    "\u00e8\u017e\u1e85\u2013\u2019\u201c\u2026\u2039\u20ac",
  );
  const conservative = RichRow.fromText("\u00ad\u0301\u{1F642}");

  assert.ok(prose.ok);
  assert.equal(prose.value.cellWidth, 9);
  assert.ok(conservative.ok);
  assert.equal(conservative.value.cellWidth, 6);
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
