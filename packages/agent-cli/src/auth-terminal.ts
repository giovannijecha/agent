import {
  stdin,
  type ReadableStream,
} from "node:process";

import { err, ok, type Result } from "@agent/core";

export type AuthTerminalError = Readonly<{ kind: "input" }>;
export type AuthTerminalInput =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "value"; value: string }>;

export interface AuthCancellationPort {
  cancelled(): boolean;
  onCancel(listener: () => void): void;
  offCancel(listener: () => void): void;
}

export interface AuthCancellationMonitor {
  readonly cancellation: AuthCancellationPort;
  close(): Result<void, AuthTerminalError>;
}

const CANCELLED = Object.freeze({ kind: "cancelled" as const });
const INPUT_FAILURE = Object.freeze({ kind: "input" as const });
const ESCAPE = "\u001b";
const CONTROL_C = "\u0003";
const CONTROL_D = "\u0004";
const BACKSPACE = "\u007f";
const MAX_CODE_UNITS = 8_192;

function attemptInputCleanup(operation: () => unknown): boolean {
  try {
    operation();
    return true;
  } catch (_cause: unknown) {
    return false;
  }
}

function readZeroEcho(
  mode: Readonly<{ choices?: readonly string[]; line: boolean }>,
  input: ReadableStream,
): Promise<Result<AuthTerminalInput, AuthTerminalError>> {
  return new Promise((resolve) => {
    let settled = false;
    let value = "";

    const finish = (
      result: Result<AuthTerminalInput, AuthTerminalError>,
    ): void => {
      if (settled) return;
      settled = true;
      let cleaned = true;
      if (!attemptInputCleanup(() => input.off("data", onData))) cleaned = false;
      if (!attemptInputCleanup(() => input.off("end", onEnd))) cleaned = false;
      if (!attemptInputCleanup(() => input.off("error", onError))) cleaned = false;
      if (!attemptInputCleanup(() => input.setRawMode(false))) cleaned = false;
      if (!attemptInputCleanup(() => input.pause())) cleaned = false;
      value = "";
      resolve(cleaned ? result : err(INPUT_FAILURE));
    };
    const onEnd = (): void => finish(ok(CANCELLED));
    const onError = (_cause: unknown): void => finish(err(INPUT_FAILURE));
    const onData = (text: string): void => {
      if (settled || typeof text !== "string") return;
      for (const character of text) {
        if (
          character === ESCAPE || character === CONTROL_C ||
          character === CONTROL_D
        ) {
          finish(ok(CANCELLED));
          return;
        }
        if (!mode.line) {
          const choice = character.toLowerCase();
          if (mode.choices?.includes(choice)) {
            finish(ok(Object.freeze({ kind: "value" as const, value: choice })));
            return;
          }
          continue;
        }
        if (character === "\r" || character === "\n") {
          finish(ok(Object.freeze({ kind: "value" as const, value })));
          return;
        }
        if (character === BACKSPACE || character === "\b") {
          value = [...value].slice(0, -1).join("");
          continue;
        }
        if (/\p{Cc}/u.test(character)) continue;
        if (value.length + character.length > MAX_CODE_UNITS) continue;
        value += character;
      }
    };

    try {
      input.setEncoding("utf8");
      input.on("data", onData);
      input.on("end", onEnd);
      input.on("error", onError);
      input.setRawMode(true);
      input.resume();
    } catch (_cause: unknown) {
      finish(err(INPUT_FAILURE));
    }
  });
}

/** Reads one registered action key without echo or retained terminal state. */
export function readAuthChoice(
  choices: readonly string[],
  input: ReadableStream = stdin,
): Promise<Result<AuthTerminalInput, AuthTerminalError>> {
  if (
    !Array.isArray(choices) || choices.length === 0 ||
    choices.some((choice) => !/^[a-z]$/u.test(choice))
  ) {
    return Promise.resolve(err(INPUT_FAILURE));
  }
  return readZeroEcho(Object.freeze({ choices: Object.freeze([...choices]), line: false }), input);
}

/** Reads one bounded line with raw terminal echo disabled. */
export function readConcealedCredential(
  input: ReadableStream = stdin,
): Promise<Result<AuthTerminalInput, AuthTerminalError>> {
  return readZeroEcho(Object.freeze({ line: true }), input);
}

class TerminalCancellation implements AuthCancellationPort {
  readonly #listeners = new Set<() => void>();
  #cancelled = false;

  cancelled(): boolean {
    return this.#cancelled;
  }

  onCancel(listener: () => void): void {
    if (this.#cancelled) {
      listener();
      return;
    }
    this.#listeners.add(listener);
  }

  offCancel(listener: () => void): void {
    this.#listeners.delete(listener);
  }

  cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;
    this.#listeners.forEach((listener) => listener());
  }

  clear(): void {
    this.#listeners.clear();
  }
}

/** Owns zero-echo cancellation keys during one bounded network ceremony. */
export function startAuthCancellationMonitor(
  input: ReadableStream = stdin,
): Result<AuthCancellationMonitor, AuthTerminalError> {
  const cancellation = new TerminalCancellation();
  let closed = false;
  let failed = false;

  const onEnd = (): void => {
    if (!closed) cancellation.cancel();
  };
  const onError = (_cause: unknown): void => {
    if (closed) return;
    failed = true;
    cancellation.cancel();
  };
  const onData = (text: string): void => {
    if (closed || typeof text !== "string") return;
    for (const character of text) {
      if (
        character === ESCAPE || character === CONTROL_C ||
        character === CONTROL_D
      ) {
        cancellation.cancel();
        return;
      }
    }
  };
  const close = (): Result<void, AuthTerminalError> => {
    if (closed) return failed ? err(INPUT_FAILURE) : ok(undefined);
    closed = true;
    if (!attemptInputCleanup(() => input.off("data", onData))) failed = true;
    if (!attemptInputCleanup(() => input.off("end", onEnd))) failed = true;
    if (!attemptInputCleanup(() => input.off("error", onError))) failed = true;
    if (!attemptInputCleanup(() => input.setRawMode(false))) failed = true;
    if (!attemptInputCleanup(() => input.pause())) failed = true;
    cancellation.clear();
    return failed ? err(INPUT_FAILURE) : ok(undefined);
  };

  try {
    input.setEncoding("utf8");
    input.on("data", onData);
    input.on("end", onEnd);
    input.on("error", onError);
    input.setRawMode(true);
    input.resume();
  } catch (_cause: unknown) {
    failed = true;
    cancellation.cancel();
    close();
    return err(INPUT_FAILURE);
  }
  return ok(Object.freeze({ cancellation, close }));
}
