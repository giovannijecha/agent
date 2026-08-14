import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { err, ok, type Result } from "@agent/core";
import type { ToolCancellation, ToolHandlerError } from "@agent/tools";

import {
  decodePlatformWorkspaceMutationResponse,
  encodePlatformWorkspaceMutation,
  PLATFORM_WORKSPACE_MUTATION_LIMITS,
} from "./platform-workspace-mutation-protocol.js";
import type {
  WorkspaceMutationCommit,
  WorkspaceMutationCommitResult,
  WorkspaceMutationCommitter,
} from "./workspace-mutation-committer.js";

const EMPTY_ARGUMENTS = Object.freeze([]);
const EMPTY_ENVIRONMENT = Object.freeze({});
const MUTATION_STDIO = Object.freeze([
  "pipe",
  "pipe",
  "pipe",
  "pipe",
  "pipe",
] as const);

export const PLATFORM_WORKSPACE_MUTATION_DEADLINES = Object.freeze({
  cleanupMilliseconds: 250,
  operationMilliseconds: 5_000,
});

export type PlatformWorkspaceMutationBoundary = Readonly<{
  launch(
    executable: string,
    arguments_: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
  schedule(listener: () => void, milliseconds: number): () => void;
}>;

export type PlatformWorkspaceMutationCreateError = Readonly<{
  kind: "unsupportedPlatform";
}>;

function toolFailure(kind: ToolHandlerError["kind"]): ToolHandlerError {
  return Object.freeze({ kind });
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function brokerPath(
  platform: "linux" | "win32",
  architecture: "x64",
): string {
  const executable = platform === "win32"
    ? "agent-mutation-commit.exe"
    : "agent-mutation-commit";
  return path.join(
    packageRoot(),
    ".native-build",
    platform + "-" + architecture,
    executable,
  );
}

const platformWorkspaceMutationBoundary: PlatformWorkspaceMutationBoundary =
  Object.freeze({
    launch: (executable, arguments_, options) =>
      spawn(executable, arguments_, options),
    schedule: (listener, milliseconds) => {
      const deadline = setTimeout(listener, milliseconds);
      return () => clearTimeout(deadline);
    },
  });

/** Exact native commit adapter for one approved workspace mutation. */
export class PlatformWorkspaceMutationCommitter
implements WorkspaceMutationCommitter {
  readonly #boundary: PlatformWorkspaceMutationBoundary;
  readonly #executable: string;

  private constructor(
    executable: string,
    boundary: PlatformWorkspaceMutationBoundary,
  ) {
    this.#executable = executable;
    this.#boundary = boundary;
    Object.freeze(this);
  }

  static create(
    platform: string,
    architecture: string,
    boundary: PlatformWorkspaceMutationBoundary =
      platformWorkspaceMutationBoundary,
  ): Result<PlatformWorkspaceMutationCommitter, PlatformWorkspaceMutationCreateError> {
    if (
      (platform !== "linux" && platform !== "win32") ||
      architecture !== "x64"
    ) {
      return err(Object.freeze({ kind: "unsupportedPlatform" as const }));
    }
    return ok(
      new PlatformWorkspaceMutationCommitter(
        brokerPath(platform, architecture),
        boundary,
      ),
    );
  }

  commit(
    request: WorkspaceMutationCommit,
    cancellation: ToolCancellation,
  ): Promise<Result<WorkspaceMutationCommitResult, ToolHandlerError>> {
    let requested: boolean;
    let whenRequested: () => Promise<void>;
    try {
      requested = cancellation.requested;
      if (
        typeof requested !== "boolean" ||
        typeof cancellation.whenRequested !== "function"
      ) {
        return Promise.resolve(err(toolFailure("io")));
      }
      whenRequested = cancellation.whenRequested.bind(cancellation) as () =>
        Promise<void>;
    } catch (_cause: unknown) {
      return Promise.resolve(err(toolFailure("io")));
    }
    if (requested) {
      return Promise.resolve(err(toolFailure("cancelled")));
    }
    const encoded = encodePlatformWorkspaceMutation(request);
    if (!encoded.ok) {
      return Promise.resolve(
        err(toolFailure(encoded.error.kind === "limit" ? "limit" : "io")),
      );
    }
    let child: ChildProcess;
    try {
      child = this.#boundary.launch(
        this.#executable,
        EMPTY_ARGUMENTS,
        {
          cwd: packageRoot(),
          env: EMPTY_ENVIRONMENT,
          shell: false,
          stdio: MUTATION_STDIO,
          windowsHide: true,
        },
      );
    } catch (_cause: unknown) {
      return Promise.resolve(err(toolFailure("io")));
    }
    return this.#observe(child, encoded.value, request.kind, whenRequested);
  }

  #observe(
    child: ChildProcess,
    frame: Uint8Array,
    requestKind: WorkspaceMutationCommit["kind"],
    whenRequested: () => Promise<void>,
  ): Promise<Result<WorkspaceMutationCommitResult, ToolHandlerError>> {
    return new Promise((resolve) => {
      const chunks: Uint8Array[] = [];
      let outputLength = 0;
      let forcedFailure: ToolHandlerError | undefined;
      let settled = false;
      let cancelCleanupDeadline: (() => void) | undefined;
      let cancelOperationDeadline: (() => void) | undefined;

      const settle = (
        result: Result<WorkspaceMutationCommitResult, ToolHandlerError>,
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        cancelCleanupDeadline?.();
        cancelOperationDeadline?.();
        chunks.splice(0, chunks.length);
        outputLength = 0;
        resolve(result);
      };
      const stop = (failure: ToolHandlerError): void => {
        if (settled || forcedFailure !== undefined) {
          return;
        }
        forcedFailure = failure;
        cancelOperationDeadline?.();
        cancelOperationDeadline = undefined;
        try {
          cancelCleanupDeadline = this.#boundary.schedule(
            () => settle(err(failure)),
            PLATFORM_WORKSPACE_MUTATION_DEADLINES.cleanupMilliseconds,
          );
        } catch (_cause: unknown) {
          settle(err(failure));
          return;
        }
        try {
          child.stdin.destroy();
          if (!child.kill()) {
            settle(err(failure));
          }
        } catch (_cause: unknown) {
          settle(err(failure));
        }
      };

      child.stdout.on("data", (chunk) => {
        if (settled || forcedFailure !== undefined) {
          return;
        }
        const remaining =
          PLATFORM_WORKSPACE_MUTATION_LIMITS.responseBytes - outputLength;
        if (chunk.length > remaining) {
          stop(toolFailure("io"));
          return;
        }
        chunks.push(chunk.slice());
        outputLength += chunk.length;
      });
      child.stderr.on("data", () => stop(toolFailure("io")));
      child.stdin.once("error", () => stop(toolFailure("io")));
      child.once("error", () =>
        settle(err(forcedFailure ?? toolFailure("io"))),
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
          settle(err(toolFailure("io")));
          return;
        }
        const output = new Uint8Array(outputLength);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        const decoded = decodePlatformWorkspaceMutationResponse(output);
        if (!decoded.ok) {
          settle(err(toolFailure("io")));
        } else if (decoded.value.kind === "failure") {
          settle(err(toolFailure(decoded.value.error)));
        } else if (
          (requestKind === "create" && decoded.value.result !== "created") ||
          (requestKind === "replace" && decoded.value.result !== "replaced")
        ) {
          settle(err(toolFailure("io")));
        } else {
          settle(ok(decoded.value.result));
        }
      });

      try {
        child.stdin.write(frame);
        child.stdin.end();
      } catch (_cause: unknown) {
        stop(toolFailure("io"));
      }
      let cancellation: Promise<void>;
      try {
        cancellation = Promise.resolve(whenRequested());
      } catch (_cause: unknown) {
        stop(toolFailure("io"));
        cancellation = Promise.resolve();
      }
      void cancellation.then(
        () => stop(toolFailure("cancelled")),
        () => stop(toolFailure("io")),
      );
      try {
        cancelOperationDeadline = this.#boundary.schedule(
          () => stop(toolFailure("io")),
          PLATFORM_WORKSPACE_MUTATION_DEADLINES.operationMilliseconds,
        );
      } catch (_cause: unknown) {
        stop(toolFailure("io"));
      }
    });
  }
}
