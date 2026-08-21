import assert from "node:assert/strict";
import test from "node:test";

import type {
  ClientRequest,
  IncomingMessage,
  RequestOptions,
} from "node:https";

import {
  NodeOpenAIDeviceAuth,
  OPENAI_DEVICE_AUTH_LIMITS,
  OPENAI_DEVICE_CODE_PATH,
  OPENAI_DEVICE_POLL_PATH,
  OPENAI_DEVICE_VERIFICATION_URL,
  OPENAI_TOKEN_PATH,
  type OpenAIDeviceAuthCancellation,
  type OpenAIHttpsClient,
} from "../dist/node-openai-device-auth.js";
import type { ScheduledTimer, TimerClock } from "../dist/timer-clock.js";

type Listener = (() => void) | ((value: unknown) => void);
const SYNTHETIC_PKCE_CHALLENGE =
  "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo";

class FakeResponse implements IncomingMessage {
  readonly headers: IncomingMessage["headers"];
  readonly statusCode: number | undefined;
  readonly #listeners = new Map<string, Listener[]>();
  destroyed = 0;

  constructor(
    statusCode: number,
    readonly body = "",
    content = "application/json",
    readonly autoComplete = true,
  ) {
    this.statusCode = statusCode;
    this.headers = Object.freeze({ "content-type": content });
  }

  destroy(): void {
    this.destroyed += 1;
  }

  on(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event) ?? [];
    listeners.push(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    const listeners = this.#listeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (listeners !== undefined && index >= 0) listeners.splice(index, 1);
    return this;
  }

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }

  emit(event: string, value?: unknown): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) {
      listener(value);
    }
  }
}

class FakeRequest implements ClientRequest {
  readonly #errors: ((cause: unknown) => void)[] = [];
  readonly #onEnd: () => void;
  readonly bodies: string[] = [];
  destroyed = 0;
  timeoutMilliseconds: number | undefined;
  timeoutListener: (() => void) | undefined;

  constructor(onEnd: () => void) {
    this.#onEnd = onEnd;
  }

  destroy(): void {
    this.destroyed += 1;
  }

  end(): void {
    this.#onEnd();
  }

  on(event: "error", listener: (cause: unknown) => void): this {
    void event;
    this.#errors.push(listener);
    return this;
  }

  off(event: "error", listener: (cause: unknown) => void): this {
    void event;
    const index = this.#errors.indexOf(listener);
    if (index >= 0) this.#errors.splice(index, 1);
    return this;
  }

  setTimeout(milliseconds: number, listener: () => void): this {
    this.timeoutMilliseconds = milliseconds;
    this.timeoutListener = listener;
    return this;
  }

  write(body: string): boolean {
    this.bodies.push(body);
    return true;
  }
}

class SequenceClient implements OpenAIHttpsClient {
  readonly options: RequestOptions[] = [];
  readonly requests: FakeRequest[] = [];
  readonly responses: FakeResponse[];

  constructor(responses: readonly FakeResponse[]) {
    this.responses = [...responses];
  }

  request(
    options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    const response = this.responses.at(this.requests.length);
    if (response === undefined) throw new Error("unexpected request");
    this.options.push(options);
    const request = new FakeRequest(() => {
      onResponse(response);
      if (response.statusCode === 200 && response.autoComplete) {
        response.emit("data", ascii(response.body));
        response.emit("end");
      }
    });
    this.requests.push(request);
    return request;
  }
}

class SynchronousRejectingClient implements OpenAIHttpsClient {
  readonly requestValue = new FakeRequest(() => undefined);
  readonly response = new FakeResponse(429);

  request(
    _options: RequestOptions,
    onResponse: (response: IncomingMessage) => void,
  ): ClientRequest {
    onResponse(this.response);
    return this.requestValue;
  }
}

