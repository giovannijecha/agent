import {
  spawn,
  type ReadOnlyChildProcess,
  type SpawnReadOptions,
} from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { err, type Result } from "@agent/core";

import {
  decodePlatformWorkspaceRoots,
  PLATFORM_WORKSPACE_ROOTS_LIMITS,
  type PlatformWorkspaceRoots,
} from "./platform-workspace-roots-protocol.js";

const EMPTY_ARGUMENTS = Object.freeze([]);
const EMPTY_ENVIRONMENT = Object.freeze({});
const RESOLVER_STDIO = Object.freeze(["ignore", "pipe", "pipe"] as const);

export const PLATFORM_WORKSPACE_ROOTS_DEADLINES = Object.freeze({
  cleanupMilliseconds: 250,
  operationMilliseconds: 5_000,
});

export type PlatformWorkspaceRootsBoundary = Readonly<{
  launch(
    executable: string,
    arguments_: readonly string[],
    options: SpawnReadOptions,
  ): ReadOnlyChildProcess;
  schedule(listener: () => void, milliseconds: number): () => void;
}>;

export type PlatformWorkspaceRootsError = Readonly<{
  kind: "launch" | "limit" | "protocol" | "timeout" | "unsupportedPlatform";
}>;

type ByteAccumulator = {
  chunks: Uint8Array[];
  length: number;
};

function failure(
  kind: PlatformWorkspaceRootsError["kind"],
): PlatformWorkspaceRootsError {
  return Object.freeze({ kind });
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

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolverPath(
  platform: "linux" | "win32",
  architecture: "x64",
): string {
  const executable = platform === "win32"
    ? "agent-workspace-roots.exe"
    : "agent-workspace-roots";
  return path.join(
    packageRoot(),
    ".native-build",
    platform + "-" + architecture,
    executable,
  );
}

const platformWorkspaceRootsBoundary: PlatformWorkspaceRootsBoundary =
  Object.freeze({
    launch: (executable, arguments_, options) =>
      spawn(executable, arguments_, options),
    schedule: (listener, milliseconds) => {
      const deadline = setTimeout(listener, milliseconds);
      return () => clearTimeout(deadline);
    },
  });

function observeResolver(
  child: ReadOnlyChildProcess,
  boundary: PlatformWorkspaceRootsBoundary,
): Promise<Result<PlatformWorkspaceRoots, PlatformWorkspaceRootsError>> {
  return new Promise((resolve) => {
    const output: ByteAccumulator = { chunks: [], length: 0 };
    let forcedFailure: PlatformWorkspaceRootsError | undefined;
    let settled = false;
    let cancelCleanupDeadline: (() => void) | undefined;
    let cancelOperationDeadline: (() => void) | undefined;

    const settle = (
      result: Result<PlatformWorkspaceRoots, PlatformWorkspaceRootsError>,
    ): void => {
      if (settled) {
        return;
      }
      settled = true;
      cancelCleanupDeadline?.();
      cancelOperationDeadline?.();
      output.chunks.splice(0, output.chunks.length);
      output.length = 0;
      resolve(result);
    };
    const stop = (error: PlatformWorkspaceRootsError): void => {
      if (settled || forcedFailure !== undefined) {
        return;
      }
      forcedFailure = error;
      cancelOperationDeadline?.();
      cancelOperationDeadline = undefined;
      try {
        cancelCleanupDeadline = boundary.schedule(
          () => settle(err(error)),
          PLATFORM_WORKSPACE_ROOTS_DEADLINES.cleanupMilliseconds,
        );
      } catch (_cause: unknown) {
        settle(err(error));
        return;
      }
      try {
        if (!child.kill()) {
          settle(err(error));
        }
      } catch (_cause: unknown) {
        settle(err(error));
      }
    };

    child.stdout.on("data", (chunk) => {
      if (settled || forcedFailure !== undefined) {
        return;
      }
      const remaining = PLATFORM_WORKSPACE_ROOTS_LIMITS.frameBytes - output.length;
      if (chunk.length > remaining) {
        stop(failure("limit"));
        return;
      }
      output.chunks.push(chunk.slice());
      output.length += chunk.length;
    });
    child.stderr.on("data", () => undefined);
    child.once("error", () =>
      settle(err(forcedFailure ?? failure("launch"))),
    );
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      if (forcedFailure !== undefined) {
        settle(err(forcedFailure));
        return;
      }
      if (code !== 0 || signal !== null) {
        settle(err(failure("launch")));
        return;
      }
      const decoded = decodePlatformWorkspaceRoots(concatenate(output));
      settle(decoded.ok ? decoded : err(failure("protocol")));
    });
    cancelOperationDeadline = boundary.schedule(
      () => stop(failure("timeout")),
      PLATFORM_WORKSPACE_ROOTS_DEADLINES.operationMilliseconds,
    );
  });
}

/** Resolves protected roots without consulting the inherited environment. */
export function resolvePlatformWorkspaceRoots(
  platform: string,
  architecture: string,
  boundary: PlatformWorkspaceRootsBoundary = platformWorkspaceRootsBoundary,
): Promise<Result<PlatformWorkspaceRoots, PlatformWorkspaceRootsError>> {
  if (
    (platform !== "linux" && platform !== "win32") ||
    architecture !== "x64"
  ) {
    return Promise.resolve(err(failure("unsupportedPlatform")));
  }
  let child: ReadOnlyChildProcess;
  try {
    child = boundary.launch(
      resolverPath(platform, architecture),
      EMPTY_ARGUMENTS,
      {
        cwd: packageRoot(),
        env: EMPTY_ENVIRONMENT,
        shell: false,
        stdio: RESOLVER_STDIO,
        windowsHide: true,
      },
    );
  } catch (_cause: unknown) {
    return Promise.resolve(err(failure("launch")));
  }
  return observeResolver(child, boundary);
}
