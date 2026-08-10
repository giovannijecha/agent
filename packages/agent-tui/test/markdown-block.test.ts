import assert from "node:assert/strict";
import test from "node:test";

import {
  MarkdownBlock,
  TUI_LIMITS,
  type TextAnchor,
  Viewport,
} from "@agent/tui";

function viewport(columns: number, rows: number): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

function block(text: string, anchor: TextAnchor = "head"): MarkdownBlock {
  const result = MarkdownBlock.create(text, anchor);
  assert.ok(result.ok);
  return result.value;
}

function spans(component: MarkdownBlock, columns = 80, rows = 32) {
  const rendered = component.render(viewport(columns, rows));
  assert.ok(rendered.ok);
  return rendered.value.rows
    .filter((row) => row.text.length > 0)
    .map((row) =>
      row.spans.map((span) => ({ text: span.text, tone: span.tone })),
    );
}

test("compiles the complete owned block and inline subset into semantic spans", () => {
  const rendered = spans(
    block(
      "# Heading\n" +
        "ordinary **strong** and `code`\n" +
        "- item\n" +
        "12. ordered\n" +
        "> quote\n" +
        "```ts\n" +
        "let value = 1;\n" +
        "```",
    ),
  );

  assert.deepEqual(rendered, [
    [{ text: "Heading", tone: "emphasis" }],
    [
      { text: "ordinary ", tone: "plain" },
      { text: "strong", tone: "emphasis" },
      { text: " and ", tone: "plain" },
      { text: "code", tone: "emphasis" },
    ],
    [
      { text: "- ", tone: "muted" },
      { text: "item", tone: "plain" },
    ],
    [
      { text: "12. ", tone: "muted" },
      { text: "ordered", tone: "plain" },
    ],
    [
      { text: "│ ", tone: "muted" },
      { text: "quote", tone: "plain" },
    ],
    [{ text: "│ ts", tone: "muted" }],
    [
      { text: "│ ", tone: "muted" },
      { text: "let value = 1;", tone: "plain" },
    ],
  ]);
});

test("keeps unsupported, incomplete, nested, and escaped syntax literal", () => {
  const rendered = spans(
    block(
      "[label](https://example.invalid)\n" +
        "<b>html</b>\n" +
        "**open\n" +
        "`open\n" +
        "```ts\n" +
        "unclosed\n" +
        "**outer `inner`**\n" +
        "\\**not-an-escape**\n" +
        "***unsupported***\n" +
        "``unsupported``",
    ),
  );

  assert.deepEqual(rendered, [
    [{ text: "[label](https://example.invalid)", tone: "plain" }],
    [{ text: "<b>html</b>", tone: "plain" }],
    [{ text: "**open", tone: "plain" }],
    [{ text: "`open", tone: "plain" }],
    [{ text: "```ts", tone: "plain" }],
    [{ text: "unclosed", tone: "plain" }],
    [{ text: "outer `inner`", tone: "emphasis" }],
    [
      { text: "\\", tone: "plain" },
      { text: "not-an-escape", tone: "emphasis" },
    ],
    [{ text: "***unsupported***", tone: "plain" }],
    [{ text: "``unsupported``", tone: "plain" }],
  ]);
});

test("does not interpret inline syntax inside code spans or fenced code", () => {
  const rendered = spans(
    block("`**literal**`\n```\n**literal** `literal`\n```"),
  );

  assert.deepEqual(rendered, [
    [{ text: "**literal**", tone: "emphasis" }],
    [
      { text: "│ ", tone: "muted" },
      { text: "**literal** `literal`", tone: "plain" },
    ],
  ]);
});

test("normalizes controls, line endings, tabs, and lone surrogates before output", () => {
  const rendered = block(
    "# safe\u001B\r\n> tab\tvalue\r- lone\uD800",
  ).render(viewport(24, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "safe?",
    "│ tab  value",
    "- lone?",
  ]);
  assert.equal(
    rendered.value.rows.flatMap((row) => row.spans).some(
      (span) => span.text.includes("\u001B") || span.text.includes("\uD800"),
    ),
    false,
  );
});

