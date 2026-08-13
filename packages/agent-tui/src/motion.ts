import type { Tone } from "./tone.js";

/** Finite, deterministic projection phase for cosmetic terminal motion. */
export type MotionPhase = 0 | 1 | 2 | 3 | 4 | 5;

export const MOTION_PHASE_COUNT = 6;

const STATIC_PULSE = Object.freeze(["muted", "muted", "muted"] as const);
const LEADING_PULSE = Object.freeze(["plain", "muted", "muted"] as const);
const FIRST_PULSE = Object.freeze(["attention", "plain", "muted"] as const);
const SECOND_PULSE = Object.freeze(["plain", "attention", "plain"] as const);
const THIRD_PULSE = Object.freeze(["muted", "plain", "attention"] as const);
const TRAILING_PULSE = Object.freeze(["muted", "muted", "plain"] as const);

/** Advances the finite motion cycle without consulting a clock. */
export function advanceMotionPhase(phase: MotionPhase): MotionPhase {
  return ((phase + 1) % MOTION_PHASE_COUNT) as MotionPhase;
}

/**
 * Returns constant-width tones for the restrained three-cell activity pulse.
 * Phase zero is the canonical static projection used for snapshots and pipes.
 */
export function activityPulseTones(phase: MotionPhase): readonly Tone[] {
  switch (phase) {
    case 0:
      return STATIC_PULSE;
    case 1:
      return LEADING_PULSE;
    case 2:
      return FIRST_PULSE;
    case 3:
      return SECOND_PULSE;
    case 4:
      return THIRD_PULSE;
    case 5:
      return TRAILING_PULSE;
  }
}
