import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout, type Timeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { err, ok, type Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

import {
  decodeProcessText,
  encodeProcessCancel,
  encodeProcessLaunch,
  ProcessBrokerStatusDecoder,
  type ProcessBrokerStatus,
} from "./process-broker-protocol.js";
import type {
  ProcessRunRequest,
  ProcessRunner,
  ProcessRunResult,
} from "./process-runner.js";
import { PROCESS_RUNNER_LIMITS } from "./process-runner.js";

const BROKER_GUARD_GRACE_MILLISECONDS = 5_000;
const EMPTY_ENVIRONMENT = Object.freeze({});
const BROKER_ARGUMENTS = Object.freeze([]);
const BROKER_STDIO = Object.freeze([
  "pipe",
  "pipe",
  "pipe",
  "pipe",
  "pipe",
] as const);

export type NodeProcessRunnerCreateError = Readonly<{
  kind: "unsupportedPlatform";
}>;

type ByteAccumulator = {
  chunks: Uint8Array[];
  length: number;
  overflowed: boolean;
};

function toolFailure(kind: ToolHandlerError["kind"]): ToolHandlerError {
  return Object.freeze({ kind });
}

function appendBounded(
  accumulator: ByteAccumulator,
  chunk: Uint8Array,
  limit: number,
): void {
  const remaining = Math.max(0, limit - accumulator.length);
  const accepted = Math.min(chunk.length, remaining);
  if (accepted > 0) {
    accumulator.chunks.push(chunk.slice(0, accepted));
    accumulator.length += accepted;
  }
  if (accepted !== chunk.length) {
    accumulator.overflowed = true;
  }
}

function concatenate(accumulator: ByteAccumulator): Uint8Array {
  const output = new Uint8Array(accumulator.length);
  let offset = 0;
  for (const chunk of accumulator.chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function brokerPath(platform: "linux" | "win32", architecture: "x64"): string {
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const executable =
    platform === "win32" ? "agent-process-broker.exe" : "agent-process-broker";
  return path.join(
    packageRoot,
    ".native-build",
    platform + "-" + architecture,
    executable,
  );
}

function validRequest(request: ProcessRunRequest): boolean {
  try {
    return (
      typeof request.executable === "string" &&
      path.isAbsolute(request.executable) &&
      !request.executable.includes("\u0000") &&
      typeof request.workingDirectory === "string" &&
      path.isAbsolute(request.workingDirectory) &&
      !request.workingDirectory.includes("\u0000") &&
      Array.isArray(request.arguments) &&
      request.arguments.length <= PROCESS_RUNNER_LIMITS.arguments &&
      request.arguments.every(
        (argument) =>
          typeof argument === "string" &&
          argument.length <= PROCESS_RUNNER_LIMITS.argumentCodeUnits &&
          !argument.includes("\u0000"),
      ) &&
      Number.isSafeInteger(request.processLimit) &&
      request.processLimit >= 1 &&
      request.processLimit <= 64 &&
      Number.isSafeInteger(request.timeoutMilliseconds) &&
      request.timeoutMilliseconds >= 1 &&
      request.timeoutMilliseconds <= 600_000 &&
      Number.isSafeInteger(request.stdoutBytes) &&
      request.stdoutBytes >= 1 &&
      request.stdoutBytes <= 65_536 &&
      Number.isSafeInteger(request.stderrBytes) &&
      request.stderrBytes >= 1 &&
      request.stderrBytes <= 65_536
    );
  } catch (_cause: unknown) {
    return false;
  }
}

function mapBrokerFailure(failure: number): ToolHandlerError {
  if (failure === 200) {
    return toolFailure("unsupported");
  }
  if (failure === 201) {
    return toolFailure("permission");
  }
  return toolFailure("io");
}

/** Node adapter for the owned native process-containment broker. */
export class NodeProcessRunner implements ProcessRunner {
  readonly #brokerExecutable: string;

  private constructor(brokerExecutable: string) {
    this.#brokerExecutable = brokerExecutable;
    Object.freeze(this);
  }

  static create(
    platform: string,
    architecture: string,
  ): Result<NodeProcessRunner, NodeProcessRunnerCreateError> {
    if (
      (platform !== "linux" && platform !== "win32") ||
      architecture !== "x64"
    ) {
      return err(Object.freeze({ kind: "unsupportedPlatform" as const }));
    }
    return ok(new NodeProcessRunner(brokerPath(platform, architecture)));
  }

  run(
    request: ProcessRunRequest,
    cancellation: ToolCancellation,
  ): Promise<Result<ProcessRunResult, ToolHandlerError>> {
    let requested: boolean;
    let whenRequested: () => Promise<void>;
    try {
      requested = cancellation.requested;
      const observe = cancellation.whenRequested;
      if (
        !validRequest(request) ||
        typeof requested !== "boolean" ||
        typeof observe !== "function"
      ) {
        return Promise.resolve(err(toolFailure("io")));
      }
      whenRequested = observe.bind(cancellation) as () => Promise<void>;
    } catch (_cause: unknown) {
      return Promise.resolve(err(toolFailure("io")));
    }
    if (requested) {
      return Promise.resolve(err(toolFailure("cancelled")));
    }

    const launch = encodeProcessLaunch({
      arguments: request.arguments,
      processLimit: request.processLimit,
      program: request.executable,
      timeoutMilliseconds: request.timeoutMilliseconds,
      workingDirectory: request.workingDirectory,
    });
    if (!launch.ok) {
      return Promise.resolve(
        err(toolFailure(launch.error.kind === "limit" ? "limit" : "io")),
      );
    }

    let child: ChildProcess;
    try {
      child = spawn(this.#brokerExecutable, BROKER_ARGUMENTS, {
        cwd: request.workingDirectory,
        env: EMPTY_ENVIRONMENT,
        shell: false,
        stdio: BROKER_STDIO,
        windowsHide: true,
      });
    } catch (_cause: unknown) {
      return Promise.resolve(err(toolFailure("io")));
    }
    return this.#observe(child, launch.value, request, whenRequested);
  }

  #observe(
    child: ChildProcess,
    launch: Uint8Array,
    request: ProcessRunRequest,
    whenRequested: () => Promise<void>,
  ): Promise<Result<ProcessRunResult, ToolHandlerError>> {
    return new Promise((resolve) => {
      const decoder = new ProcessBrokerStatusDecoder();
      const stdout: ByteAccumulator = {
        chunks: [],
        length: 0,
        overflowed: false,
      };
      const stderr: ByteAccumulator = {
        chunks: [],
        length: 0,
        overflowed: false,
      };
      let started = false;
      let terminal: ProcessBrokerStatus | undefined;
      let forcedFailure: ToolHandlerError | undefined;
      let cancelSent = false;
      let settled = false;
      let guard: Timeout | undefined;

      const settle = (result: Result<ProcessRunResult, ToolHandlerError>): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (guard !== undefined) {
          clearTimeout(guard);
        }
        resolve(result);
      };
      const requestCancellation = (): void => {
        if (cancelSent || child.stdin.destroyed) {
          return;
        }
        cancelSent = true;
        try {
          child.stdin.write(encodeProcessCancel());
        } catch (_cause: unknown) {
          forcedFailure ??= toolFailure("io");
        }
      };
      const failAndCancel = (failure: ToolHandlerError): void => {
        forcedFailure ??= failure;
        requestCancellation();
      };
      const acceptStatus = (status: ProcessBrokerStatus): void => {
        if (terminal !== undefined) {
          failAndCancel(toolFailure("io"));
          return;
        }
        if (status.kind === "started") {
          if (started) {
            failAndCancel(toolFailure("io"));
          } else {
            started = true;
          }
          return;
        }
        if (status.kind === "finished" && !started) {
          failAndCancel(toolFailure("io"));
          return;
        }
        terminal = status;
      };

      child.stdout.on("data", (chunk) => {
        const decoded = decoder.push(chunk);
        if (!decoded.ok) {
          failAndCancel(toolFailure(decoded.error.kind === "limit" ? "limit" : "io"));
          return;
        }
        for (const status of decoded.value) {
          acceptStatus(status);
        }
      });
      child.stderr.on("data", () => undefined);
      const targetStdout = child.stdio.at(3);
      const targetStderr = child.stdio.at(4);
      if (
        targetStdout === undefined ||
        targetStderr === undefined ||
        !("on" in targetStdout) ||
        !("on" in targetStderr)
      ) {
        settle(err(toolFailure("io")));
        return;
      }
      targetStdout.on("data", (chunk) => {
        appendBounded(stdout, chunk, request.stdoutBytes);
        if (stdout.overflowed) {
          failAndCancel(toolFailure("limit"));
        }
      });
      targetStderr.on("data", (chunk) => {
        appendBounded(stderr, chunk, request.stderrBytes);
        if (stderr.overflowed) {
          failAndCancel(toolFailure("limit"));
        }
      });
      child.once("error", () => settle(err(toolFailure("io"))));
      child.once("close", (code) => {
        const complete = decoder.finish();
        if (forcedFailure !== undefined) {
          settle(err(forcedFailure));
          return;
        }
        if (!complete.ok || terminal === undefined) {
          settle(err(toolFailure("io")));
          return;
        }
        if (terminal.kind === "failure") {
          settle(err(mapBrokerFailure(terminal.failure)));
          return;
        }
        if (terminal.kind !== "finished" || code !== 0) {
          settle(err(toolFailure("io")));
          return;
        }
        if (terminal.outcome === "cancelled") {
          settle(err(toolFailure("cancelled")));
          return;
        }
        if (terminal.outcome === "timedOut") {
          settle(err(toolFailure("limit")));
          return;
        }
        if (!terminal.exitCodeKnown) {
          settle(err(toolFailure("io")));
          return;
        }
        const decodedOutput = decodeProcessText(concatenate(stdout));
        const decodedError = decodeProcessText(concatenate(stderr));
        settle(
          decodedOutput.ok && decodedError.ok
            ? ok(
                Object.freeze({
                  exitCode: terminal.exitCode,
                  outcome: "exited" as const,
                  stderr: decodedError.value,
                  stdout: decodedOutput.value,
                }),
              )
            : err(toolFailure("io")),
        );
      });

      try {
        child.stdin.write(launch);
      } catch (_cause: unknown) {
        failAndCancel(toolFailure("io"));
      }
      let cancellation: Promise<void>;
      try {
        cancellation = Promise.resolve(whenRequested());
      } catch (_cause: unknown) {
        failAndCancel(toolFailure("io"));
        cancellation = Promise.resolve();
      }
      void cancellation.then(
        () => requestCancellation(),
        () => failAndCancel(toolFailure("io")),
      );
      guard = setTimeout(() => {
        failAndCancel(toolFailure("io"));
        try {
          child.kill();
        } catch (_cause: unknown) {
          settle(err(toolFailure("io")));
        }
      }, request.timeoutMilliseconds + BROKER_GUARD_GRACE_MILLISECONDS);
    });
  }
}