class ManualRegistration implements ScheduledTimer {
  cancelled = false;
  constructor(readonly listener: () => void) {}

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

class Cancellation implements OpenAIDeviceAuthCancellation {
  readonly #listeners = new Set<() => void>();
  #value = false;

  cancelled(): boolean {
    return this.#value;
  }

  onCancel(listener: () => void): void {
    this.#listeners.add(listener);
  }

  offCancel(listener: () => void): void {
    this.#listeners.delete(listener);
  }

  cancel(): void {
    this.#value = true;
    for (const listener of [...this.#listeners]) listener();
  }
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function base64Url(value: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = ascii(value);
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes.at(offset) ?? 0;
    const second = bytes.at(offset + 1);
    const third = bytes.at(offset + 2);
    output += alphabet.at(first >> 2) ?? "";
    output += alphabet.at(((first & 3) << 4) | ((second ?? 0) >> 4)) ?? "";
    if (second !== undefined) {
      output += alphabet.at(((second & 15) << 2) | ((third ?? 0) >> 6)) ?? "";
    }
    if (third !== undefined) output += alphabet.at(third & 63) ?? "";
  }
  return output;
}

function jwt(claims: Readonly<Record<string, unknown>>): string {
  return base64Url('{"alg":"none"}') + "." +
    base64Url(JSON.stringify(claims)) + "." + base64Url("synthetic-signature");
}

function jwtText(claims: string): string {
  return base64Url('{"alg":"none"}') + "." + base64Url(claims) + "." +
    base64Url("synthetic-signature");
}

function successResponses(account = "synthetic-account"): FakeResponse[] {
  const verifier = "A".repeat(43);
  const expiration = Math.floor(Date.now() / 1_000) + 3_600;
  return [
    new FakeResponse(200, JSON.stringify({
      device_auth_id: "synthetic-device",
      expires_at: "synthetic-expiration",
      interval: "2",
      user_code: "ABCD-EFGH",
    })),
    new FakeResponse(200, JSON.stringify({
      authorization_code: "synthetic-authorization",
      code_challenge: SYNTHETIC_PKCE_CHALLENGE,
      code_verifier: verifier,
    })),
    new FakeResponse(200, JSON.stringify({
      access_token: jwt({
        exp: expiration,
        "https://api.openai.com/auth": { chatgpt_account_id: account },
      }),
      id_token: jwt({
        "https://api.openai.com/auth": { chatgpt_account_id: account },
      }),
      refresh_token: "synthetic-refresh-value",
    })),
  ];
}

async function settleMicrotasks(): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) await Promise.resolve();
}

test("performs one exact device, poll, and token exchange", async () => {
  const client = new SequenceClient(successResponses());
  const clock = new ManualClock();
  const shown: unknown[] = [];
  const result = await new NodeOpenAIDeviceAuth(client, clock).authenticate(
    new Cancellation(),
    (challenge) => {
      shown.push(challenge);
      return Promise.resolve(true);
    },
  );

  assert.ok(result.ok);
  assert.equal(result.value.accountId, "synthetic-account");
  assert.deepEqual(shown, [{
    userCode: "ABCD-EFGH",
    verificationUrl: OPENAI_DEVICE_VERIFICATION_URL,
  }]);
  assert.deepEqual(client.options.map((options) => options.path), [
    OPENAI_DEVICE_CODE_PATH,
    OPENAI_DEVICE_POLL_PATH,
    OPENAI_TOKEN_PATH,
  ]);
  for (const options of client.options) {
    assert.equal(options.hostname, "auth.openai.com");
    assert.equal(options.protocol, "https:");
    assert.equal(options.port, 443);
    assert.equal(options.method, "POST");
    assert.equal(options.agent, false);
    assert.equal(options.maxHeaderSize, OPENAI_DEVICE_AUTH_LIMITS.headerBytes);
    assert.equal(options.headers["user-agent"], "agent/0.1.0");
    assert.equal(Object.hasOwn(options.headers, "authorization"), false);
  }
  assert.equal(
    client.requests.at(0)?.bodies.at(0),
    '{"client_id":"app_EMoamEEZ73f0CkXaXp7hrann"}',
  );
  assert.equal(
    client.requests.at(1)?.bodies.at(0),
    '{"device_auth_id":"synthetic-device","user_code":"ABCD-EFGH"}',
  );
  assert.equal(
    /^grant_type=authorization_code&code=synthetic-authorization&redirect_uri=https%3A%2F%2Fauth\.openai\.com%2Fdeviceauth%2Fcallback&client_id=app_EMoamEEZ73f0CkXaXp7hrann&code_verifier=A{43}$/u.test(
      client.requests.at(2)?.bodies.at(0) ?? "",
    ),
    true,
  );
  assert.deepEqual(clock.delays, [OPENAI_DEVICE_AUTH_LIMITS.ceremonyMilliseconds]);
  assert.equal(clock.registrations.at(0)?.cancelled, true);
});

test("admits an absent access-token account claim but rejects a malformed one", async () => {
  const account = "synthetic-account";
  const expiration = Math.floor(Date.now() / 1_000) + 3_600;
  const withoutAccessAccount = successResponses(account);
  withoutAccessAccount.splice(2, 1, new FakeResponse(200, JSON.stringify({
    access_token: jwt({
      exp: expiration,
      "https://api.openai.com/auth": { workspace_id: "synthetic-workspace" },
    }),
    id_token: jwt({
      "https://api.openai.com/auth": { chatgpt_account_id: account },
    }),
    refresh_token: "synthetic-refresh-value",
  })));

  const accepted = await new NodeOpenAIDeviceAuth(
    new SequenceClient(withoutAccessAccount),
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));

  assert.ok(accepted.ok);
  assert.equal(accepted.value.accountId, account);

  const malformedAccessAccount = successResponses(account);
  malformedAccessAccount.splice(2, 1, new FakeResponse(200, JSON.stringify({
    access_token: jwt({
      exp: expiration,
      "https://api.openai.com/auth": { chatgpt_account_id: 7 },
    }),
    id_token: jwt({
      "https://api.openai.com/auth": { chatgpt_account_id: account },
    }),
    refresh_token: "synthetic-refresh-value",
  })));

  const rejected = await new NodeOpenAIDeviceAuth(
    new SequenceClient(malformedAccessAccount),
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));

