/** One cancellable monotonic-clock registration. */
export interface ScheduledTimer {
  cancel(): void;
}

/** Narrow delay capability owned by the platform composition edge. */
export interface TimerClock {
  schedule(delayMilliseconds: number, listener: () => void): ScheduledTimer;
}
