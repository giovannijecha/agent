import assert from "node:assert/strict";
import test from "node:test";

import { Viewport } from "@agent/tui";

import { projectConversationStage } from "../dist/conversation-stage.js";

function viewport(columns: number, rows: number): Viewport {
  const created = Viewport.create(columns, rows);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected valid viewport");
  return created.value;
}

test("uses the fluid terminal width with one-cell safety margins", () => {
  assert.deepEqual(projectConversationStage(viewport(192, 40)), {
    columns: 190,
    left: 1,
  });
});

test("keeps one-cell margins on an ordinary viewport", () => {
  assert.deepEqual(projectConversationStage(viewport(72, 24)), {
    columns: 70,
    left: 1,
  });
});

test("keeps the same pure geometry on a short viewport", () => {
  assert.deepEqual(projectConversationStage(viewport(40, 10)), {
    columns: 38,
    left: 1,
  });
});

test("collapses safely to the terminal width", () => {
  assert.deepEqual(projectConversationStage(viewport(1, 1)), {
    columns: 1,
    left: 0,
  });
});
