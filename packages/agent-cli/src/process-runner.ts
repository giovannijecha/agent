import type { Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

/** Product limits for one model-requested process execution. */
export const PROCESS_RUNNER_LIMITS = Object.freeze({
  arguments: 64,
  argumentCodeUnits: 8_192,
  environmentEntries: 8,
  processCount: 16,
  stderrBytes: 65_536,
  stdoutBytes: 65_536,
  textUtf8Bytes: 16_384,
  timeoutMilliseconds: 120_000,
  workingDirectoryCodeUnits: 2_730,
});

export type ProcessRunRequest = Readonly<{
  arguments: readonly string[];
  environment: readonly string[];
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

/** Platform-neutral capability used by the CLI-owned shell tool. */
export interface ProcessRunner {
  run(
    request: ProcessRunRequest,
    cancellation: ToolCancellation,
  ): Promise<Result<ProcessRunResult, ToolHandlerError>>;
}
