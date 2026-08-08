import type {
  RuntimeEvent,
  RuntimeSession,
  RuntimeSourceError,
} from "@agent/runtime";
import { err, ok, type Result } from "@agent/tui";

import type { HostEvent, TerminalHost } from "./terminal-host.js";

export type ArbiterEvent<HE, RE> =
  | Readonly<{ kind: "runtime"; result: Result<RuntimeEvent<RE>, RuntimeSourceError> }>
  | Readonly<{ kind: "terminal"; result: Result<HostEvent, HE> }>
  | Readonly<{ kind: "unexpectedSource"; source: "runtime" | "terminal" }>;

export type ArbiterErrorKind =
  | "closed"
  | "concurrentRead"
  | "runtimeUnavailable";

/** Content-free misuse of the two-source event arbiter. */
export type ArbiterError = Readonly<{ kind: ArbiterErrorKind }>;

type Waiter<HE, RE> = (
  result: Result<ArbiterEvent<HE, RE>, ArbiterError>,
) => void;

function arbiterError(kind: ArbiterErrorKind): ArbiterError {
  return Object.freeze({ kind });
}

function readResult<T, E>(value: unknown): Result<T, E> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const candidate = value as Readonly<{
      error?: unknown;
      ok?: unknown;
      value?: unknown;
    }>;
    const resultKind = candidate.ok;
    if (resultKind === true && "value" in candidate) {
      return ok(candidate.value as T);
    }
    if (resultKind === false && "error" in candidate) {
      return err(candidate.error as E);
    }
  } catch (_cause: unknown) {
    return undefined;
  }
  return undefined;
}

/**
 * Fair two-source pull arbiter with one retained read and one ready slot per
 * source. Runtime reads are armed explicitly only while a turn is active.
 */
export class EventArbiter<HE, RE> {
  readonly #runtime: RuntimeSession<RE> | undefined;
  readonly #terminal: TerminalHost<HE>;
  #closed = false;
  #preferTerminal = true;
  #runtimePending: Promise<void> | undefined;
  #runtimeReady: ArbiterEvent<HE, RE> | undefined;
  #terminalPending: Promise<void> | undefined;
  #terminalReady: ArbiterEvent<HE, RE> | undefined;
  #waiter: Waiter<HE, RE> | undefined;

  constructor(terminal: TerminalHost<HE>, runtime?: RuntimeSession<RE>) {
    this.#terminal = terminal;
    this.#runtime = runtime;
    this.#scheduleTerminal();
  }

  /** Arms one runtime read idempotently without disturbing a retained read. */
  armRuntime(): Result<void, ArbiterError> {
    if (this.#closed) {
      return err(arbiterError("closed"));
    }
    if (this.#runtime === undefined) {
      return err(arbiterError("runtimeUnavailable"));
    }
    this.#scheduleRuntime(this.#runtime);
    return ok(undefined);
  }

  /** Resolves the next fairly selected source event with one-waiter semantics. */
  nextEvent(): Promise<Result<ArbiterEvent<HE, RE>, ArbiterError>> {
    if (this.#closed) {
      return Promise.resolve(err(arbiterError("closed")));
    }
    if (this.#waiter !== undefined) {
      return Promise.resolve(err(arbiterError("concurrentRead")));
    }
    const ready = this.#takeReady();
    if (ready !== undefined) {
      this.#afterTake(ready);
      return Promise.resolve(ok(ready));
    }
    return new Promise((resolve) => {
      this.#waiter = resolve;
    });
  }

