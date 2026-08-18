import assert from "node:assert/strict";
import test from "node:test";

import {
  ClipboardPayload,
  Frame,
  RichRow,
  type Result,
  Renderer,
  TextSpan,
  type TextOutput,
  type Tone,
  Viewport,
} from "@agent/tui";

class MemoryOutput implements TextOutput<string> {
  readonly chunks: string[] = [];
  failure: string | undefined;

  async write(text: string): Promise<Result<void, string>> {
    this.chunks.push(text);
    return this.failure === undefined
      ? Object.freeze({ ok: true, value: undefined })
      : Object.freeze({ ok: false, error: this.failure });
  }

  get text(): string {
    return this.chunks.join("");
  }
}

class PartialFailureOutput implements TextOutput<string> {
  readonly chunks: string[] = [];
  #failure: Readonly<{ error: string; fragment: string }> | undefined;

  failNextAfter(fragment: string, error = "blocked"): void {
    this.#failure = Object.freeze({ error, fragment });
  }

  async write(text: string): Promise<Result<void, string>> {
    const failure = this.#failure;
    if (failure === undefined) {
      this.chunks.push(text);
      return Object.freeze({ ok: true, value: undefined });
    }
    this.#failure = undefined;
    const offset = text.indexOf(failure.fragment);
    if (offset < 0) {
      throw new Error("partial output fragment invariant");
    }
    this.chunks.push(text.slice(0, offset + failure.fragment.length));
    return Object.freeze({ ok: false, error: failure.error });
  }
}

function tonedFrame(
  lines: readonly string[],
  tones: readonly Tone[],
  row = 0,
  column = 0,
): Frame {
  const structured = lines.map((line, index) => {
    const created = RichRow.fromText(line, tones.at(index) ?? "plain");
    assert.ok(created.ok);
    return created.value;
  });
  const result = Frame.create(structured, { row, column });
  assert.ok(result.ok);
  return result.value;
}

function frame(lines: readonly string[], row = 0, column = 0): Frame {
  const structured = lines.map((line) => {
    const created = RichRow.fromText(line);
    assert.ok(created.ok);
    return created.value;
  });
  const result = Frame.create(structured, { row, column });
  assert.ok(result.ok);
  return result.value;
}

function viewport(columns = 80, rows = 24): Viewport {
  const result = Viewport.create(columns, rows);
  assert.ok(result.ok);
  return result.value;
}

test("enters the alternate screen with one terminal-controlled blinking block caret", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(frame(["agent"], 0, 5), viewport());

  assert.equal(
    output.text,
    "\u001B[?2026h\u001B[?1049h\u001B[?1006h\u001B[?1002h\u001B[?2004h\u001B[?25l\u001B[1 q\u001B[2J\u001B[H" +
      "\u001B[1;1H\u001B[2Kagent" +
      "\u001B[1;6H\u001B[?25h\u001B[?2026l",
  );
});

test("hides the terminal cursor until a visible frame caret owns it", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const size = viewport(3, 1);
  await renderer.render(frame(["abc"], 0, 2), size);
  const visibleBefore = output.chunks.at(-1) ?? "";
  const withoutCaret = Frame.create([frame(["agent"]).rows[0]!]);
  assert.ok(withoutCaret.ok);

  await renderer.render(withoutCaret.value, size);
  const first = output.chunks.at(-1) ?? "";
  const clipped = Frame.create([frame(["abcdef"]).rows[0]!], {
    row: 0,
    column: 6,
  });
  assert.ok(clipped.ok);
  await renderer.render(clipped.value, size);
  const second = output.chunks.at(-1) ?? "";
  await renderer.render(frame(["abc"], 0, 2), size);
  const visibleAfter = output.chunks.at(-1) ?? "";

  assert.equal(
    visibleBefore.endsWith("\u001B[1;3H\u001B[?25h\u001B[?2026l"),
    true,
  );
  assert.equal(first.includes("\u001B[?25l"), true);
  assert.equal(first.includes("\u001B[?25h"), false);
  assert.equal(second.includes("\u001B[?25l"), true);
  assert.equal(second.includes("\u001B[?25h"), false);
  assert.equal(
    visibleAfter.endsWith("\u001B[1;3H\u001B[?25h\u001B[?2026l"),
    true,
  );
});