  assert.deepEqual(rejected, { error: { kind: "protocol" }, ok: false });
});

test("admits only optional bounded poll challenge metadata", async () => {
  const responses = successResponses();
  const poll = JSON.parse(
    responses.at(1)?.body ?? "{}",
  ) as Record<string, unknown>;
  delete poll.code_challenge;
  responses.splice(1, 1, new FakeResponse(200, JSON.stringify(poll)));

  const result = await new NodeOpenAIDeviceAuth(
    new SequenceClient(responses),
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));

  assert.ok(result.ok);

  for (const additional of [
    { code_challenge: "" },
    { unexpected: "field" },
  ]) {
    const rejectedResponses = successResponses();
    const rejectedPoll = JSON.parse(
      rejectedResponses.at(1)?.body ?? "{}",
    ) as Record<string, unknown>;
    delete rejectedPoll.code_challenge;
    Object.assign(rejectedPoll, additional);
    rejectedResponses.splice(
      1,
      1,
      new FakeResponse(200, JSON.stringify(rejectedPoll)),
    );
    const rejected = await new NodeOpenAIDeviceAuth(
      new SequenceClient(rejectedResponses),
      new ManualClock(),
    ).authenticate(new Cancellation(), () => Promise.resolve(true));
    assert.deepEqual(rejected, { error: { kind: "protocol" }, ok: false });
  }
});

