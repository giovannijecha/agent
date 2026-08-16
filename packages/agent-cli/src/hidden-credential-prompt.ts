import {
  type ReadableStream,
  type WritableStream,
} from "node:process";

import { err, ok, type Result } from "@agent/core";

import {
  isValidOpenCodeGoCredential,
  isValidOpenCodeZenCredential,
} from "./provider-configuration.js";

export type HiddenCredentialPromptOutcome =
  | Readonly<{ credential: string; kind: "provided" }>
  | Readonly<{ kind: "cancelled" | "skipped" }>;

export type HiddenCredentialPromptErrorKind =
  | "cleanup"
  | "input"
  | "invalidCredential"
  | "output"
  | "start";

/** Content-free prompt failure with independently observable cleanup state. */
export class HiddenCredentialPromptError {
  readonly #cleanupFailed: boolean;
  readonly #kind: HiddenCredentialPromptErrorKind;

  constructor(kind: HiddenCredentialPromptErrorKind, cleanupFailed = false) {
    this.#kind = kind;
    this.#cleanupFailed = cleanupFailed;
    Object.freeze(this);
  }

  get cleanupFailed(): boolean {
    return this.#cleanupFailed;
  }

  get kind(): HiddenCredentialPromptErrorKind {
    return this.#kind;
  }
}

function writeOutput(
  output: WritableStream,
  text: string,
): Promise<Result<void, HiddenCredentialPromptError>> {
  return new Promise((resolve) => {
    let settled = false;
    let listenerInstalled = false;
    const finish = (succeeded: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      let cleanupFailed = false;
      if (listenerInstalled) {
        try {
          output.off("error", onError);
        } catch (_cause: unknown) {
          cleanupFailed = true;
        }
      }
      resolve(
        succeeded && !cleanupFailed
          ? ok(undefined)
          : err(new HiddenCredentialPromptError("output", cleanupFailed)),
      );
    };
    const onError = (_cause: unknown): void => finish(false);
    try {
      output.on("error", onError);
      listenerInstalled = true;
      output.write(text, (cause?: unknown) => {
        finish(cause === undefined || cause === null);
      });
    } catch (_cause: unknown) {
      finish(false);
    }
  });
}

/**
 * Reads one bounded credential with terminal echo disabled.
 * Empty input explicitly selects providerless startup; Ctrl+C cancels startup.
 */
async function readHiddenCredential(
  input: ReadableStream,
  output: WritableStream,
  label: "OpenCode Go" | "OpenCode Zen",
  validate: (value: unknown) => value is string,
): Promise<Result<HiddenCredentialPromptOutcome, HiddenCredentialPromptError>> {
  if (input.isTTY !== true || output.isTTY !== true) {
    return ok(Object.freeze({ kind: "skipped" as const }));
  }
  const announced = await writeOutput(
    output,
    label + " API key (hidden; Enter skips): ",
  );
  if (!announced.ok) {
    return announced;
  }

  return new Promise((resolve) => {
    const characters: string[] = [];
    let codeUnits = 0;
    let listening = false;
    let rawMode = false;
    let settled = false;

    const cleanup = (): boolean => {
      let failed = false;
      const attempt = (operation: () => void): void => {
        try {
          operation();
        } catch (_cause: unknown) {
          failed = true;
        }
      };
      if (listening) {
        attempt(() => input.off("data", onData));
        attempt(() => input.off("end", onEnd));
        attempt(() => input.off("error", onError));
        listening = false;
      }
      if (rawMode) {
        attempt(() => {
          input.setRawMode(false);
          rawMode = false;
        });
      }
      attempt(() => input.pause());
      return failed;
    };

    const finish = (
      result: Result<HiddenCredentialPromptOutcome, HiddenCredentialPromptError>,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      const cleanupFailed = cleanup();
      characters.splice(0);
      void writeOutput(output, "\n").then((line) => {
        if (!result.ok) {
          resolve(
            err(
              new HiddenCredentialPromptError(
                result.error.kind,
                result.error.cleanupFailed || cleanupFailed || !line.ok,
              ),
            ),
          );
        } else if (cleanupFailed) {
          resolve(err(new HiddenCredentialPromptError("cleanup", true)));
        } else if (!line.ok) {
          resolve(line);
        } else {
          resolve(result);
        }
      });
    };

    const complete = (): void => {
      if (characters.length === 0) {
        finish(ok(Object.freeze({ kind: "skipped" as const })));
        return;
      }
      const credential = characters.join("");
      finish(
        validate(credential)
          ? ok(
              Object.freeze({
                credential,
                kind: "provided" as const,
              }),
            )
          : err(new HiddenCredentialPromptError("invalidCredential")),
      );
    };

    const onData = (text: string): void => {
      try {
        for (const character of text) {
          if (character === "\u0003") {
            finish(ok(Object.freeze({ kind: "cancelled" as const })));
            return;
          }
          if (character === "\r" || character === "\n") {
            complete();
            return;
          }
          if (character === "\u0008" || character === "\u007F") {
            const removed = characters.pop();
            if (removed !== undefined) {
              codeUnits -= removed.length;
            }
            continue;
          }
          if (/\s|\p{Cc}/u.test(character)) {
            finish(err(new HiddenCredentialPromptError("invalidCredential")));
            return;
          }
          codeUnits += character.length;
          if (codeUnits > 8_192) {
            finish(err(new HiddenCredentialPromptError("invalidCredential")));
            return;
          }
          characters.push(character);
        }
      } catch (_cause: unknown) {
        finish(err(new HiddenCredentialPromptError("input")));
      }
    };
    const onEnd = (): void => {
      finish(ok(Object.freeze({ kind: "cancelled" as const })));
    };
    const onError = (_cause: unknown): void => {
      finish(err(new HiddenCredentialPromptError("input")));
    };

    try {
      input.setEncoding("utf8");
      input.on("data", onData);
      input.on("end", onEnd);
      input.on("error", onError);
      listening = true;
      input.setRawMode(true);
      rawMode = true;
      input.resume();
    } catch (_cause: unknown) {
      finish(err(new HiddenCredentialPromptError("start")));
    }
  });
}

export function readHiddenOpenCodeGoCredential(
  input: ReadableStream,
  output: WritableStream,
): Promise<Result<HiddenCredentialPromptOutcome, HiddenCredentialPromptError>> {
  return readHiddenCredential(
    input,
    output,
    "OpenCode Go",
    isValidOpenCodeGoCredential,
  );
}

export function readHiddenOpenCodeZenCredential(
  input: ReadableStream,
  output: WritableStream,
): Promise<Result<HiddenCredentialPromptOutcome, HiddenCredentialPromptError>> {
  return readHiddenCredential(
    input,
    output,
    "OpenCode Zen",
    isValidOpenCodeZenCredential,
  );
}