test("redraws only changed rows at unchanged geometry", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const size = viewport();
  await renderer.render(frame(["agent", "idle"], 1, 4), size);
  const firstSize = output.text.length;

  await renderer.render(frame(["agent", "ready"], 1, 5), size);

  assert.equal(
    output.text.slice(firstSize),
    "\u001B[?2026h\u001B[?25l\u001B[2;1H\u001B[2Kready" +
      "\u001B[2;6H\u001B[?25h\u001B[?2026l",
  );
});

test("serializes a validated clipboard request between frame writes", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const payload = ClipboardPayload.create("copy");
  assert.ok(payload.ok);

  await renderer.render(frame(["agent"]), viewport());
  const copied = await renderer.copy(payload.value);
  await renderer.render(frame(["ready"]), viewport());

  assert.ok(copied.ok);
  assert.equal(output.chunks.at(1), "\u001B]52;c;Y29weQ==\u001B\\");
  assert.equal(output.chunks.length, 3);
  assert.equal(output.chunks.at(2)?.startsWith("\u001B\\\u001B]8;;"), false);
});

test("recovers a partial OSC 52 before finish cleanup", async () => {
  const output = new PartialFailureOutput();
  const renderer = new Renderer(output);
  const payload = ClipboardPayload.create("copy");
  assert.ok(payload.ok);
  await renderer.render(frame(["agent"]), viewport());
  output.failNextAfter("\u001B]52;c;");

  const copied = await renderer.copy(payload.value);
  const finished = await renderer.finish();

  assert.deepEqual(copied, { ok: false, error: "blocked" });
  assert.ok(finished.ok);
  assert.equal(output.chunks.at(2), "\u001B\\\u001B]8;;\u001B\\");
  assert.equal(output.chunks.at(3)?.startsWith("\u001B[0m"), true);
});

test("recovers a partial OSC 52 before the next frame", async () => {
  const output = new PartialFailureOutput();
  const renderer = new Renderer(output);
  const payload = ClipboardPayload.create("copy");
  assert.ok(payload.ok);
  await renderer.render(frame(["agent"]), viewport());
  output.failNextAfter("\u001B]52;c;");
  await renderer.copy(payload.value);

  const rendered = await renderer.render(frame(["ready"]), viewport());

  assert.ok(rendered.ok);
  assert.equal(output.chunks.at(2), "\u001B\\\u001B]8;;\u001B\\");
  assert.equal(output.chunks.at(3)?.startsWith("\u001B[?2026h"), true);
});

test("recovers a partial OSC 8 before finish cleanup", async () => {
  const output = new PartialFailureOutput();
  const renderer = new Renderer(output);
  await renderer.render(frame(["agent"]), viewport());
  const span = TextSpan.create(
    "https://example.com",
    "accent",
    undefined,
    { hyperlink: "https://example.com" },
  );
  assert.ok(span.ok);
  const row = RichRow.create([span.value]);
  assert.ok(row.ok);
  const linked = Frame.create([row.value], { row: 0, column: 0 });
  assert.ok(linked.ok);
  output.failNextAfter("\u001B]8;;https://example.com");

  const rendered = await renderer.render(linked.value, viewport());
  const finished = await renderer.finish();

  assert.deepEqual(rendered, { ok: false, error: "blocked" });
  assert.ok(finished.ok);
  assert.equal(output.chunks.at(2), "\u001B\\\u001B]8;;\u001B\\");
  assert.equal(output.chunks.at(3)?.startsWith("\u001B[?2026l"), true);
});

test("retries failed terminal-string recovery and then finishes idempotently", async () => {
  const output = new PartialFailureOutput();
  const renderer = new Renderer(output);
  const payload = ClipboardPayload.create("copy");
  assert.ok(payload.ok);
  await renderer.render(frame(["agent"]), viewport());
  output.failNextAfter("\u001B]52;c;");
  await renderer.copy(payload.value);
  output.failNextAfter("\u001B");

  const failed = await renderer.finish();
  const retried = await renderer.finish();
  const settledSize = output.chunks.length;
  const idempotent = await renderer.finish();

  assert.deepEqual(failed, { ok: false, error: "blocked" });
  assert.ok(retried.ok);
  assert.ok(idempotent.ok);
  assert.equal(output.chunks.at(-2), "\u001B\\\u001B]8;;\u001B\\");
  assert.equal(output.chunks.at(-1)?.startsWith("\u001B[0m"), true);
  assert.equal(output.chunks.length, settledSize);
});

