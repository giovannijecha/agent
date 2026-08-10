import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("enters the alternate screen and shows the requested caret", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(frame(["agent"], 0, 5), viewport());

  assert.equal(
    output.text,
    "\u001B[?2026h\u001B[?1049h\u001B[?25l\u001B[2J\u001B[H" +
      "\u001B[1;1H\u001B[2Kagent" +
      "\u001B[1;6H\u001B[?25h\u001B[?2026l",
  );
});

test("always restores a visible cursor for absent or clipped carets", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const withoutCaret = Frame.create([frame(["agent"]).rows[0]!]);
  assert.ok(withoutCaret.ok);

  await renderer.render(withoutCaret.value, viewport(3, 1));
  const first = output.chunks.at(-1) ?? "";
  const clipped = Frame.create([frame(["abcdef"]).rows[0]!], {
    row: 0,
    column: 6,
  });
  assert.ok(clipped.ok);
  await renderer.render(clipped.value, viewport(3, 1));
  const second = output.chunks.at(-1) ?? "";

  assert.equal(
    first.endsWith("\u001B[1;3H\u001B[?25h\u001B[?2026l"),
    true,
  );
  assert.equal(
    second.endsWith("\u001B[1;3H\u001B[?25h\u001B[?2026l"),
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

test("renders only fixed semantic tones and resets each styled span", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(
    tonedFrame(
      ["agent", "ready", "approve", "emphasis"],
      ["accent", "muted", "attention", "emphasis"],
      2,
      7,
    ),
    viewport(),
  );

  assert.equal(output.text.includes("\u001B[1;36magent\u001B[0m"), true);
  assert.equal(output.text.includes("\u001B[2mready\u001B[0m"), true);
  assert.equal(output.text.includes("\u001B[1;33mapprove\u001B[0m"), true);
  assert.equal(output.text.includes("\u001B[1memphasis\u001B[0m"), true);
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
      "\u001B[1;36magent\u001B[0m\u001B[2m ready\u001B[0m plain",
    ),
    true,
  );
  assert.equal(
    output.text.slice(firstSize).includes(
      "\u001B[1;36magent\u001B[0m\u001B[1;33m active\u001B[0m plain",
    ),
    true,
  );
});

test("normalizes an empty emphasized row to plain terminal output", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(tonedFrame([""], ["accent"]), viewport(1, 1));

  assert.equal(output.text.includes("\u001B[1;36m"), false);
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
      "\u001B[1;36magent\u001B[0m" +
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

test("ends a possibly partial synchronized update during cleanup", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  output.failure = "blocked";
  await renderer.render(frame(["one"]), viewport());
  output.failure = undefined;

  const finished = await renderer.finish();

  assert.ok(finished.ok);
  assert.equal(
    output.chunks.at(-1),
    "\u001B[?2026l\u001B[0m\u001B[?25h\u001B[?1049l",
  );
});

test("leaves the alternate screen and cleanup is idempotent", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  await renderer.render(frame(["agent"]), viewport());

  await renderer.finish();
  const afterFirstFinish = output.text;
  await renderer.finish();

  assert.equal(afterFirstFinish.endsWith("\u001B[?25h\u001B[?1049l"), true);
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
  assert.equal(output.text.endsWith("\u001B[?25h\u001B[?1049l"), true);
});
