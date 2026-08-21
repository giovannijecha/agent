import {
  stdin,
  type ReadableStream,
} from "node:process";

import { err, ok, type Result } from "@agent/core";

export type AuthTerminalError = Readonly<{ kind: "input" }>;
export type AuthTerminalInput =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "value"; value: string }>;

const CANCELLED = Object.freeze({ kind: "cancelled" as const });
const INPUT_FAILURE = Object.freeze({ kind: "input" as const });
const ESCAPE = "\u001b";
const CONTROL_C = "\u0003";
const CONTROL_D = "\u0004";
const BACKSPACE = "\u007f";
const MAX_CODE_UNITS = 8_192;

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
      try {
        input.off("data", onData);
        input.off("end", onEnd);
        input.off("error", onError);
        input.setRawMode(false);
        input.pause();
      } catch (_cause: unknown) {
        cleaned = false;
      }
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
