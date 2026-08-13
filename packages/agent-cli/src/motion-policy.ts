import type { ApplicationPhase } from "./application.js";

/** Returns whether autonomous work is advancing and may project cosmetic motion. */
export function isMotionActive(phase: ApplicationPhase): boolean {
  return (
    phase === "generating" ||
    phase === "runningTool" ||
    phase === "cancelling"
  );
}
