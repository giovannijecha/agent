import assert from "node:assert/strict";
import test from "node:test";

import {
  MarkdownBlock,
  TextSelection,
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
        "> quote",
    ),
  );

  assert.deepEqual(rendered, [
    [{ text: "Heading", tone: "emphasis" }],
    [
      { text: "ordinary ", tone: "plain" },
      { text: "strong", tone: "emphasis" },
      { text: " and ", tone: "plain" },
      { text: "code", tone: "accent" },
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
  ]);
});

test("applies a caller-owned base tone without overriding Markdown roles", () => {
  const created = MarkdownBlock.create(
    "ordinary **strong** and `code`",
    "head",
    { baseTone: "highContrast", document: 1 },
  );
  assert.ok(created.ok);
  if (!created.ok) {
    return;
  }

  assert.deepEqual(spans(created.value), [
    [
      { text: "ordinary ", tone: "highContrast" },
      { text: "strong", tone: "emphasis" },
      { text: " and ", tone: "highContrast" },
      { text: "code", tone: "accent" },
    ],
  ]);
});

test("renders exact single-asterisk emphasis as italic visible text", () => {
  const selection = TextSelection.create(
    { document: 2, offset: 7 },
    { document: 2, offset: 12 },
  );
  assert.ok(selection !== undefined);
  const created = MarkdownBlock.create(
    "before *Fine.* after **strong** and `code`",
    "head",
    { document: 2, selection },
  );
  assert.ok(created.ok);
  if (!created.ok) {
    return;
  }

  const rendered = created.value.render(viewport(80, 1));
  assert.ok(rendered.ok);
  assert.equal(
    rendered.value.rows.at(0)?.text,
    "before Fine. after strong and code",
  );
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => ({
      slant: span.slant,
      text: span.text,
      tone: span.tone,
    })),
    [
      { slant: "normal", text: "before ", tone: "plain" },
      { slant: "italic", text: "Fine.", tone: "plain" },
      { slant: "normal", text: " after ", tone: "plain" },
      { slant: "normal", text: "strong", tone: "emphasis" },
      { slant: "normal", text: " and ", tone: "plain" },
      { slant: "normal", text: "code", tone: "accent" },
    ],
  );
  assert.equal(
    rendered.value.rows.at(0)?.spans.find((span) => span.text === "Fine.")
      ?.mark,
    "selected",
  );
  assert.equal(
    created.value.selectionText(),
    "before Fine. after strong and code",
  );
});

test("keeps later inline markers literal inside italic emphasis", () => {
  const rendered = block("*outer **inner** and `code` tail*").render(
    viewport(80, 1),
  );

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => ({
      slant: span.slant,
      text: span.text,
      tone: span.tone,
    })),
    [
      {
        slant: "italic",
        text: "outer **inner** and `code` tail",
        tone: "plain",
      },
    ],
  );
});

test("assigns stable pre-wrap offsets, closed selection, and visible HTTPS links", () => {
  const selection = TextSelection.create(
    { document: 9, offset: 6 },
    { document: 9, offset: 11 },
  );
  assert.ok(selection !== undefined);
  const created = MarkdownBlock.create(
    "hello world https://example.com/path, tail",
    "head",
    { document: 9, selection },
  );
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(12, 5));
  assert.ok(rendered.ok);
  const retained = rendered.value.rows.flatMap((row) => row.spans);
  const selected = retained.filter((span) => span.mark === "selected");
  const linked = retained.filter((span) => span.hyperlink !== undefined);

  assert.equal(selected.map((span) => span.text).join(""), "world");
  assert.equal(
    linked.every((span) => span.hyperlink === "https://example.com/path"),
    true,
  );
  assert.equal(linked.map((span) => span.text).join(""), "https://example.com/path");
  assert.equal(created.value.selectionText(), "hello world https://example.com/path, tail");
});