test("renders only fixed semantic tones and resets each styled span", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(
    tonedFrame(
      [
        "agent",
        "ready",
        "approve",
        "added",
        "removed",
        "success",
        "failure",
        "contrast",
        "emphasis",
      ],
      [
        "accent",
        "muted",
        "attention",
        "diffAdded",
        "diffRemoved",
        "success",
        "failure",
        "highContrast",
        "emphasis",
      ],
      4,
      7,
    ),
    viewport(),
  );

  assert.equal(
    output.text.includes("\u001B[38;2;102;155;210magent\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[38;2;112;124;137mready\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[1;38;2;230;191;95mapprove\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[38;2;134;203;146madded\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[38;2;232;112;112mremoved\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[1;38;2;134;203;146msuccess\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[1;38;2;232;112;112mfailure\u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[38;2;235;239;244mcontrast\u001B[0m"),
    true,
  );
  assert.equal(output.text.includes("\u001B[1memphasis\u001B[0m"), true);
});

test("renders the closed restrained syntax palette on the technical inset", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const tones: readonly Tone[] = [
    "syntaxKeyword",
    "syntaxName",
    "syntaxString",
    "syntaxLiteral",
    "syntaxComment",
  ];
  const expected = [
    "38;2;105;184;255",
    "38;2;131;213;245",
    "38;2;221;184;134",
    "38;2;166;213;123",
    "38;2;127;157;135",
  ];
  const rows = tones.map((tone, index) => {
    const span = TextSpan.create("sample", tone, { surface: "inset" });
    assert.ok(span.ok);
    const row = RichRow.create([span.value]);
    assert.ok(row.ok);
    assert.equal(expected.at(index) !== undefined, true);
    return row.value;
  });
  const styled = Frame.create(rows, { row: 0, column: 0 });
  assert.ok(styled.ok);

  await renderer.render(styled.value, viewport());

  for (const parameters of expected) {
    assert.equal(
      output.text.includes(
        "\u001B[" + parameters + ";48;2;18;24;31msample\u001B[0m",
      ),
      true,
    );
  }
});

test("renders closed italic and subtle-background styles compositionally", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const surfaced = TextSpan.create(" question ", "plain", {
    slant: "italic",
    surface: "subtle",
  });
  const emphasis = TextSpan.create("answer", "emphasis", {
    slant: "italic",
    surface: "subtle",
  });
  assert.ok(surfaced.ok);
  assert.ok(emphasis.ok);
  const row = RichRow.create([surfaced.value, emphasis.value]);
  assert.ok(row.ok);
  const styled = Frame.create([row.value], { row: 0, column: 0 });
  assert.ok(styled.ok);

  await renderer.render(styled.value, viewport());

  assert.equal(
    output.text.includes("\u001B[3;48;2;31;38;47m question \u001B[0m"),
    true,
  );
  assert.equal(
    output.text.includes("\u001B[1;3;48;2;31;38;47manswer\u001B[0m"),
    true,
  );
});

test("renders selected HTTPS spans through closed SGR and OSC 8 sequences", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const span = TextSpan.create(
    "https://example.com",
    "accent",
    { mark: "selected" },
    { hyperlink: "https://example.com" },
  );
  assert.ok(span.ok);
  const row = RichRow.create([span.value]);
  assert.ok(row.ok);
  const rendered = Frame.create([row.value], { row: 0, column: 0 });
  assert.ok(rendered.ok);

  await renderer.render(rendered.value, viewport());

  assert.equal(
    output.text.includes(
      "\u001B]8;;https://example.com\u001B\\" +
        "\u001B[38;2;102;155;210;7mhttps://example.com" +
        "\u001B]8;;\u001B\\\u001B[0m",
    ),
    true,
  );
});

test("renders closed semantic lifecycle backgrounds", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const definitions = [
    ["success", "22;55;34"],
    ["attention", "62;50;19"],
    ["failure", "62;24;27"],
  ] as const;
  const rows = definitions.map(([surface]) => {
    const span = TextSpan.create(surface, "plain", { surface });
    assert.ok(span.ok);
    const row = RichRow.create([span.value]);
    assert.ok(row.ok);
    return row.value;
  });
  const frame = Frame.create(rows, { row: 0, column: 0 });
  assert.ok(frame.ok);

  await renderer.render(frame.value, viewport());

  for (const [surface, color] of definitions) {
    assert.equal(
      output.text.includes(
        "\u001B[48;2;" + color + "m" + surface + "\u001B[0m",
      ),
      true,
    );
  }
});

