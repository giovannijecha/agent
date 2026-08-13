import { clearTimeout, setTimeout, type Timeout } from "node:timers";

import type { ScheduledTimer, TimerClock } from "./timer-clock.js";

class NodeScheduledTimer implements ScheduledTimer {
  readonly #timeout: Timeout;
  #cancelled = false;

  constructor(timeout: Timeout) {
    this.#timeout = timeout;
  }

  cancel(): void {
    if (this.#cancelled) {
      return;
    }
    this.#cancelled = true;
    clearTimeout(this.#timeout);
  }
}

/** Node-only adapter for CLI schedulers' shared monotonic delay port. */
export class NodeTimerClock implements TimerClock {
  schedule(delayMilliseconds: number, listener: () => void): ScheduledTimer {
    return new NodeScheduledTimer(setTimeout(listener, delayMilliseconds));
  }
}
