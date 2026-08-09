import assert from "node:assert/strict";
import test from "node:test";

import {
  err,
  ok,
  type Result,
  type Viewport,
  Viewport as ViewportValue,
} from "@agent/tui";

import { PLAIN_STATUS, run } from "../dist/run.js";
import type { HostEvent, TerminalHost } from "../dist/terminal-host.js";

class FakeHost implements TerminalHost<string> {
  readonly writes: string[] = [];
  readonly #events: Result<HostEvent, string>[];
  readonly interactive: boolean;
  startCalls = 0;
  stopCalls = 0;
  startFailure: string | undefined;
  stopFailure: string | undefined;
  writeFailure: string | undefined;
  #viewport: Viewport;

  constructor(interactive: boolean, events: Result<HostEvent, string>[] = []) {
    this.interactive = interactive;
    this.#events = [...events];
    const viewport = ViewportValue.create(80, 24);
    assert.ok(viewport.ok);
    this.#viewport = viewport.value;
  }

  setViewport(columns: number, rows: number): void {
    const viewport = ViewportValue.create(columns, rows);
    assert.ok(viewport.ok);
    this.#viewport = viewport.value;
  }

  viewport(): Result<Viewport, string> {
    return ok(this.#viewport);
  }

  async write(text: string): Promise<Result<void, string>> {
    this.writes.push(text);
    return this.writeFailure === undefined ? ok(undefined) : err(this.writeFailure);
  }

  async start(): Promise<Result<void, string>> {
    this.startCalls += 1;
    return this.startFailure === undefined ? ok(undefined) : err(this.startFailure);
  }

  async nextEvent(): Promise<Result<HostEvent, string>> {
    return this.#events.shift() ?? ok(Object.freeze({ kind: "end" as const }));
  }

  async stop(): Promise<Result<void, string>> {
    this.stopCalls += 1;
    return this.stopFailure === undefined ? ok(undefined) : err(this.stopFailure);
  }
}

test("uses exact escape-free plain output outside a TTY", async () => {
  const host = new FakeHost(false);

  const result = await run(host);

  assert.ok(result.ok);
  assert.deepEqual(host.writes, [PLAIN_STATUS]);
  assert.equal(host.writes.join("").includes("\u001B"), false);
  assert.equal(host.startCalls, 0);
  assert.equal(host.stopCalls, 0);
});

test("runs an interactive session until the exact exit command", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({ kind: "input" as const, text: "/exit\r" })),
  ]);

  const result = await run(host);

  assert.ok(result.ok);
  assert.equal(host.startCalls, 1);
  assert.equal(host.stopCalls, 1);
  assert.equal(
    host.writes[0]?.startsWith("\u001B[?2026h\u001B[?1049h"),
    true,
  );
  assert.equal(host.writes.at(-1), "\u001B[0m\u001B[?25h\u001B[?1049l");
});

test("redraws after input and resize without losing the draft", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({ kind: "input" as const, text: "draft" })),
    ok(Object.freeze({ kind: "resize" as const })),
    ok(Object.freeze({ kind: "input" as const, text: "\u0003" })),
  ]);
  host.setViewport(40, 8);

  const result = await run(host);

  assert.ok(result.ok);
  assert.equal(host.writes.join("").includes("> draft"), true);
  assert.equal(host.writes.join("").includes("\u001B[2J"), true);
});

test("preserves primary and cleanup failures independently", async () => {
  const host = new FakeHost(true, [err("input failed")]);
  host.stopFailure = "stop failed";

  const result = await run(host);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result.error.primary, {
      kind: "terminal",
      operation: "event",
      error: "input failed",
    });
    assert.deepEqual(result.error.cleanup, [
      { kind: "terminal", error: "stop failed" },
    ]);
  }
});

test("attempts terminal cleanup after a start failure", async () => {
  const host = new FakeHost(true);
  host.startFailure = "raw mode failed";

  const result = await run(host);

  assert.equal(result.ok, false);
  assert.equal(host.stopCalls, 1);
});