test("admits only bounded optional device expiration metadata", async () => {
  const withoutExpiration = successResponses();
  const requiredDevice = JSON.parse(
    withoutExpiration.at(0)?.body ?? "{}",
  ) as Record<string, unknown>;
  delete requiredDevice.expires_at;
  withoutExpiration.splice(
    0,
    1,
    new FakeResponse(200, JSON.stringify(requiredDevice)),
  );
  const accepted = await new NodeOpenAIDeviceAuth(
    new SequenceClient(withoutExpiration),
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));
  assert.ok(accepted.ok);

  for (const device of [
    {
      device_auth_id: "synthetic-device",
      expires_at: "",
      interval: "2",
      user_code: "ABCD-EFGH",
    },
    {
      device_auth_id: "synthetic-device",
      expires_at: "e".repeat(
        OPENAI_DEVICE_AUTH_LIMITS.deviceExpirationBytes + 1,
      ),
      interval: "2",
      user_code: "ABCD-EFGH",
    },
    {
      device_auth_id: "synthetic-device",
      interval: "2",
      unexpected: "field",
      user_code: "ABCD-EFGH",
    },
  ]) {
    const rejected = await new NodeOpenAIDeviceAuth(
      new SequenceClient([new FakeResponse(200, JSON.stringify(device))]),
      new ManualClock(),
    ).authenticate(new Cancellation(), () => Promise.resolve(true));
    assert.deepEqual(rejected, { error: { kind: "protocol" }, ok: false });
  }
});

test("waits the exact interval only after a pending poll", async () => {
  const responses = successResponses();
  responses.splice(1, 0, new FakeResponse(403, "provider-body-not-read"));
  const client = new SequenceClient(responses);
  const clock = new ManualClock();
  const pending = new NodeOpenAIDeviceAuth(client, clock).authenticate(
    new Cancellation(),
    () => Promise.resolve(true),
  );
  await settleMicrotasks();

  assert.deepEqual(clock.delays, [900_000, 2_000]);
  assert.equal(client.requests.length, 2);
  assert.equal(responses.at(1)?.destroyed, 1);
  clock.registrations.at(1)?.fire();

  const result = await pending;
  assert.ok(result.ok);
  assert.equal(client.requests.length, 4);
});

test("cancels an active ceremony without exchanging or replaying", async () => {
  const client = new SequenceClient([
    successResponses().at(0) ?? new FakeResponse(500),
    new FakeResponse(403),
  ]);
  const clock = new ManualClock();
  const cancellation = new Cancellation();
  const pending = new NodeOpenAIDeviceAuth(client, clock).authenticate(
    cancellation,
    () => Promise.resolve(true),
  );
  await settleMicrotasks();
  cancellation.cancel();

  assert.deepEqual(await pending, { error: { kind: "cancelled" }, ok: false });
  assert.equal(client.requests.length, 2);
  assert.equal(clock.registrations.at(1)?.cancelled, true);
});

test("rejects mismatched PKCE before the token request", async () => {
  const responses = successResponses();
  const poll = JSON.parse(responses.at(1)?.body ?? "{}") as Record<string, unknown>;
  poll.code_challenge = "B".repeat(43);
  responses.splice(1, 1, new FakeResponse(200, JSON.stringify(poll)));
  const client = new SequenceClient(responses);

  const result = await new NodeOpenAIDeviceAuth(client, new ManualClock())
    .authenticate(new Cancellation(), () => Promise.resolve(true));

  assert.deepEqual(result, { error: { kind: "protocol" }, ok: false });
  assert.equal(client.requests.length, 2);
});

