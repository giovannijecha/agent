import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import { err, ok, type Result } from "@agent/core";

import {
  CREDENTIAL_BROKER_LIMITS,
  decodeCredentialBrokerResponse,
  encodeCredentialBrokerRequest,
  type CredentialBrokerRequest,
  type CredentialBrokerResponse,
} from "./credential-broker-protocol.js";
import {
  resolveOllamaCloudConfiguration,
  type OllamaCloudConfiguration,
} from "./provider-configuration.js";

const EMPTY_ARGUMENTS = Object.freeze([]);
const EMPTY_ENVIRONMENT = Object.freeze({});
const BROKER_STDIO = Object.freeze([
  "pipe",
  "pipe",
  "pipe",
  "pipe",
  "pipe",
] as const);
const HEADER_BYTES = 12;

export const CREDENTIAL_BROKER_DEADLINES = Object.freeze({
  cleanupMilliseconds: 250,
  operationMilliseconds: 5_000,
});

export type CredentialBrokerBoundary = Readonly<{
  launch(
    executable: string,
    arguments_: readonly string[],
    options: SpawnOptions,
  ): ChildProcess;
  schedule(listener: () => void, milliseconds: number): () => void;
}>;

export type CredentialBoundaryError = Readonly<{
  kind:
    | "busy"
    | "dualAuthority"
    | "invalidCredential"
    | "launch"
    | "protocol"
    | "store"
    | "timeout"
    | "unsupportedPlatform";
}>;

export type OllamaCredentialSnapshot = Readonly<{
  admission: OllamaCredentialAdmission;
  configuration: OllamaCloudConfiguration;
}>;

export type OllamaCredentialMutationState = "absent" | "present";
export type OllamaCredentialMutationAction =
  | Readonly<{ key: string; kind: "register" | "replace" }>
  | Readonly<{ kind: "remove" | "cancel" }>;
export type OllamaCredentialMutationResult =
  "registered" | "replaced" | "removed" | "cancelled";

export type OllamaCredentialMutationPort = Readonly<{
  readonly state: OllamaCredentialMutationState;
  cancel(): Promise<
    Result<OllamaCredentialMutationResult, CredentialBoundaryError>
  >;
  perform(
    action: OllamaCredentialMutationAction,
  ): Promise<Result<OllamaCredentialMutationResult, CredentialBoundaryError>>;
}>;

type ResponseSettlement = (
  result: Result<CredentialBrokerResponse, CredentialBoundaryError>,
) => void;

function failure(
  kind: CredentialBoundaryError["kind"],
): CredentialBoundaryError {
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
    ? "agent-credential-broker.exe"
    : "agent-credential-broker";
  return path.join(
    packageRoot(),
    ".native-build",
    platform + "-" + architecture,
    executable,
  );
}

const defaultBoundary: CredentialBrokerBoundary = Object.freeze({
  launch: (executable, arguments_, options) =>
    spawn(executable, arguments_, options),
  schedule: (listener, milliseconds) => {
    const deadline = setTimeout(listener, milliseconds);
    return () => clearTimeout(deadline);
  },
});

function responseFailure(
  response: CredentialBrokerResponse,
): CredentialBoundaryError | undefined {
  if (response.kind === "busy") return failure("busy");
  if (response.kind === "dualAuthority") return failure("dualAuthority");
  if (response.kind === "invalidCredential") return failure("invalidCredential");
  if (response.kind === "store" || response.kind === "invalidState") {
    return failure("store");
  }
  return undefined;
}

class CredentialBrokerConnection {
  readonly #boundary: CredentialBrokerBoundary;
  readonly #child: ChildProcess;
  #active = true;
  #buffer = new Uint8Array();
  #cancelDeadline: (() => void) | undefined;
  #closed: ((result: Result<void, CredentialBoundaryError>) => void) | undefined;
  #terminalFailure: CredentialBoundaryError | undefined;
  #waiting: ResponseSettlement | undefined;

