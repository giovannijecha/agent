import type { Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

/** Product limits for one model-requested process execution. */
export const PROCESS_RUNNER_LIMITS = Object.freeze({
  arguments: 64,
  argumentCodeUnits: 4_096,
  processCount: 16,
  stderrBytes: 65_536,
  stdoutBytes: 65_536,
  timeoutMilliseconds: 120_000,
});

export type ProcessRunRequest = Readonly<{
  arguments: readonly string[];
  executable: string;
  processLimit: number;
  stderrBytes: number;
  stdoutBytes: number;
  timeoutMilliseconds: number;
  workingDirectory: string;
}>;

export type ProcessRunResult = Readonly<{
  exitCode: number;
  outcome: "exited";
  stderr: string;
  stdout: string;
}>;

/** Platform-neutral capability used by the CLI-owned run_process tool. */
export interface ProcessRunner {
  run(
    request: ProcessRunRequest,
    cancellation: ToolCancellation,
  ): Promise<Result<ProcessRunResult, ToolHandlerError>>;
}