test("rejects conflicting account binding and expired access", async () => {
  for (const mode of ["conflict", "expired"] as const) {
    const responses = successResponses();
    const account = "synthetic-account";
    const expiration = mode === "expired"
      ? Math.floor(Date.now() / 1_000) - 1
      : Math.floor(Date.now() / 1_000) + 3_600;
    responses.splice(2, 1, new FakeResponse(200, JSON.stringify({
      access_token: jwt({
        exp: expiration,
        "https://api.openai.com/auth": {
          chatgpt_account_id: mode === "conflict" ? "other-account" : account,
        },
      }),
      id_token: jwt({
        "https://api.openai.com/auth": { chatgpt_account_id: account },
      }),
      refresh_token: "synthetic-refresh-value",
    })));
    const result = await new NodeOpenAIDeviceAuth(
      new SequenceClient(responses),
      new ManualClock(),
    ).authenticate(new Cancellation(), () => Promise.resolve(true));
    assert.deepEqual(
      result,
      { error: { kind: mode === "expired" ? "expired" : "protocol" }, ok: false },
    );
  }
});

test("rejects duplicate response and nested claim authorities", async () => {
  const duplicateDevice = new SequenceClient([
    new FakeResponse(
      200,
      '{"device_auth_id":"first","device_auth_id":"second",' +
        '"interval":"2","user_code":"ABCD-EFGH"}',
    ),
  ]);
  const deviceResult = await new NodeOpenAIDeviceAuth(
    duplicateDevice,
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));
  assert.deepEqual(deviceResult, { error: { kind: "protocol" }, ok: false });
  assert.equal(duplicateDevice.requests.length, 1);

  const responses = successResponses();
  const expiration = Math.floor(Date.now() / 1_000) + 3_600;
  responses.splice(2, 1, new FakeResponse(200, JSON.stringify({
    access_token: jwt({ exp: expiration }),
    id_token: jwtText(
      '{"https://api.openai.com/auth":{' +
        '"chatgpt_account_id":"first",' +
        '"chatgpt_account_id":"second"}}',
    ),
    refresh_token: "synthetic-refresh-value",
  })));
  const claimResult = await new NodeOpenAIDeviceAuth(
    new SequenceClient(responses),
    new ManualClock(),
  ).authenticate(new Cancellation(), () => Promise.resolve(true));
  assert.deepEqual(claimResult, { error: { kind: "protocol" }, ok: false });
});

test("settles unexpected status, content type, bounds, and deadline once", async () => {
  for (const response of [
    new FakeResponse(429),
    new FakeResponse(200, "{}", "text/plain"),
  ]) {
    const client = new SequenceClient([response]);
    const result = await new NodeOpenAIDeviceAuth(client, new ManualClock())
      .authenticate(new Cancellation(), () => Promise.resolve(true));
    assert.equal(result.ok, false);
    assert.equal(client.requests.length, 1);
  }

  const oversized = new FakeResponse(200, "", "application/json", false);
  const client = new SequenceClient([oversized]);
  const pending = new NodeOpenAIDeviceAuth(client, new ManualClock())
    .authenticate(new Cancellation(), () => Promise.resolve(true));
  oversized.emit(
    "data",
    new Uint8Array(OPENAI_DEVICE_AUTH_LIMITS.bodyChunkBytes + 1),
  );
  assert.equal((await pending).ok, false);

  const deadlineClient = new SequenceClient([
    new FakeResponse(200, "", "application/json", false),
  ]);
  const clock = new ManualClock();
  const timed = new NodeOpenAIDeviceAuth(deadlineClient, clock)
    .authenticate(new Cancellation(), () => Promise.resolve(true));
  clock.registrations.at(0)?.fire();
  assert.deepEqual(await timed, { error: { kind: "timeout" }, ok: false });
  assert.equal(deadlineClient.requests.at(0)?.destroyed, 1);
});

test("does not write after a synchronous response already settles", async () => {
  const client = new SynchronousRejectingClient();
  const result = await new NodeOpenAIDeviceAuth(client, new ManualClock())
    .authenticate(new Cancellation(), () => Promise.resolve(true));

  assert.deepEqual(result, { error: { kind: "limit" }, ok: false });
  assert.deepEqual(client.requestValue.bodies, []);
  assert.equal(client.requestValue.destroyed, 1);
  assert.equal(client.response.destroyed, 1);
});
