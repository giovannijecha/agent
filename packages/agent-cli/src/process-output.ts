import { err, ok, type Result } from "@agent/core";

export type ProcessOutputFailure = "output";

export interface ProcessTextOutput {
  on(event: "error", listener: (cause: unknown) => void): unknown;
  off(event: "error", listener: (cause: unknown) => void): unknown;
  write(text: string, callback: (cause?: unknown) => void): boolean;
}

/**
 * Settles one Node process-stream write without exposing its error content.
 * Node invokes an errored write callback before emitting the matching error
 * event, so the temporary listener must remain until that event is consumed.
 */
export function writeProcessText(
  output: ProcessTextOutput,
  text: string,
): Promise<Result<void, ProcessOutputFailure>> {
  return new Promise((resolve) => {
    let listenerInstalled = false;
    let settled = false;

    const finish = (succeeded: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      let cleanupSucceeded = true;
      if (listenerInstalled) {
        try {
          output.off("error", onError);
          listenerInstalled = false;
        } catch (_cause: unknown) {
          cleanupSucceeded = false;
        }
      }
      resolve(succeeded && cleanupSucceeded ? ok(undefined) : err("output"));
    };

    const onError = (_cause: unknown): void => finish(false);

    try {
      output.on("error", onError);
      listenerInstalled = true;
      output.write(text, (cause?: unknown) => {
        if (cause === undefined || cause === null) {
          finish(true);
        }
      });
    } catch (_cause: unknown) {
      finish(false);
    }
  });
}
