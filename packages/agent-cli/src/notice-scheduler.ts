import { err, ok, type Result } from "@agent/tui";

import type { NoticeToken } from "./notice.js";
import type { ScheduledTimer, TimerClock } from "./timer-clock.js";

export const NOTICE_DURATION_MILLISECONDS = 5_000;

export type NoticeEvent = Readonly<{
  kind: "expired";
  token: NoticeToken;
}>;

export type NoticeSourceError = Readonly<{
  kind: "closed" | "concurrentRead";
}>;

export interface NoticeSource {
  nextEvent(): Promise<Result<NoticeEvent, NoticeSourceError>>;
}

export interface NoticeController extends NoticeSource {
  close(): void;
  setNotice(token: NoticeToken | undefined): void;
}

type Waiter = (result: Result<NoticeEvent, NoticeSourceError>) => void;

function sourceError(kind: NoticeSourceError["kind"]): NoticeSourceError {
  return Object.freeze({ kind });
}

/** One replaceable, content-free deadline for the latest application notice. */
export class NoticeScheduler implements NoticeController {
  readonly #clock: TimerClock;
  #closed = false;
  #generation = 0;
  #ready: NoticeEvent | undefined;
  #scheduled: ScheduledTimer | undefined;
  #token: NoticeToken | undefined;
  #waiter: Waiter | undefined;

  constructor(clock: TimerClock) {
    this.#clock = clock;
  }

  /** Replaces the current deadline or removes it when no notice is visible. */
  setNotice(token: NoticeToken | undefined): void {
    if (this.#closed || this.#token === token) {
      return;
    }
    this.#invalidateScheduled();
    this.#ready = undefined;
    this.#token = token;
    if (token === undefined) {
      return;
    }

    const generation = ++this.#generation;
    let scheduled: ScheduledTimer | undefined;
    let firedSynchronously = false;
    try {
      scheduled = this.#clock.schedule(
        NOTICE_DURATION_MILLISECONDS,
        () => {
          if (scheduled === undefined) {
            firedSynchronously = true;
            return;
          }
          if (
            this.#closed ||
            this.#token !== token ||
            generation !== this.#generation ||
            this.#scheduled !== scheduled
          ) {
            return;
          }
          this.#scheduled = undefined;
          this.#publish(token);
        },
      );
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
        this.#token === token &&
        generation === this.#generation
      ) {
        this.#publish(token);
      }
      return;
    }
    this.#scheduled = scheduled;
  }

  nextEvent(): Promise<Result<NoticeEvent, NoticeSourceError>> {
    if (this.#closed) {
      return Promise.resolve(err(sourceError("closed")));
    }
    if (this.#waiter !== undefined) {
      return Promise.resolve(err(sourceError("concurrentRead")));
    }
    if (this.#ready !== undefined) {
      const ready = this.#ready;
      this.#ready = undefined;
      return Promise.resolve(ok(ready));
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
    this.#token = undefined;
    this.#invalidateScheduled();
    this.#ready = undefined;
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
      // Generation and token checks reject callbacks from failed cancellation.
    }
  }

  #publish(token: NoticeToken): void {
    const event = Object.freeze({
      kind: "expired" as const,
      token,
    });
    const waiter = this.#waiter;
    if (waiter !== undefined) {
      this.#waiter = undefined;
      waiter(ok(event));
      return;
    }
    this.#ready = event;
  }
}