test("rejects hostile interactive selection metadata without retaining it", () => {
  const selection = TextSelection.create(
    { document: 1, offset: 0 },
    { document: 1, offset: 2 },
  );
  assert.ok(selection !== undefined);
  const proxied = new Proxy(selection, {});
  const throwing = new Proxy({}, {
    get() {
      throw new Error("private interaction");
    },
  });

  const proxyResult = MarkdownBlock.create("private", "head", {
    document: 1,
    selection: proxied,
  });
  const throwingResult = MarkdownBlock.create(
    "private",
    "head",
    throwing as never,
  );

  assert.equal(proxyResult.ok, false);
  assert.equal(throwingResult.ok, false);
});

test("keeps interactive offsets contiguous across soft wraps and skips Markdown syntax", () => {
  const created = MarkdownBlock.create(
    "**alpha** beta gamma",
    "head",
    { document: 4 },
  );
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(7, 3));
  assert.ok(rendered.ok);
  const positioned = rendered.value.rows
    .flatMap((row) => row.spans)
    .filter((span) => span.position !== undefined);

  assert.equal(created.value.selectionText(), "alpha beta gamma");
  assert.deepEqual(
    positioned.map((span) => ({
      offset: span.position?.offset,
      text: span.text,
    })),
    [
      { offset: 0, text: "alpha" },
      { offset: 6, text: "beta" },
      { offset: 11, text: "gamma" },
    ],
  );
});

test("keeps unsupported, incomplete, nested, and escaped syntax literal", () => {
  const rendered = spans(
    block(
      "[label](https://example.invalid)\n" +
        "<b>html</b>\n" +
        "*open\n" +
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
    [{ text: "*open", tone: "plain" }],
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
  const rendered = block(
    "`**literal**`\n```\n**literal** `literal`\n```",
  ).render(viewport(40, 4));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "**literal**");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "accent");
  const code = rendered.value.rows.at(1);
  assert.equal(code?.text.trim(), "**literal** `literal`");
  assert.deepEqual(code?.spans.map((span) => span.tone), ["plain"]);
  assert.equal(
    code?.spans.every((span) => span.surface === "none"),
    true,
  );
});

test("normalizes controls, line endings, tabs, and lone surrogates before output", () => {
  const rendered = block(
    "# safe\u001B\r\n> tab\tvalue\r- lone\uD800",
  ).render(viewport(24, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "safe?",
    "│ tab   value",
    "- lone?",
  ]);
  assert.equal(
    rendered.value.rows.flatMap((row) => row.spans).some(
      (span) => span.text.includes("\u001B") || span.text.includes("\uD800"),
    ),
    false,
  );
});

test("wraps prose at word boundaries while preserving semantic spans", () => {
  const rendered = block("plain **boldlong**").render(viewport(8, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.map((row) =>
      row.spans.map((span) => ({ text: span.text, tone: span.tone })),
    ),
    [
      [{ text: "plain", tone: "plain" }],
      [{ text: "boldlong", tone: "emphasis" }],
    ],
  );
  assert.equal(Object.isFrozen(rendered.value.rows.at(0)), true);
  assert.equal(Object.isFrozen(rendered.value.rows.at(0)?.spans), true);
});

test("preserves italic emphasis through shared word wrapping", () => {
  const rendered = block("plain *italiclong*").render(viewport(8, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(
    rendered.value.rows.map((row) =>
      row.spans.map((span) => ({
        slant: span.slant,
        text: span.text,
        tone: span.tone,
      })),
    ),
    [
      [{ slant: "normal", text: "plain", tone: "plain" }],
      [{ slant: "italic", text: "italiclo", tone: "plain" }],
    ],
  );
});

test("uses hanging structural prefixes on wrapped Markdown prose", () => {
  const rendered = block("- alpha beta\n> alpha beta").render(
    viewport(8, 4),
  );

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "- alpha",
    "  beta",
    "│ alpha",
    "│ beta",
  ]);
});

test("keeps a one-row fenced region compact and transparent", () => {
  const rendered = block("```\nab cd\n```").render(viewport(7, 2));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "ab cd");
  assert.equal(
    rendered.value.rows.at(0)?.spans.every(
      (span) => span.surface === "none" && span.slant === "normal",
    ),
    true,
  );
  assert.equal(rendered.value.rows.at(1)?.text, "");
});