  constructor(child: ChildProcess, boundary: CredentialBrokerBoundary) {
    this.#child = child;
    this.#boundary = boundary;
    child.stdout.on("data", (chunk) => this.#receive(chunk));
    child.stderr.on("data", () => this.#fail(failure("protocol")));
    child.stdin.once("error", () => this.#fail(failure("launch")));
    child.once("error", () => this.#fail(failure("launch")));
    child.once("close", (code, signal) => {
      if (this.#terminalFailure !== undefined) return;
      this.#active = false;
      this.#cancelDeadline?.();
      this.#cancelDeadline = undefined;
      const clean = code === 0 && signal === null;
      if (this.#closed !== undefined) {
        const settle = this.#closed;
        this.#closed = undefined;
        settle(clean ? ok(undefined) : err(failure("launch")));
        return;
      }
      if (this.#waiting !== undefined) {
        const settle = this.#waiting;
        this.#waiting = undefined;
        const problem = failure(clean ? "protocol" : "launch");
        this.#terminalFailure = problem;
        settle(err(problem));
        return;
      }
      this.#terminalFailure = failure(clean ? "protocol" : "launch");
    });
  }

  active(): boolean {
    return this.#active;
  }

  request(
    request: CredentialBrokerRequest,
  ): Promise<Result<CredentialBrokerResponse, CredentialBoundaryError>> {
    if (!this.#active || this.#waiting !== undefined) {
      return Promise.resolve(err(failure("protocol")));
    }
    const encoded = encodeCredentialBrokerRequest(request);
    if (!encoded.ok) {
      return Promise.resolve(err(failure(
        encoded.error.kind === "invalidKey" ? "invalidCredential" : "protocol",
      )));
    }
    return new Promise((resolve) => {
      this.#waiting = resolve;
      try {
        const cancelDeadline = this.#boundary.schedule(() => {
          this.#fail(failure("timeout"));
        }, CREDENTIAL_BROKER_DEADLINES.operationMilliseconds);
        if (!this.#active) {
          cancelDeadline();
          return;
        }
        this.#cancelDeadline = cancelDeadline;
        this.#child.stdin.write(encoded.value);
      } catch (_cause: unknown) {
        this.#fail(failure("launch"));
      }
    });
  }

  close(): Promise<Result<void, CredentialBoundaryError>> {
    if (!this.#active) {
      return Promise.resolve(
        this.#terminalFailure === undefined
          ? ok(undefined)
          : err(this.#terminalFailure),
      );
    }
    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: Result<void, CredentialBoundaryError>): void => {
        if (settled) return;
        settled = true;
        cancelCleanup?.();
        this.#closed = undefined;
        resolve(result);
      };
      let cancelCleanup: (() => void) | undefined;
      this.#closed = settle;
      try {
        const scheduled = this.#boundary.schedule(() => {
          this.#fail(failure("timeout"));
        }, CREDENTIAL_BROKER_DEADLINES.cleanupMilliseconds);
        if (!this.#active) {
          scheduled();
          return;
        }
        cancelCleanup = scheduled;
        this.#child.stdin.end();
      } catch (_cause: unknown) {
        this.#fail(failure("launch"));
      }
    });
  }

  #deliver(
    result: Result<CredentialBrokerResponse, CredentialBoundaryError>,
  ): void {
    this.#cancelDeadline?.();
    this.#cancelDeadline = undefined;
    if (this.#waiting === undefined) {
      this.#fail(failure("protocol"));
      return;
    }
    const settle = this.#waiting;
    this.#waiting = undefined;
    settle(result);
  }

  #fail(error: CredentialBoundaryError): void {
    if (this.#terminalFailure !== undefined) return;
    this.#active = false;
    this.#terminalFailure = error;
    this.#cancelDeadline?.();
    this.#cancelDeadline = undefined;
    this.#buffer.fill(0);
    this.#buffer = new Uint8Array();
    if (this.#waiting !== undefined) {
      const settle = this.#waiting;
      this.#waiting = undefined;
      settle(err(error));
    }
    if (this.#closed !== undefined) {
      const settle = this.#closed;
      this.#closed = undefined;
      settle(err(error));
    }
    this.#stop();
  }

  #receive(chunk: Uint8Array): void {
    if (!this.#active || !(chunk instanceof Uint8Array)) return;
    if (this.#buffer.length + chunk.length > CREDENTIAL_BROKER_LIMITS.frameBytes) {
      this.#fail(failure("protocol"));
      return;
    }
    const combined = new Uint8Array(this.#buffer.length + chunk.length);
    combined.set(this.#buffer, 0);
    combined.set(chunk, this.#buffer.length);
    this.#buffer.fill(0);
    this.#buffer = combined;
    if (combined.length < HEADER_BYTES) return;
    const payloadLength = new DataView(
      combined.buffer,
      combined.byteOffset,
      combined.byteLength,
    ).getUint32(8, true);
    const frameLength = HEADER_BYTES + payloadLength;
    if (
      frameLength > CREDENTIAL_BROKER_LIMITS.frameBytes ||
      combined.length > frameLength
    ) {
      this.#fail(failure("protocol"));
      return;
    }
    if (combined.length < frameLength) return;
    const decoded = decodeCredentialBrokerResponse(combined);
    combined.fill(0);
    this.#buffer = new Uint8Array();
    this.#deliver(decoded.ok ? decoded : err(failure("protocol")));
  }

  #stop(): void {
    try {
      this.#child.stdin.destroy();
      this.#child.kill();
    } catch (_cause: unknown) {
      // The closed boundary result remains authoritative.
    }
  }
}

function launchConnection(
  platform: string,
  architecture: string,
  boundary: CredentialBrokerBoundary,
): Result<CredentialBrokerConnection, CredentialBoundaryError> {
  if (
    (platform !== "linux" && platform !== "win32") ||
    architecture !== "x64"
  ) {
    return err(failure("unsupportedPlatform"));
  }
  try {
    const child = boundary.launch(
      brokerPath(platform, architecture),
      EMPTY_ARGUMENTS,
      {
        cwd: packageRoot(),
        env: EMPTY_ENVIRONMENT,
        shell: false,
        stdio: BROKER_STDIO,
        windowsHide: true,
      },
    );
    return ok(new CredentialBrokerConnection(child, boundary));
  } catch (_cause: unknown) {
    return err(failure("launch"));
  }
}

export class OllamaCredentialAdmission {
  readonly #connection: CredentialBrokerConnection;

  constructor(connection: CredentialBrokerConnection) {
    this.#connection = connection;
    Object.freeze(this);
  }

  active(): boolean {
    return this.#connection.active();
  }

  close(): Promise<Result<void, CredentialBoundaryError>> {
    return this.#connection.close();
  }
}

export class OllamaCredentialMutation {
  readonly #connection: CredentialBrokerConnection;
  readonly #state: OllamaCredentialMutationState;
  #settled = false;

  constructor(
    connection: CredentialBrokerConnection,
    state: OllamaCredentialMutationState,
  ) {
    this.#connection = connection;
    this.#state = state;
  }

  get state(): OllamaCredentialMutationState {
    return this.#state;
  }

  async perform(
    action: OllamaCredentialMutationAction,
  ): Promise<Result<OllamaCredentialMutationResult, CredentialBoundaryError>> {
    if (this.#settled) return err(failure("store"));
    this.#settled = true;
    const response = await this.#connection.request(action);
    const closed = await this.#connection.close();
    if (!response.ok) return response;
    if (!closed.ok) return closed;
    const mapped = response.value.kind;
    if (
      mapped === "registered" || mapped === "replaced" ||
      mapped === "removed" || mapped === "cancelled"
    ) {
      return ok(mapped);
    }
    return err(responseFailure(response.value) ?? failure("protocol"));
  }

  cancel(): Promise<Result<OllamaCredentialMutationResult, CredentialBoundaryError>> {
    return this.perform(Object.freeze({ kind: "cancel" as const }));
  }
}

export async function openOllamaCredentialSnapshot(
  platform: string,
  architecture: string,
  environmentValue: string | undefined,
  boundary: CredentialBrokerBoundary = defaultBoundary,
): Promise<Result<OllamaCredentialSnapshot, CredentialBoundaryError>> {
  const launched = launchConnection(platform, architecture, boundary);
  if (!launched.ok) return launched;
  const response = await launched.value.request(Object.freeze({
    environmentPresent: environmentValue !== undefined,
    kind: "snapshot" as const,
  }));
  if (!response.ok) {
    await launched.value.close();
    return response;
  }
  const problem = responseFailure(response.value);
  if (problem !== undefined) {
    await launched.value.close();
    return err(problem);
  }
  let configuration: OllamaCloudConfiguration;
  if (response.value.kind === "credential") {
    configuration = Object.freeze({
      credential: response.value.key,
      kind: "enabled" as const,
    });
  } else if (response.value.kind === "absent") {
    const resolved = resolveOllamaCloudConfiguration(environmentValue);
    if (!resolved.ok) {
      await launched.value.close();
      return err(failure("invalidCredential"));
    }
    configuration = resolved.value;
  } else {
    await launched.value.close();
    return err(failure("protocol"));
  }
  return ok(Object.freeze({
    admission: new OllamaCredentialAdmission(launched.value),
    configuration,
  }));
}

export async function openOllamaCredentialMutation(
  platform: string,
  architecture: string,
  environmentPresent: boolean,
  boundary: CredentialBrokerBoundary = defaultBoundary,
): Promise<Result<OllamaCredentialMutationPort, CredentialBoundaryError>> {
  const launched = launchConnection(platform, architecture, boundary);
  if (!launched.ok) return launched;
  const response = await launched.value.request(Object.freeze({
    environmentPresent,
    kind: "openMutation" as const,
  }));
  if (!response.ok) {
    await launched.value.close();
    return response;
  }
  const problem = responseFailure(response.value);
  if (problem !== undefined) {
    await launched.value.close();
    return err(problem);
  }
  if (response.value.kind !== "absent" && response.value.kind !== "present") {
    await launched.value.close();
    return err(failure("protocol"));
  }
  return ok(new OllamaCredentialMutation(launched.value, response.value.kind));
}
