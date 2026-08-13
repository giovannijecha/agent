import assert from "node:assert/strict";
import test from "node:test";

import type {
  ScheduledTimer,
  TimerClock,
} from "../dist/timer-clock.js";
import {
  MOTION_INTERVAL_MILLISECONDS,
  MotionScheduler,
} from "../dist/motion-scheduler.js";

class ManualRegistration implements ScheduledTimer {
  cancelled = false;
  readonly listener: () => void;

  constructor(listener: () => void) {
    this.listener = listener;
  }

  cancel(): void {
    this.cancelled = true;
  }

  fire(): void {
    this.listener();
  }
}

class ManualClock implements TimerClock {
  readonly delays: number[] = [];
  readonly registrations: ManualRegistration[] = [];

  schedule(delayMilliseconds: number, listener: () => void): ScheduledTimer {
    this.delays.push(delayMilliseconds);
    const registration = new ManualRegistration(listener);
    this.registrations.push(registration);
    return registration;
  }
}

test("schedules one bounded tick only after an active frame is rendered", () => {
  const clock = new ManualClock();
  const scheduler = new MotionScheduler(clock);

  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 0);

  scheduler.setActive(true);
  scheduler.frameRendered();
  scheduler.frameRendered();

  assert.deepEqual(clock.delays, [MOTION_INTERVAL_MILLISECONDS]);
  assert.equal(clock.registrations.length, 1);
  scheduler.close();
});

test("does not build a tick backlog behind a slow render", async () => {
  const clock = new ManualClock();
  const scheduler = new MotionScheduler(clock);
  scheduler.setActive(true);
  scheduler.frameRendered();

  clock.registrations[0]?.fire();
  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 1);

  const first = await scheduler.nextEvent();
  assert.deepEqual(first, { ok: true, value: { kind: "tick" } });
  scheduler.frameRendered();
  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 2);
  scheduler.close();
});

test("delivers a pending tick exactly once and rearms only after render", async () => {
  const clock = new ManualClock();
  const scheduler = new MotionScheduler(clock);
  const pending = scheduler.nextEvent();

  scheduler.setActive(true);
  scheduler.frameRendered();
  clock.registrations[0]?.fire();

  assert.deepEqual(await pending, { ok: true, value: { kind: "tick" } });
  assert.equal(clock.registrations.length, 1);

  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 2);
  scheduler.close();
});

test("deactivation cancels timers and rejects late callbacks", async () => {
  const clock = new ManualClock();
  const scheduler = new MotionScheduler(clock);
  scheduler.setActive(true);
  scheduler.frameRendered();
  const registration = clock.registrations[0];

  scheduler.setActive(false);
  assert.equal(registration?.cancelled, true);
  registration?.fire();

  const pending = scheduler.nextEvent();
  scheduler.close();
  assert.deepEqual(await pending, { ok: false, error: { kind: "closed" } });
});

test("authoritative redraws discard and rebase a pending cosmetic timer", () => {
  const clock = new ManualClock();
  const scheduler = new MotionScheduler(clock);
  scheduler.setActive(true);
  scheduler.frameRendered();
  const stale = clock.registrations[0];

  scheduler.discardReady();
  assert.equal(stale?.cancelled, true);
  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 2);

  stale?.fire();
  scheduler.frameRendered();
  assert.equal(clock.registrations.length, 2);
  scheduler.close();
});

test("rejects concurrent reads without disturbing the retained reader", async () => {
  const scheduler = new MotionScheduler(new ManualClock());
  const retained = scheduler.nextEvent();
  const concurrent = await scheduler.nextEvent();

  assert.deepEqual(concurrent, {
    ok: false,
    error: { kind: "concurrentRead" },
  });

  scheduler.close();
  assert.deepEqual(await retained, { ok: false, error: { kind: "closed" } });
  scheduler.close();
});
