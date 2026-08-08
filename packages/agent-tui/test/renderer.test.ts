import assert from "node:assert/strict";
import test from "node:test";

import {
  Frame,
  type Result,
  Renderer,
  type TextOutput,
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

function frame(lines: readonly string[], row = 0, column = 0): Frame {
  const result = Frame.create(lines, { row, column });
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
    "\u001B[?1049h\u001B[?25l\u001B[2J\u001B[H" +
      "\u001B[1;1H\u001B[2Kagent" +
      "\u001B[1;6H\u001B[?25h",
  );
});

test("always restores a visible cursor for absent or clipped carets", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  const withoutCaret = Frame.create(["agent"]);
  assert.ok(withoutCaret.ok);

  await renderer.render(withoutCaret.value, viewport(3, 1));
  const first = output.chunks.at(-1) ?? "";
  const clipped = Frame.create(["abcdef"], { row: 0, column: 6 });
  assert.ok(clipped.ok);
  await renderer.render(clipped.value, viewport(3, 1));
  const second = output.chunks.at(-1) ?? "";

  assert.equal(first.endsWith("\u001B[1;3H\u001B[?25h"), true);
  assert.equal(second.endsWith("\u001B[1;3H\u001B[?25h"), true);
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
    "\u001B[?25l\u001B[2;1H\u001B[2Kready\u001B[2;6H\u001B[?25h",
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
    "\u001B[?25l\u001B[2J\u001B[H" +
      "\u001B[1;1H\u001B[2Kabcd" +
      "\u001B[1;4H\u001B[?25h",
  );
});

test("clips rows and conservative cell width to the viewport", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);

  await renderer.render(frame(["ab🙂cd", "hidden"], 0, 2), viewport(4, 1));

  assert.equal(output.text.includes("ab🙂"), true);
  assert.equal(output.text.includes("hidden"), false);
});

test("does not commit a failed frame and retries initialization", async () => {
  const output = new MemoryOutput();
  const renderer = new Renderer(output);
  output.failure = "blocked";

  const failed = await renderer.render(frame(["one"]), viewport());
  output.failure = undefined;
  const retried = await renderer.render(frame(["one"]), viewport());

  assert.deepEqual(failed, { ok: false, error: "blocked" });
  assert.ok(retried.ok);
  assert.equal(output.chunks[1]?.startsWith("\u001B[?1049h"), true);
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