test("prepaints homogeneous full-width opaque rows before their content", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const row = RichRow.fromText("tool   ", "plain", { surface: "success" });
  assert.ok(row.ok);
  const rendered = Frame.create([row.value], { row: 0, column: 0 });
  assert.ok(rendered.ok);

  await renderer.render(rendered.value, viewport(7, 1));

  assert.equal(
    output.text.includes(
      "\u001B[48;2;22;55;34m       \u001B[0m\u001B[1;1H" +
        "\u001B[48;2;22;55;34mtool   \u001B[0m",
    ),
    true,
  );
});

test("prepaints inset lifecycle runs across mixed foreground styles", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const definitions = [
    ["succeeded", "success", "22;55;34"],
    ["approval required", "attention", "62;50;19"],
    ["failed", "failure", "62;24;27"],
  ] as const;
  const rows = definitions.map(([label, surface]) => {
    const left = TextSpan.create(" ", "plain");
    const identity = TextSpan.create("tool", "plain", {
      slant: "italic",
      surface,
    });
    const gap = TextSpan.create(" ", "plain", { surface });
    const state = TextSpan.create(label, "emphasis", { surface });
    const right = TextSpan.create(" ", "plain");
    assert.ok(left.ok);
    assert.ok(identity.ok);
    assert.ok(gap.ok);
    assert.ok(state.ok);
    assert.ok(right.ok);
    const row = RichRow.create([
      left.value,
      identity.value,
      gap.value,
      state.value,
      right.value,
    ]);
    assert.ok(row.ok);
    return row.value;
  });
  const rendered = Frame.create(rows, { row: 0, column: 0 });
  assert.ok(rendered.ok);

  await renderer.render(rendered.value, viewport(32, 3));

  for (const [index, definition] of definitions.entries()) {
    const [label, _surface, color] = definition;
    const runWidth = "tool ".length + label.length;
    assert.equal(
      output.text.includes(
        "\u001B[" +
          String(index + 1) +
          ";2H\u001B[48;2;" +
          color +
          "m" +
          " ".repeat(runWidth) +
          "\u001B[0m\u001B[" +
          String(index + 1) +
          ";1H",
      ),
      true,
    );
  }
});

test("composes neutral emphasis with semantic lifecycle backgrounds", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const definitions = [
    ["succeeded", "success", "22;55;34"],
    ["approval required", "attention", "62;50;19"],
    ["failed", "failure", "62;24;27"],
  ] as const;
  const rows = definitions.map(([label, surface]) => {
    const span = TextSpan.create(label, "emphasis", { surface });
    assert.ok(span.ok);
    const row = RichRow.create([span.value]);
    assert.ok(row.ok);
    return row.value;
  });
  const styled = Frame.create(rows, { row: 0, column: 0 });
  assert.ok(styled.ok);

  await renderer.render(styled.value, viewport());

  for (const [label, _surface, color] of definitions) {
    assert.equal(
      output.text.includes(
        "\u001B[1;48;2;" + color + "m" + label + "\u001B[0m",
      ),
      true,
    );
  }
});

test("redraws a row when only its composable style changes", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const plain = RichRow.fromText("message");
  const surfaced = RichRow.fromText("message", "plain", {
    slant: "italic",
    surface: "subtle",
  });
  assert.ok(plain.ok);
  assert.ok(surfaced.ok);
  const first = Frame.create([plain.value], { row: 0, column: 0 });
  const second = Frame.create([surfaced.value], { row: 0, column: 0 });
  assert.ok(first.ok);
  assert.ok(second.ok);

  await renderer.render(first.value, viewport());
  const firstSize = output.text.length;
  await renderer.render(second.value, viewport());

  assert.equal(
    output.text.slice(firstSize).includes(
      "\u001B[3;48;2;31;38;47mmessage\u001B[0m",
    ),
    true,
  );
});

test("renders and differentially compares mixed tones within one row", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const product = TextSpan.create("agent", "accent");
  const ready = TextSpan.create(" ready", "muted");
  const active = TextSpan.create(" active", "attention");
  const suffix = TextSpan.create(" plain", "plain");
  assert.ok(product.ok);
  assert.ok(ready.ok);
  assert.ok(active.ok);
  assert.ok(suffix.ok);
  const firstRow = RichRow.create([
    product.value,
    ready.value,
    suffix.value,
  ]);
  const secondRow = RichRow.create([
    product.value,
    active.value,
    suffix.value,
  ]);
  assert.ok(firstRow.ok);
  assert.ok(secondRow.ok);
  const first = Frame.create([firstRow.value], { row: 0, column: 11 });
  const second = Frame.create([secondRow.value], { row: 0, column: 12 });
  assert.ok(first.ok);
  assert.ok(second.ok);

  await renderer.render(first.value, viewport());
  const firstSize = output.text.length;
  await renderer.render(second.value, viewport());

  assert.equal(
    output.text.includes(
      "\u001B[38;2;102;155;210magent\u001B[0m" +
        "\u001B[38;2;112;124;137m ready\u001B[0m plain",
    ),
    true,
  );
  assert.equal(
    output.text.slice(firstSize).includes(
      "\u001B[38;2;102;155;210magent\u001B[0m" +
        "\u001B[1;38;2;230;191;95m active\u001B[0m plain",
    ),
    true,
  );
});

