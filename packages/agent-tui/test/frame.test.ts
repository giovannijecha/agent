import assert from "node:assert/strict";
import test from "node:test";

import { Frame, FrameError, RichRow, TextSpan, TUI_LIMITS } from "@agent/tui";

function row(
  text: string,
  tone: "accent" | "muted" | "plain" = "plain",
): RichRow {
  const result = RichRow.fromText(text, tone);
  assert.ok(result.ok);
  return result.value;
}

test("rejects a hostile structured row at the final frame boundary", () => {
  const result = Frame.create([new Proxy(row("agent"), {})]);

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.error instanceof FrameError);
    assert.equal(result.error.kind, "invalidRow");
    assert.equal(result.error.row, 0);
    assert.equal("line" in result.error, false);
    assert.equal("cause" in result.error, false);
  }
});

test("creates one immutable mixed-tone frame and caret atomically", () => {
  const accent = TextSpan.create("agent", "accent");
  const muted = TextSpan.create(" ready", "muted");
  assert.ok(accent.ok);
  assert.ok(muted.ok);
  const mixed = RichRow.create([accent.value, muted.value]);
  assert.ok(mixed.ok);
  const result = Frame.create(
    [mixed.value, row("ready", "muted")],
    { row: 1, column: 5 },
  );

  assert.ok(result.ok);
  assert.deepEqual(result.value.rows.map((item) => item.text), [
    "agent ready",
    "ready",
  ]);
  assert.deepEqual(result.value.rows.at(0)?.spans.map((item) => item.tone), [
    "accent",
    "muted",
  ]);
  assert.deepEqual(result.value.caret, { row: 1, column: 5 });
  assert.ok(Object.isFrozen(result.value));
  assert.ok(Object.isFrozen(result.value.rows));
  assert.ok(Object.isFrozen(result.value.caret));
});

test("rejects a caret outside the frame or its row", () => {
  const missingRow = Frame.create([row("agent")], { row: 1, column: 0 });
  const pastLine = Frame.create([row("agent")], { row: 0, column: 6 });

  assert.equal(missingRow.ok, false);
  assert.equal(pastLine.ok, false);
  if (!missingRow.ok) assert.equal(missingRow.error.kind, "invalidCaret");
  if (!pastLine.ok) assert.equal(pastLine.error.kind, "invalidCaret");
});

test("rejects oversized frame input before copying rows", () => {
  const oversized = new Proxy(
    new Array<RichRow>(TUI_LIMITS.frameRows + 1),
    {
      get(target, property) {
        if (property !== "length") throw new Error("member read escaped");
        return target.length;
      },
    },
  );
  const tooManyRows = Frame.create(oversized);

  assert.equal(tooManyRows.ok, false);
  if (!tooManyRows.ok) assert.equal(tooManyRows.error.kind, "tooManyRows");
});

test("defensively snapshots accepted rows", () => {
  const source = row("agent", "accent");
  const result = Frame.create([source]);

  assert.ok(result.ok);
  assert.equal(result.value.rows.at(0) === source, false);
  assert.equal(result.value.rows.at(0)?.equals(source), true);
});
