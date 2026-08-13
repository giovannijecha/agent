import assert from "node:assert/strict";
import test from "node:test";

import { createNoticeToken } from "../dist/notice.js";
import {
  NOTICE_DURATION_MILLISECONDS,
  NoticeScheduler,
} from "../dist/notice-scheduler.js";
import type {
  ScheduledTimer,
  TimerClock,
} from "../dist/timer-clock.js";

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

test("expires the exact notice token after the owned duration", async () => {
  const clock = new ManualClock();
  const scheduler = new NoticeScheduler(clock);
  const token = createNoticeToken();
  const pending = scheduler.nextEvent();

  scheduler.setNotice(token);

  assert.deepEqual(clock.delays, [NOTICE_DURATION_MILLISECONDS]);
  clock.registrations.at(0)?.fire();
  const event = await pending;
  assert.ok(event.ok);
  assert.equal(event.value.kind, "expired");
  assert.equal(event.value.token, token);
});

test("replacement cancels the old deadline and rejects its late callback", async () => {
  const clock = new ManualClock();
  const scheduler = new NoticeScheduler(clock);
  const first = createNoticeToken();
  const second = createNoticeToken();

  scheduler.setNotice(first);
  scheduler.setNotice(second);
  assert.equal(clock.registrations.at(0)?.cancelled, true);

  const pending = scheduler.nextEvent();
  clock.registrations.at(0)?.fire();
  clock.registrations.at(1)?.fire();
  const event = await pending;

  assert.ok(event.ok);
  assert.equal(event.value.token, second);
});

test("dismissal and close cancel retained work and wake one reader", async () => {
  const clock = new ManualClock();
  const scheduler = new NoticeScheduler(clock);
  const pending = scheduler.nextEvent();
  const concurrent = await scheduler.nextEvent();

  scheduler.setNotice(createNoticeToken());
  scheduler.setNotice(undefined);
  assert.equal(clock.registrations.at(0)?.cancelled, true);
  clock.registrations.at(0)?.fire();
  scheduler.close();

  assert.equal(concurrent.ok, false);
  if (!concurrent.ok) assert.equal(concurrent.error.kind, "concurrentRead");
  const closed = await pending;
  assert.equal(closed.ok, false);
  if (!closed.ok) assert.equal(closed.error.kind, "closed");
  const afterClose = await scheduler.nextEvent();
  assert.equal(afterClose.ok, false);
  if (!afterClose.ok) assert.equal(afterClose.error.kind, "closed");
});

test("contains a synchronous clock callback as one ready expiry", async () => {
  const registration = new ManualRegistration(() => undefined);
  const clock: TimerClock = Object.freeze({
    schedule(_delayMilliseconds: number, listener: () => void): ScheduledTimer {
      listener();
      return registration;
    },
  });
  const scheduler = new NoticeScheduler(clock);
  const token = createNoticeToken();

  scheduler.setNotice(token);
  const event = await scheduler.nextEvent();

  assert.ok(event.ok);
  assert.equal(event.value.token, token);
  assert.equal(registration.cancelled, true);
});
