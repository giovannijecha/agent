import assert from "node:assert/strict";
import test from "node:test";

import {
  activityPulseTones,
  advanceMotionPhase,
  type MotionPhase,
} from "@agent/tui";

test("cycles through one finite deterministic motion sequence", () => {
  const phases: MotionPhase[] = [0];
  for (let index = 0; index < 6; index += 1) {
    phases.push(advanceMotionPhase(phases.at(-1) ?? 0));
  }
  assert.deepEqual(phases, [0, 1, 2, 3, 4, 5, 0]);
});

test("keeps activity pulse geometry fixed across every phase", () => {
  const projections = ([0, 1, 2, 3, 4, 5] as const).map((phase) =>
    activityPulseTones(phase),
  );
  assert.deepEqual(
    projections.map((projection) => projection.length),
    [3, 3, 3, 3, 3, 3],
  );
  assert.deepEqual(projections, [
    ["muted", "muted", "muted"],
    ["plain", "muted", "muted"],
    ["attention", "plain", "muted"],
    ["plain", "attention", "plain"],
    ["muted", "plain", "attention"],
    ["muted", "muted", "plain"],
  ]);
});
