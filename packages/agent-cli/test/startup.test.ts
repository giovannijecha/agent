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
import type {
  ClipboardDisposition,
  ClipboardPort,
  PlatformClipboardError,
} from "../dist/platform-clipboard.js";
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

class FakeClipboard implements ClipboardPort {
  readonly copies: string[] = [];
  readonly #result: Result<ClipboardDisposition, PlatformClipboardError>;

  constructor(result: Result<ClipboardDisposition, PlatformClipboardError>) {
    this.#result = result;
  }

  copy(
    text: string,
  ): Promise<Result<ClipboardDisposition, PlatformClipboardError>> {
    this.copies.push(text);
    return Promise.resolve(this.#result);
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
    ok(Object.freeze({ kind: "input" as const, monotonicMilliseconds: 0, text: "/exit\r" })),
  ]);

  const result = await run(host);

  assert.ok(result.ok);
  assert.equal(host.startCalls, 1);
  assert.equal(host.stopCalls, 1);
  assert.equal(
    host.writes[0]?.startsWith("\u001B[?2026h\u001B[?1049h"),
    true,
  );
  assert.equal(
    host.writes.at(-1),
    "\u001B[0m\u001B[?1002l\u001B[?1006l\u001B[?2004l\u001B[0 q\u001B[?25h\u001B[?1049l",
  );
});

test("redraws after input and resize without losing the draft", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({ kind: "input" as const, monotonicMilliseconds: 0, text: "draft" })),
    ok(Object.freeze({ kind: "resize" as const })),
    ok(Object.freeze({ kind: "input" as const, monotonicMilliseconds: 1, text: "\u0003" })),
  ]);
  host.setViewport(40, 8);

  const result = await run(host);

  assert.ok(result.ok);
  assert.equal(host.writes.join("").includes("\u203a"), false);
  assert.equal(host.writes.join("").includes("draft"), true);
  assert.equal(host.writes.join("").includes("\u001B[2J"), true);
});

test("serializes one settled composer selection through owned OSC 52", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 0,
      text: "alpha beta",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 100,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 110,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 450,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 460,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 500,
      text: "\u0003",
    })),
  ]);
  host.setViewport(40, 8);

  const result = await run(host);

  assert.ok(result.ok);
  const output = host.writes.join("");
  assert.equal(output.includes("\u001B]52;c;YmV0YQ==\u001B\\"), true);
  assert.equal(output.includes("Copy requested!"), true);
});

test("uses confirmed platform copy without emitting OSC 52", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 0,
      text: "alpha beta",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 100,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 110,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 450,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 460,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 500,
      text: "\u0003",
    })),
  ]);
  const clipboard = new FakeClipboard(ok("copied"));
  host.setViewport(40, 8);

  const result = await run(
    host,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    clipboard,
  );

  assert.ok(result.ok);
  assert.deepEqual(clipboard.copies, ["beta"]);
  const output = host.writes.join("");
  assert.equal(output.includes("\u001B]52;"), false);
  assert.equal(output.includes("Copied!"), true);
});

test("keeps clipboard failure nonfatal and reports it truthfully", async () => {
  const host = new FakeHost(true, [
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 0,
      text: "alpha beta",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 100,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 110,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 450,
      text: "\u001B[<0;9;5M",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 460,
      text: "\u001B[<0;9;5m",
    })),
    ok(Object.freeze({
      kind: "input" as const,
      monotonicMilliseconds: 500,
      text: "\u0003",
    })),
  ]);
  const clipboard = new FakeClipboard(err({ kind: "native" }));
  host.setViewport(40, 8);

  const result = await run(
    host,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    clipboard,
  );

  assert.ok(result.ok);
  assert.deepEqual(clipboard.copies, ["beta"]);
  assert.equal(host.writes.join("").includes("Copy failed!"), true);
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
