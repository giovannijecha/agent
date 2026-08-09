export type LaunchCommand = "help" | "run" | "version";

export type LaunchCommandError = Readonly<{ kind: "invalidArguments" }>;

/** Accepts only the small public command surface owned by the executable. */
export function parseLaunchCommand(
  arguments_: readonly string[],
): Readonly<
  | { command: LaunchCommand; ok: true }
  | { error: LaunchCommandError; ok: false }
> {
  if (!Array.isArray(arguments_)) {
    return Object.freeze({
      error: Object.freeze({ kind: "invalidArguments" as const }),
      ok: false as const,
    });
  }
  try {
    if (arguments_.length === 0) {
      return Object.freeze({ command: "run" as const, ok: true as const });
    }
    if (arguments_.length !== 1) {
      return Object.freeze({
        error: Object.freeze({ kind: "invalidArguments" as const }),
        ok: false as const,
      });
    }
    const argument = arguments_.at(0);
    if (argument === "--help") {
      return Object.freeze({ command: "help" as const, ok: true as const });
    }
    if (argument === "--version") {
      return Object.freeze({ command: "version" as const, ok: true as const });
    }
  } catch (_cause: unknown) {
    // Fall through to one content-free rejection.
  }
  return Object.freeze({
    error: Object.freeze({ kind: "invalidArguments" as const }),
    ok: false as const,
  });
}