test("normalizes an empty emphasized row to plain terminal output", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(tonedFrame([""], ["accent"]), viewport(1, 1));

  assert.equal(output.text.includes("\u001B[38;2;102;155;210m"), false);
  assert.equal(output.text.includes("\u001B[1;33m"), false);
  assert.equal(output.text.includes("\u001B[1m"), false);
  assert.equal(output.text.includes("\u001B[2m"), false);
});

test("redraws a row when only its semantic tone changes", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const size = viewport();
  await renderer.render(tonedFrame(["agent"], ["plain"], 0, 5), size);
  const firstSize = output.text.length;

  await renderer.render(tonedFrame(["agent"], ["accent"], 0, 5), size);

  assert.equal(
    output.text.slice(firstSize),
    "\u001B[?2026h\u001B[?25l\u001B[1;1H\u001B[2K" +
      "\u001B[38;2;102;155;210magent\u001B[0m" +
      "\u001B[1;6H\u001B[?25h\u001B[?2026l",
  );
});

test("clears and fully redraws after viewport resize", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  await renderer.render(frame(["abcdef"], 0, 5), viewport(6, 2));
  const firstSize = output.text.length;

  await renderer.render(frame(["abcdef"], 0, 3), viewport(4, 1));

  assert.equal(
    output.text.slice(firstSize),
    "\u001B[?2026h\u001B[?25l\u001B[2J\u001B[H" +
      "\u001B[1;1H\u001B[2Kabcd" +
      "\u001B[1;4H\u001B[?25h\u001B[?2026l",
  );
});

test("clips rows and conservative cell width to the viewport", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(frame(["ab🙂cd", "hidden"], 0, 2), viewport(4, 1));

  assert.equal(output.text.includes("ab🙂"), true);
  assert.equal(output.text.includes("hidden"), false);
});

test("resets terminal state before retrying a failed frame", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  output.failure = "blocked";

  const failed = await renderer.render(frame(["one"]), viewport());
  output.failure = undefined;
  const retried = await renderer.render(frame(["one"]), viewport());

  assert.deepEqual(failed, { ok: false, error: "blocked" });
  assert.ok(retried.ok);
  assert.equal(
    output.chunks[1]?.startsWith("\u001B[?2026l\u001B[0m\u001B[?2026h"),
    true,
  );
});

test("ends a possibly partial synchronized update and restores the cursor style during cleanup", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  output.failure = "blocked";
  await renderer.render(frame(["one"]), viewport());
  output.failure = undefined;

  const finished = await renderer.finish();

  assert.ok(finished.ok);
  assert.equal(
    output.chunks.at(-1),
    "\u001B[?2026l\u001B[0m\u001B[?1002l\u001B[?1006l\u001B[?2004l\u001B[0 q\u001B[?25h\u001B[?1049l",
  );
});

test("leaves the alternate screen and cleanup is idempotent", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  await renderer.render(frame(["agent"]), viewport());

  await renderer.finish();
  const afterFirstFinish = output.text;
  await renderer.finish();

  assert.equal(
    afterFirstFinish.endsWith("\u001B[?1002l\u001B[?1006l\u001B[?2004l\u001B[0 q\u001B[?25h\u001B[?1049l"),
    true,
  );
  assert.equal(output.text, afterFirstFinish);
});

test("retries cleanup after a failed leave write", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  await renderer.render(frame(["agent"]), viewport());
  output.failure = "blocked";

  const failed = await renderer.finish();
  output.failure = undefined;
  const retried = await renderer.finish();

  assert.deepEqual(failed, { ok: false, error: "blocked" });
  assert.ok(retried.ok);
  assert.equal(
    output.text.endsWith("\u001B[?1002l\u001B[?1006l\u001B[?2004l\u001B[0 q\u001B[?25h\u001B[?1049l"),
    true,
  );
});
