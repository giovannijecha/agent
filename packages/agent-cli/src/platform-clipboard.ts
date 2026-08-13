import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout, type Timeout } from "node:timers";
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
const CLIPBOARD_TIMEOUT_MILLISECONDS = 2_000;

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

function observeClipboard(
  child: ChildProcess,
  frame: Uint8Array,
): Promise<Result<ClipboardDisposition, PlatformClipboardError>> {
  return new Promise((resolve) => {
    let forcedFailure: PlatformClipboardError | undefined;
    let settled = false;
    let guard: Timeout | undefined;
    const settle = (
      result: Result<ClipboardDisposition, PlatformClipboardError>,
    ): void => {
      if (settled) return;
      settled = true;
      if (guard !== undefined) clearTimeout(guard);
      resolve(result);
    };
    const stop = (error: PlatformClipboardError): void => {
      forcedFailure ??= error;
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
    child.once("error", () => settle(err(failure("launch"))));
    child.once("close", (code, signal) => {
      if (forcedFailure !== undefined) {
        settle(err(forcedFailure));
      } else if (code === 0 && signal === null) {
        settle(ok("copied"));
      } else {
        settle(err(failure("native")));
      }
    });
    guard = setTimeout(
      () => stop(failure("timeout")),
      CLIPBOARD_TIMEOUT_MILLISECONDS,
    );
    try {
      child.stdin.write(frame);
      child.stdin.end();
    } catch (_cause: unknown) {
      stop(failure("launch"));
    }
  });
}

/** Exact removable platform clipboard boundary for confirmed Windows copies. */
export class PlatformClipboard implements ClipboardPort {
  readonly #architecture: string;
  readonly #platform: string;

  constructor(platform: string, architecture: string) {
    this.#platform = platform;
    this.#architecture = architecture;
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
      const child = spawn(clipboardPath(), EMPTY_ARGUMENTS, {
        cwd: packageRoot(),
        env: EMPTY_ENVIRONMENT,
        shell: false,
        stdio: CLIPBOARD_STDIO,
        windowsHide: true,
      });
      return observeClipboard(child, encoded.value);
    } catch (_cause: unknown) {
      return Promise.resolve(err(failure("launch")));
    }
  }
}
