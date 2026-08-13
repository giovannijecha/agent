import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { err, ok, type Result } from "@agent/core";

import { encodePlatformClipboardWrite } from "./platform-clipboard-protocol.js";

const EMPTY_ARGUMENTS = Object.freeze([]);
const EMPTY_ENVIRONMENT = Object.freeze({});
const CLIPBOARD_STDIO = Object.freeze([
  "pipe",
  "pipe",
  "pipe",
  "pipe",
  "pipe",
] as const);
export const PLATFORM_CLIPBOARD_DEADLINES = Object.freeze({
  cleanupMilliseconds: 250,
  operationMilliseconds: 2_000,
});

export type PlatformClipboardBoundary = Readonly<{
  launch(
    executable: string,
    arguments_: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
  schedule(listener: () => void, milliseconds: number): () => void;
}>;

export type ClipboardDisposition = "copied" | "unsupported";

export type PlatformClipboardError = Readonly<{
  kind: "launch" | "native" | "protocol" | "timeout";
}>;

export interface ClipboardPort {
  copy(text: string): Promise<Result<ClipboardDisposition, PlatformClipboardError>>;
}

function failure(
  kind: PlatformClipboardError["kind"],
): PlatformClipboardError {
  return Object.freeze({ kind });
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function clipboardPath(): string {
  return path.join(
    packageRoot(),
    ".native-build",
    "win32-x64",
    "agent-clipboard.exe",
  );
}

const platformClipboardBoundary: PlatformClipboardBoundary = Object.freeze({
  launch: (executable, arguments_, options) =>
    spawn(executable, arguments_, options),
  schedule: (listener, milliseconds) => {
    const deadline = setTimeout(listener, milliseconds);
    return () => clearTimeout(deadline);
  },
});

function observeClipboard(
  child: ChildProcess,
  frame: Uint8Array,
  boundary: PlatformClipboardBoundary,
): Promise<Result<ClipboardDisposition, PlatformClipboardError>> {
  return new Promise((resolve) => {
    let forcedFailure: PlatformClipboardError | undefined;
    let settled = false;
    let cancelCleanupDeadline: (() => void) | undefined;
    let cancelOperationDeadline: (() => void) | undefined;
    const settle = (
      result: Result<ClipboardDisposition, PlatformClipboardError>,
    ): void => {
      if (settled) return;
      settled = true;
      cancelCleanupDeadline?.();
      cancelOperationDeadline?.();
      resolve(result);
    };
    const stop = (error: PlatformClipboardError): void => {
      if (settled || forcedFailure !== undefined) {
        return;
      }
      forcedFailure = error;
      cancelOperationDeadline?.();
      cancelOperationDeadline = undefined;
      try {
        cancelCleanupDeadline = boundary.schedule(
          () => settle(err(error)),
          PLATFORM_CLIPBOARD_DEADLINES.cleanupMilliseconds,
        );
      } catch (_cause: unknown) {
        settle(err(error));
        return;
      }
      try {
        child.stdin.destroy();
        if (!child.kill()) settle(err(error));
      } catch (_cause: unknown) {
        settle(err(error));
      }
    };
    child.stdout.on("data", () => stop(failure("protocol")));
    child.stderr.on("data", () => stop(failure("protocol")));
    child.stdin.once("error", () => stop(failure("native")));
    child.once("error", () =>
      settle(err(forcedFailure ?? failure("launch"))),
    );
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      if (forcedFailure !== undefined) {
        settle(err(forcedFailure));
      } else if (code === 0 && signal === null) {
        settle(ok("copied"));
      } else {
        settle(err(failure("native")));
      }
    });
    cancelOperationDeadline = boundary.schedule(
      () => stop(failure("timeout")),
      PLATFORM_CLIPBOARD_DEADLINES.operationMilliseconds,
    );
    try {
      child.stdin.write(frame);
      if (!settled && forcedFailure === undefined) {
        child.stdin.end();
      }
    } catch (_cause: unknown) {
      stop(failure("launch"));
    }
  });
}

/** Exact removable platform clipboard boundary for confirmed Windows copies. */
export class PlatformClipboard implements ClipboardPort {
  readonly #architecture: string;
  readonly #boundary: PlatformClipboardBoundary;
  readonly #platform: string;

  constructor(
    platform: string,
    architecture: string,
    boundary: PlatformClipboardBoundary = platformClipboardBoundary,
  ) {
    this.#platform = platform;
    this.#architecture = architecture;
    this.#boundary = boundary;
    Object.freeze(this);
  }

  copy(
    text: string,
  ): Promise<Result<ClipboardDisposition, PlatformClipboardError>> {
    if (this.#platform !== "win32" || this.#architecture !== "x64") {
      return Promise.resolve(ok("unsupported"));
    }
    const encoded = encodePlatformClipboardWrite(text);
    if (!encoded.ok) {
      return Promise.resolve(err(failure("protocol")));
    }
    try {
      const child = this.#boundary.launch(clipboardPath(), EMPTY_ARGUMENTS, {
        cwd: packageRoot(),
        env: EMPTY_ENVIRONMENT,
        shell: false,
        stdio: CLIPBOARD_STDIO,
        windowsHide: true,
      });
      return observeClipboard(child, encoded.value, this.#boundary);
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("launch")));
    }
  }
}