test("keeps a complete empty fenced region visibly structured and transparent", () => {
  const rendered = block("```\n```").render(viewport(8, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, " ");
  assert.equal(rendered.value.rows.at(0)?.cellWidth, 1);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.surface, "none");
});

test("retains padded literal wrapping for larger fenced regions", () => {
  const rendered = block("```\nabcdef\nx\ny\n```").render(viewport(7, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    " abcde ",
    " f     ",
  ]);
  assert.equal(
    rendered.value.rows.every((row) =>
      row.spans.every((span) => span.surface === "none"),
    ),
    true,
  );
});

test("drops structured padding before content in a one-column viewport", () => {
  const rendered = block("```\nabc\n```").render(viewport(1, 1));

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, "a");
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.surface, "none");
});

test("paints only the retained tail of a clipped structured region", () => {
  const rendered = block(
    "before\n```\none\ntwo\n```",
    "tail",
  ).render(viewport(8, 2));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "one",
    "two",
  ]);
  assert.equal(
    rendered.value.rows.every((row) =>
      row.spans.every((span) => span.surface === "none"),
    ),
    true,
  );
});

test("renders fenced language labels as parser-owned accents", () => {
  const rendered = block("```ts\nconst value = 1;\n```").render(
    viewport(32, 2),
  );

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text.trimEnd(), "ts");
  assert.equal(rendered.value.rows.at(0)?.text.startsWith("ts"), true);
  assert.equal(rendered.value.rows.at(0)?.spans.at(0)?.tone, "accent");
  assert.equal(rendered.value.rows.at(1)?.text.trimEnd(), "const value = 1;");
  assert.equal(
    rendered.value.rows.at(1)?.text.startsWith("const value = 1;"),
    true,
  );
  assert.deepEqual(
    rendered.value.rows.at(1)?.spans.map((span) => span.tone),
    ["syntaxKeyword", "plain", "syntaxLiteral", "plain"],
  );
  assert.equal(
    rendered.value.rows.every((row) =>
      row.spans.every((span) => span.surface === "none"),
    ),
    true,
  );
});

test("renders the exact Markdown separator across the available width", () => {
  const rendered = block("before\n---\nafter").render(viewport(8, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "before",
    "\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
    "after",
  ]);
  assert.equal(rendered.value.rows.at(1)?.spans.at(0)?.tone, "muted");
  assert.equal(rendered.value.rows.at(1)?.spans.at(0)?.surface, "none");
});

test("expands a retained separator after head and tail clipping", () => {
  const source = "pre\n---\npost";
  const head = block(source, "head").render(viewport(5, 2));
  const tail = block(source, "tail").render(viewport(5, 2));

  assert.ok(head.ok);
  assert.deepEqual(head.value.rows.map((row) => row.text), [
    "pre",
    "\u2500\u2500\u2500\u2500\u2500",
  ]);
  assert.ok(tail.ok);
  assert.deepEqual(tail.value.rows.map((row) => row.text), [
    "\u2500\u2500\u2500\u2500\u2500",
    "post",
  ]);
});

test("keeps unsupported separator variants literal", () => {
  const rendered = block("--\n----\n - - - \n***").render(viewport(12, 4));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "--",
    "----",
    " - - - ",
    "***",
  ]);
});

test("highlights the closed HTML, CSS, and script profiles transparently", () => {
  const rendered = block(
    "```html\n" +
      '<main class="shell">\n' +
      "<style>\n" +
      "body { color: #abc; /* note */ }\n" +
      "</style>\n" +
      "<script>\n" +
      "const ready = true;\n" +
      "</script>\n" +
      "</main>\n" +
      "```",
  ).render(viewport(96, 10));

  assert.ok(rendered.ok);
  const allSpans = rendered.value.rows.flatMap((row) => row.spans);
  assert.equal(allSpans.every((span) => span.surface === "none"), true);
  assert.equal(
    allSpans.some(
      (span) => span.text === "main" && span.tone === "syntaxName",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === '"shell"' && span.tone === "syntaxString",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "color" && span.tone === "syntaxName",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "#abc" && span.tone === "syntaxLiteral",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "/* note */" && span.tone === "syntaxComment",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) =>
        span.text.trim() === "const" && span.tone === "syntaxKeyword",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "true" && span.tone === "syntaxLiteral",
    ),
    true,
  );
});