test("wraps by terminal cells while preserving semantic boundaries", () => {
  const rendered = block("plain **boldlong**").render(viewport(8, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.map((row) =>
      row.spans.map((span) => ({ text: span.text, tone: span.tone })),
    ),
    [
      [
        { text: "plain ", tone: "plain" },
        { text: "bo", tone: "emphasis" },
      ],
      [{ text: "ldlong", tone: "emphasis" }],
    ],
  );
  assert.equal(Object.isFrozen(rendered.value.rows.at(0)), true);
  assert.equal(Object.isFrozen(rendered.value.rows.at(0)?.spans), true);
});

test("isolates fenced syntax between bounded documents", () => {
  const created = MarkdownBlock.createDocuments(
    ["you\n```ts\nvalue", "agent\n```\n**answer**"],
    "head",
  );
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(40, 8));

  assert.ok(rendered.ok);
  const agent = rendered.value.rows.find((row) => row.text === "agent");
  const answer = rendered.value.rows.find((row) => row.text === "answer");
  assert.deepEqual(agent?.spans.map((span) => span.tone), ["plain"]);
  assert.deepEqual(answer?.spans.map((span) => span.tone), ["emphasis"]);
});

test("replaces a wide scalar that cannot fit while retaining its tone", () => {
  const rendered = block("**🙂**").render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => ({
      text: span.text,
      tone: span.tone,
    })),
    [{ text: "?", tone: "emphasis" }],
  );
});

test("falls back to one plain literal line when inline roles exceed the span bound", () => {
  const source = "**x**y".repeat(TUI_LIMITS.rowSpans);
  const rendered = block(source).render(
    viewport(TUI_LIMITS.componentColumns, 1),
  );

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, source);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => span.tone),
    ["plain"],
  );
});

test("measures and anchors bounded output with deterministic padding", () => {
  const component = block("# one\n\n> two\n- three", "tail");
  const measured = component.measure(16);
  const rendered = component.render(viewport(16, 3));
  const padded = block("**one**", "tail").render(viewport(16, 2));

  assert.ok(measured.ok);
  assert.equal(measured.value.preferredRows, 4);
  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "",
    "│ two",
    "- three",
  ]);
  assert.ok(padded.ok);
  assert.deepEqual(padded.value.rows.map((row) => row.text), ["", "one"]);
});

test("rejects invalid creation and input bounds without retaining content", () => {
  const exact = MarkdownBlock.create(
    "x".repeat(TUI_LIMITS.displayTextCodeUnits),
    "head",
  );
  const oversized = MarkdownBlock.create(
    "private".repeat(
      Math.ceil((TUI_LIMITS.displayTextCodeUnits + 1) / "private".length),
    ),
    "head",
  );
  const invalidAnchor = MarkdownBlock.create(
    "private",
    "middle" as TextAnchor,
  );
  const tooMany = new Array<string>(TUI_LIMITS.markdownDocuments + 1);
  Object.defineProperty(tooMany, "0", {
    get(): never {
      throw new Error("document getter escaped");
    },
  });
  const oversizedDocuments = MarkdownBlock.createDocuments(tooMany, "head");

  assert.ok(exact.ok);
  assert.equal(oversized.ok, false);
  assert.equal(invalidAnchor.ok, false);
  assert.equal(oversizedDocuments.ok, false);
  if (!oversized.ok) {
    assert.equal(oversized.error.kind, "textTooLong");
    assert.equal("text" in oversized.error, false);
  }
  if (!invalidAnchor.ok) {
    assert.equal(invalidAnchor.error.kind, "invalidAnchor");
  }
  if (!oversizedDocuments.ok) {
    assert.equal(oversizedDocuments.error.kind, "invalidComponentCount");
  }
});
