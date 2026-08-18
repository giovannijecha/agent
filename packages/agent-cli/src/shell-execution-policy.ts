import { err, ok, scalarUtf8ByteLength, type Result } from "@agent/core";

import { PROCESS_RUNNER_LIMITS } from "./process-runner.js";

const POWERSHELL_SUFFIX = "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const POWERSHELL_UTF8_PRELUDE =
  "[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false);" +
  "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);" +
  "$OutputEncoding=[System.Text.UTF8Encoding]::new($false);";

export type ShellSourceEnvironment = Readonly<{
  AGENT_OLLAMA_API_KEY?: string;
  APPDATA?: string;
  HOME?: string;
  LANG?: string;
  LC_ALL?: string;
  LOCALAPPDATA?: string;
  PATH?: string;
  PATHEXT?: string;
  Path?: string;
  SYSTEMROOT?: string;
  SystemRoot?: string;
  TEMP?: string;
  TMP?: string;
  TMPDIR?: string;
  USERPROFILE?: string;
}>;

export type ShellInvocation = Readonly<{
  arguments: readonly string[];
  environment: readonly string[];
  executable: string;
}>;

export type ShellExecutionPolicyError = Readonly<{
  kind: "invalidEnvironment" | "unsupportedPlatform";
}>;

function failure(
  kind: ShellExecutionPolicyError["kind"],
): ShellExecutionPolicyError {
  return Object.freeze({ kind });
}

function validEnvironmentValue(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 8_192) {
    return false;
  }
  const bytes = scalarUtf8ByteLength(value, true);
  return bytes !== undefined && bytes <= 8_192;
}

function appendEnvironment(
  target: string[],
  name: string,
  value: unknown,
): boolean {
  if (value === undefined) {
    return true;
  }
  if (!validEnvironmentValue(value)) {
    return false;
  }
  target.push(name + "=" + value);
  return true;
}

function linuxEnvironment(
  source: ShellSourceEnvironment,
): Result<readonly string[], ShellExecutionPolicyError> {
  const entries: string[] = [];
  return appendEnvironment(entries, "PATH", source.PATH) &&
    appendEnvironment(entries, "HOME", source.HOME) &&
    appendEnvironment(entries, "TMPDIR", source.TMPDIR) &&
    appendEnvironment(entries, "LANG", source.LANG) &&
    appendEnvironment(entries, "LC_ALL", source.LC_ALL)
    ? ok(Object.freeze(entries))
    : err(failure("invalidEnvironment"));
}

function windowsEnvironment(
  source: ShellSourceEnvironment,
): Result<readonly string[], ShellExecutionPolicyError> {
  if (
    source.Path !== undefined &&
    source.PATH !== undefined &&
    source.Path !== source.PATH
  ) {
    return err(failure("invalidEnvironment"));
  }
  const entries: string[] = [];
  const pathValue = source.Path ?? source.PATH;
  return appendEnvironment(entries, "Path", pathValue) &&
    appendEnvironment(entries, "PATHEXT", source.PATHEXT) &&
    appendEnvironment(entries, "TEMP", source.TEMP) &&
    appendEnvironment(entries, "TMP", source.TMP) &&
    appendEnvironment(entries, "USERPROFILE", source.USERPROFILE) &&
    appendEnvironment(entries, "HOME", source.HOME) &&
    appendEnvironment(entries, "APPDATA", source.APPDATA) &&
    appendEnvironment(entries, "LOCALAPPDATA", source.LOCALAPPDATA)
    ? ok(Object.freeze(entries))
    : err(failure("invalidEnvironment"));
}

/** Fixed platform shell identity and credential-free target environment. */
export class ShellExecutionPolicy {
  readonly #environment: readonly string[];
  readonly #executable: string;
  readonly #platform: "linux" | "win32";

  private constructor(
    platform: "linux" | "win32",
    executable: string,
    environment: readonly string[],
  ) {
    this.#platform = platform;
    this.#executable = executable;
    this.#environment = environment;
    Object.freeze(this);
  }

  static create(
    platform: unknown,
    source: unknown,
  ): Result<ShellExecutionPolicy, ShellExecutionPolicyError> {
    if (source === null || typeof source !== "object") {
      return err(failure("invalidEnvironment"));
    }
    try {
      const environment = source as ShellSourceEnvironment;
      if (platform === "linux") {
        const projected = linuxEnvironment(environment);
        return projected.ok
          ? ok(new ShellExecutionPolicy("linux", "/bin/bash", projected.value))
          : projected;
      }
      if (platform !== "win32") {
        return err(failure("unsupportedPlatform"));
      }
      if (
        environment.SystemRoot !== undefined &&
        environment.SYSTEMROOT !== undefined &&
        environment.SystemRoot !== environment.SYSTEMROOT
      ) {
        return err(failure("invalidEnvironment"));
      }
      const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT;
      if (
        !validEnvironmentValue(systemRoot) ||
        !/^[A-Za-z]:[\\/]/u.test(systemRoot)
      ) {
        return err(failure("invalidEnvironment"));
      }
      const projected = windowsEnvironment(environment);
      if (!projected.ok) {
        return projected;
      }
      const root = systemRoot.replace(/[\\/]+$/u, "");
      return ok(
        new ShellExecutionPolicy(
          "win32",
          root + POWERSHELL_SUFFIX,
          projected.value,
        ),
      );
    } catch {
      return err(failure("invalidEnvironment"));
    }
  }

  invocation(command: string): ShellInvocation {
    const arguments_ = this.#platform === "linux"
      ? Object.freeze(["--noprofile", "--norc", "-c", command])
      : Object.freeze([
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          POWERSHELL_UTF8_PRELUDE + command,
        ]);
    return Object.freeze({
      arguments: arguments_,
      environment: this.#environment,
      executable: this.#executable,
    });
  }
}

export const SHELL_LIMITS = Object.freeze({
  commandCodeUnits: 2_730,
  commandUtf8Bytes: 8_192,
  environmentEntries: 8,
  environmentUtf8Bytes: 8_192,
  processCount: PROCESS_RUNNER_LIMITS.processCount,
  stderrBytes: PROCESS_RUNNER_LIMITS.stderrBytes,
  stdoutBytes: PROCESS_RUNNER_LIMITS.stdoutBytes,
  timeoutMilliseconds: PROCESS_RUNNER_LIMITS.timeoutMilliseconds,
  workingDirectoryCodeUnits: PROCESS_RUNNER_LIMITS.workingDirectoryCodeUnits,
  workingDirectoryUtf8Bytes: 8_192,
});