  /** Closes the application-facing source and observes all late settlements. */
  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#runtimeReady = undefined;
    this.#terminalReady = undefined;
    const waiter = this.#waiter;
    this.#waiter = undefined;
    if (waiter !== undefined) {
      waiter(err(arbiterError("closed")));
    }
  }

  #scheduleTerminal(): void {
    if (
      this.#closed ||
      this.#terminalPending !== undefined ||
      this.#terminalReady !== undefined
    ) {
      return;
    }
    let requested: Promise<Result<HostEvent, HE>>;
    try {
      requested = this.#terminal.nextEvent();
    } catch (_cause: unknown) {
      this.#terminalReady = Object.freeze({
        kind: "unexpectedSource" as const,
        source: "terminal" as const,
      });
      this.#notify();
      return;
    }
    let operation: Promise<void>;
    operation = Promise.resolve(requested).then(
      (result: unknown) => {
        const snapshot = readResult<HostEvent, HE>(result);
        this.#settleTerminal(
          snapshot !== undefined
            ? Object.freeze({
                kind: "terminal" as const,
                result: snapshot,
              })
            : Object.freeze({
                kind: "unexpectedSource" as const,
                source: "terminal" as const,
              }),
          operation,
        );
      },
      (_cause: unknown) => {
        this.#settleTerminal(
          Object.freeze({
            kind: "unexpectedSource" as const,
            source: "terminal" as const,
          }),
          operation,
        );
      },
    );
    this.#terminalPending = operation;
  }

  #scheduleRuntime(runtime: RuntimeSession<RE>): void {
    if (
      this.#closed ||
      this.#runtimePending !== undefined ||
      this.#runtimeReady !== undefined
    ) {
      return;
    }
    let requested: Promise<Result<RuntimeEvent<RE>, RuntimeSourceError>>;
    try {
      requested = runtime.nextEvent();
    } catch (_cause: unknown) {
      this.#runtimeReady = Object.freeze({
        kind: "unexpectedSource" as const,
        source: "runtime" as const,
      });
      this.#notify();
      return;
    }
    let operation: Promise<void>;
    operation = Promise.resolve(requested).then(
      (result: unknown) => {
        const snapshot = readResult<RuntimeEvent<RE>, RuntimeSourceError>(result);
        this.#settleRuntime(
          snapshot !== undefined
            ? Object.freeze({
                kind: "runtime" as const,
                result: snapshot,
              })
            : Object.freeze({
                kind: "unexpectedSource" as const,
                source: "runtime" as const,
              }),
          operation,
        );
      },
      (_cause: unknown) => {
        this.#settleRuntime(
          Object.freeze({
            kind: "unexpectedSource" as const,
            source: "runtime" as const,
          }),
          operation,
        );
      },
    );
    this.#runtimePending = operation;
  }

  #settleTerminal(event: ArbiterEvent<HE, RE>, operation: Promise<void>): void {
    if (this.#terminalPending === operation) {
      this.#terminalPending = undefined;
    }
    if (this.#closed) {
      return;
    }
    this.#terminalReady = event;
    this.#notify();
  }

  #settleRuntime(event: ArbiterEvent<HE, RE>, operation: Promise<void>): void {
    if (this.#runtimePending === operation) {
      this.#runtimePending = undefined;
    }
    if (this.#closed) {
      return;
    }
    this.#runtimeReady = event;
    this.#notify();
  }

  #notify(): void {
    const waiter = this.#waiter;
    if (waiter === undefined) {
      return;
    }
    const ready = this.#takeReady();
    if (ready === undefined) {
      return;
    }
    this.#waiter = undefined;
    this.#afterTake(ready);
    waiter(ok(ready));
  }

  #takeReady(): ArbiterEvent<HE, RE> | undefined {
    let selected: ArbiterEvent<HE, RE> | undefined;
    if (this.#terminalReady !== undefined && this.#runtimeReady !== undefined) {
      if (this.#preferTerminal) {
        selected = this.#terminalReady;
        this.#terminalReady = undefined;
      } else {
        selected = this.#runtimeReady;
        this.#runtimeReady = undefined;
      }
      this.#preferTerminal = !this.#preferTerminal;
    } else if (this.#terminalReady !== undefined) {
      selected = this.#terminalReady;
      this.#terminalReady = undefined;
      this.#preferTerminal = false;
    } else if (this.#runtimeReady !== undefined) {
      selected = this.#runtimeReady;
      this.#runtimeReady = undefined;
      this.#preferTerminal = true;
    }
    return selected;
  }

  #afterTake(selected: ArbiterEvent<HE, RE>): void {
    if (selected.kind === "terminal") {
      this.#scheduleTerminal();
    } else if (
      selected.kind === "unexpectedSource" &&
      selected.source === "terminal"
    ) {
      this.#scheduleTerminal();
    }
  }
}