test("keeps embedded closing-tag text inside strings and line comments", () => {
  const rendered = block(
    "```html\n" +
      "<script>\n" +
      'const marker = "</script>";\n' +
      "// </script>\n" +
      "const stillInside = true;\n" +
      "</script>\n" +
      "<section>ok</section>\n" +
      "```",
  ).render(viewport(96, 8));

  assert.ok(rendered.ok);
  const allSpans = rendered.value.rows.flatMap((row) => row.spans);
  assert.equal(
    allSpans.some(
      (span) =>
        span.text === '"</script>"' && span.tone === "syntaxString",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) =>
        span.text.trim() === "// </script>" &&
        span.tone === "syntaxComment",
    ),
    true,
  );
  assert.equal(
    allSpans.filter(
      (span) => span.text.trim() === "const" && span.tone === "syntaxKeyword",
    ).length,
    2,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "section" && span.tone === "syntaxName",
    ),
    true,
  );
});

test("highlights JSON keys, strings, and literals without changing source text", () => {
  const source = '{"name":"agent","ready":true,"count":2}';
  const rendered = block("```json\n" + source + "\n```").render(
    viewport(96, 2),
  );

  assert.ok(rendered.ok);
  const code = rendered.value.rows.at(1);
  assert.equal(code?.text.trim(), source);
  assert.equal(
    code?.spans.some(
      (span) => span.text === '"name"' && span.tone === "syntaxName",
    ),
    true,
  );
  assert.equal(
    code?.spans.some(
      (span) => span.text === '"agent"' && span.tone === "syntaxString",
    ),
    true,
  );
  assert.equal(
    code?.spans.some(
      (span) => span.text === "true" && span.tone === "syntaxLiteral",
    ),
    true,
  );
});

test("highlights commands, flags, variables, strings, and comments", () => {
  const rendered = block(
    "```powershell\n" +
      '$result = npm run build --silent # verify\n' +
      'Write-Output "done"\n' +
      "```",
  ).render(viewport(96, 3));

  assert.ok(rendered.ok);
  const allSpans = rendered.value.rows.flatMap((row) => row.spans);
  assert.equal(
    allSpans.some(
      (span) =>
        span.text.trim() === "$result" && span.tone === "syntaxName",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) => span.text === "--silent" && span.tone === "syntaxKeyword",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) =>
        span.text.trim() === "# verify" && span.tone === "syntaxComment",
    ),
    true,
  );
  assert.equal(
    allSpans.some(
      (span) =>
        span.text.trim() === '"done"' && span.tone === "syntaxString",
    ),
    true,
  );
});

test("keeps unknown and unlabeled fences plain inside the technical region", () => {
  const unknown = block("```rust\nlet value = 1;\n```").render(
    viewport(40, 2),
  );
  const unlabeled = block("```\nlet value = 1;\n```").render(
    viewport(40, 1),
  );

  assert.ok(unknown.ok);
  assert.ok(unlabeled.ok);
  assert.deepEqual(
    unknown.value.rows.at(1)?.spans.map((span) => span.tone),
    ["plain"],
  );
  assert.deepEqual(
    unlabeled.value.rows.at(0)?.spans.map((span) => span.tone),
    ["plain"],
  );
  assert.equal(
    unknown.value.rows.at(1)?.spans.at(0)?.surface,
    "none",
  );
});

test("carries multiline lexical state and falls back when syntax spans overflow", () => {
  const comment = block(
    "```ts\n/* open\nstill comment */ const ready = true;\n```",
  ).render(viewport(96, 3));
  const alternating = "const a=1;".repeat(TUI_LIMITS.rowSpans);
  const overflow = block("```ts\n" + alternating + "\n```").render(
    viewport(TUI_LIMITS.componentColumns, 2),
  );

  assert.ok(comment.ok);
  assert.ok(overflow.ok);
  assert.equal(
    comment.value.rows.at(1)?.spans.some(
      (span) => span.text.trim() === "/* open" && span.tone === "syntaxComment",
    ),
    true,
  );
  assert.equal(
    comment.value.rows.at(2)?.spans.some(
      (span) =>
        span.text.trimStart().startsWith("still comment */") &&
        span.tone === "syntaxComment",
    ),
    true,
  );
  assert.equal(overflow.value.rows.at(1)?.text.trim(), alternating);
  assert.deepEqual(
    overflow.value.rows.at(1)?.spans.map((span) => span.tone),
    ["plain"],
  );
});

