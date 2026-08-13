import { err, ok, type Result } from "@agent/tui";

import type { ScheduledTimer, TimerClock } from "./timer-clock.js";

export const MOTION_INTERVAL_MILLISECONDS = 125;

export type MotionEvent = Readonly<{ kind: "tick" }>;
export type MotionSourceError = Readonly<{
  kind: "closed" | "concurrentRead";
}>;

export interface MotionSource {
  nextEvent(): Promise<Result<MotionEvent, MotionSourceError>>;
}

/** CLI-owned lifecycle around the pull-based cosmetic event source. */
export interface MotionController extends MotionSource {
  close(): void;
  discardReady(): void;
  frameRendered(): void;
  setActive(active: boolean): void;
}

type Waiter = (result: Result<MotionEvent, MotionSourceError>) => void;

const TICK = Object.freeze({ kind: "tick" as const });

function sourceError(kind: MotionSourceError["kind"]): MotionSourceError {
  return Object.freeze({ kind });
}

/**
 * Coalescing cosmetic scheduler. It permits one timer, one ready tick, and one
 * pending reader; a rendered frame explicitly grants the next delay.
 */
export class MotionScheduler implements MotionController {
  readonly #clock: TimerClock;
  #active = false;
  #closed = false;
  #generation = 0;
  #ready = false;
  #scheduled: ScheduledTimer | undefined;
  #waiter: Waiter | undefined;

  constructor(clock: TimerClock) {
    this.#clock = clock;
  }

  setActive(active: boolean): void {
    if (this.#closed || this.#active === active) {
      return;
    }
    this.#active = active;
    if (!active) {
      this.#invalidateScheduled();
      this.#ready = false;
    }
  }

  /** Grants at most one future tick after a successfully rendered frame. */
  frameRendered(): void {
    if (
      this.#closed ||
      !this.#active ||
      this.#scheduled !== undefined ||
      this.#ready
    ) {
      return;
    }
    const generation = ++this.#generation;
    let scheduled: ScheduledTimer | undefined;
    let firedSynchronously = false;
    try {
      scheduled = this.#clock.schedule(MOTION_INTERVAL_MILLISECONDS, () => {
        if (scheduled === undefined) {
          firedSynchronously = true;
          return;
        }
        if (
          this.#closed ||
          !this.#active ||
          generation !== this.#generation ||
          this.#scheduled !== scheduled
        ) {
          return;
        }
        this.#scheduled = undefined;
        this.#publish();
      });
    } catch (_cause: unknown) {
      return;
    }
    if (firedSynchronously) {
      try {
        scheduled.cancel();
      } catch (_cause: unknown) {
        // A synchronously fired adapter has no live timer left to retain.
      }
      if (
        !this.#closed &&
        this.#active &&
        generation === this.#generation
      ) {
        this.#publish();
      }
      return;
    }
    this.#scheduled = scheduled;
  }

  /** Drops a stale cosmetic invalidation after authoritative state changes. */
  discardReady(): void {
    this.#ready = false;
    if (this.#scheduled !== undefined) {
      this.#invalidateScheduled();
    }
  }

  nextEvent(): Promise<Result<MotionEvent, MotionSourceError>> {
    if (this.#closed) {
      return Promise.resolve(err(sourceError("closed")));
    }
    if (this.#waiter !== undefined) {
      return Promise.resolve(err(sourceError("concurrentRead")));
    }
    if (this.#ready) {
      this.#ready = false;
      return Promise.resolve(ok(TICK));
    }
    return new Promise((resolve) => {
      this.#waiter = resolve;
    });
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#active = false;
    this.#invalidateScheduled();
    this.#ready = false;
    const waiter = this.#waiter;
    this.#waiter = undefined;
    waiter?.(err(sourceError("closed")));
  }

  #invalidateScheduled(): void {
    this.#generation += 1;
    const scheduled = this.#scheduled;
    this.#scheduled = undefined;
    try {
      scheduled?.cancel();
    } catch (_cause: unknown) {
      // Cancellation is best-effort; the generation check rejects late calls.
    }
  }

  #publish(): void {
    const waiter = this.#waiter;
    if (waiter !== undefined) {
      this.#waiter = undefined;
      waiter(ok(TICK));
      return;
    }
    this.#ready = true;
  }
}