test("renders strict pipe tables as one transparent structured region", () => {
  const rendered = block(
    "| name | kind |\n| --- | :---: |\n| agent | `owned` |",
  ).render(viewport(32, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text.trim()), [
    "name  │ kind",
    "─".repeat(13),
    "agent │ owned",
  ]);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans
      .filter((span) => span.text.trim().length > 0)
      .map((span) => span.tone),
    ["emphasis", "muted", "emphasis"],
  );
  assert.deepEqual(
    rendered.value.rows.at(1)?.spans
      .filter((span) => span.text.trim().length > 0)
      .map((span) => span.tone),
    ["muted"],
  );
  assert.deepEqual(
    rendered.value.rows.at(2)?.spans
      .filter((span) => span.text.trim().length > 0)
      .map((span) => span.tone),
    ["plain", "muted", "accent"],
  );
  assert.equal(
    rendered.value.rows.every((row) =>
      row.spans.every((span) => span.surface === "none"),
    ),
    true,
  );
  assert.equal(
    rendered.value.rows.at(0)?.cellWidth,
    rendered.value.rows.at(1)?.cellWidth,
  );
});

test("aligns every strict table column across uneven cell content", () => {
  const rendered = block(
    "| Element | Value |\n| --- | --- |\n| Type | HTML5 |\n| Language | Italian |",
  ).render(viewport(40, 4));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text.trim()), [
    "Element  \u2502 Value",
    "─".repeat(18),
    "Type     \u2502 HTML5",
    "Language \u2502 Italian",
  ]);
  assert.deepEqual(
    rendered.value.rows.map((row) => row.cellWidth),
    [20, 20, 20, 20],
  );
});

test("keeps malformed pipe-table candidates literal and unboxed", () => {
  const rendered = block(
    "| name | kind |\n| -- | --- |\n| agent | owned |",
  ).render(viewport(32, 3));

  assert.ok(rendered.ok);
  assert.deepEqual(rendered.value.rows.map((row) => row.text), [
    "| name | kind |",
    "| -- | --- |",
    "| agent | owned |",
  ]);
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .every((span) => span.surface === "none"),
    true,
  );
});

test("leaves ordinary assistant prose unboxed", () => {
  const rendered = block("ordinary **answer**").render(viewport(32, 1));

  assert.ok(rendered.ok);
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .every((span) => span.surface === "none"),
    true,
  );
});

test("isolates fenced syntax between bounded documents", () => {
  const created = MarkdownBlock.createDocuments(
    ["you\n```ts\nvalue", "agent\n```\n**answer**"],
    "head",
  );
  assert.ok(created.ok);

  const rendered = created.value.render(viewport(40, 12));

  assert.ok(rendered.ok);
  const agent = rendered.value.rows.find((row) => row.text === "agent");
  const answer = rendered.value.rows.find((row) => row.text === "answer");
  assert.deepEqual(agent?.spans.map((span) => span.tone), ["plain"]);
  assert.deepEqual(answer?.spans.map((span) => span.tone), ["emphasis"]);
  assert.equal(
    rendered.value.rows
      .flatMap((row) => row.spans)
      .every((span) => span.surface === "none"),
    true,
  );
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
  const source = "*x*y**z**w".repeat(TUI_LIMITS.rowSpans);
  const rendered = block(source).render(
    viewport(TUI_LIMITS.componentColumns, 1),
  );

  assert.ok(rendered.ok);
  assert.equal(rendered.value.rows.at(0)?.text, source);
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => span.tone),
    ["plain"],
  );
  assert.deepEqual(
    rendered.value.rows.at(0)?.spans.map((span) => span.slant),
    ["normal"],
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
