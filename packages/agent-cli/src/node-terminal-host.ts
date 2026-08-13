import {
  hrtime,
  stdin,
  stdout,
  type ReadableStream,
  type WritableStream,
} from "node:process";

import {
  err,
  ok,
  type Result,
  Viewport,
} from "@agent/tui";

import type { HostEvent, TerminalHost } from "./terminal-host.js";

export type NodeTerminalErrorKind =
  | "input"
  | "output"
  | "start"
  | "stop"
  | "viewport";

/** Platform failure with optional independent cleanup causes. */
export class NodeTerminalError extends Error {
  readonly #kind: NodeTerminalErrorKind;
  readonly #cause: unknown;
  readonly #cleanupCauses: readonly unknown[];

  constructor(
    kind: NodeTerminalErrorKind,
    cause: unknown,
    cleanupCauses: readonly unknown[] = [],
  ) {
    super("terminal " + kind + " failed");
    this.name = "NodeTerminalError";
    this.#kind = kind;
    this.#cause = cause;
    this.#cleanupCauses = Object.freeze([...cleanupCauses]);
    Object.freeze(this);
  }

  get kind(): NodeTerminalErrorKind {
    return this.#kind;
  }

  override get cause(): unknown {
    return this.#cause;
  }

  get cleanupCauses(): readonly unknown[] {
    return this.#cleanupCauses;
  }
}

type EventResult = Result<HostEvent, NodeTerminalError>;
type EventWaiter = (result: EventResult) => void;
const MAX_QUEUED_EVENTS = 1_024;
const MAX_INPUT_CHUNK_CODE_UNITS = 65_536;
const MAX_QUEUED_INPUT_CODE_UNITS = 131_072;

/** Node stdin/stdout adapter with an ordered bounded-lifecycle event queue. */
export class NodeTerminalHost implements TerminalHost<NodeTerminalError> {
  readonly #input: ReadableStream;
  readonly #output: WritableStream;
  readonly #events: EventResult[] = [];
  readonly #waiters: EventWaiter[] = [];
  #startAttempted = false;
  #rawMode = false;
  #closed = false;
  #overflowed = false;
  #queuedInputCodeUnits = 0;

  constructor(input: ReadableStream = stdin, output: WritableStream = stdout) {
    this.#input = input;
    this.#output = output;
  }

  get interactive(): boolean {
    return this.#input.isTTY === true && this.#output.isTTY === true;
  }

  /** Returns current positive TTY geometry or a typed platform failure. */
  viewport(): Result<Viewport, NodeTerminalError> {
    const value = Viewport.create(
      this.#output.columns ?? 0,
      this.#output.rows ?? 0,
    );
    return value.ok
      ? value
      : err(new NodeTerminalError("viewport", value.error));
  }

  async write(text: string): Promise<Result<void, NodeTerminalError>> {
    return new Promise((resolve) => {
      let settled = false;
      let listenerInstalled = false;
      let callbackCause: unknown;
      function onError(cause: unknown): void {
        finish(cause, "event");
      }
      const finish = (
        cause: unknown,
        source: "callback" | "event" | "throw",
      ): void => {
        if (settled) {
          return;
        }
        if (source === "callback" && cause !== undefined && cause !== null) {
          callbackCause = cause;
        }
        settled = true;
        let listenerCleanupCause: unknown;
        if (listenerInstalled) {
          try {
            this.#output.off("error", onError);
          } catch (cleanupCause: unknown) {
            listenerCleanupCause = cleanupCause;
          }
        }
        const primaryCause = callbackCause ?? cause;
        const hasCause = primaryCause !== undefined && primaryCause !== null;
        const hasCleanupCause = listenerCleanupCause !== undefined;
        const additionalCauses: unknown[] = [];
        if (
          source === "event" &&
          callbackCause !== undefined &&
          cause !== callbackCause
        ) {
          additionalCauses.push(cause);
        }
        if (hasCleanupCause) {
          additionalCauses.push(listenerCleanupCause);
        }
        resolve(
          !hasCause && !hasCleanupCause
            ? ok(undefined)
            : err(
                new NodeTerminalError(
                  "output",
                  hasCause ? primaryCause : listenerCleanupCause,
                  hasCause ? additionalCauses : [],
                ),
              ),
        );
      };
      try {
        this.#output.on("error", onError);
        listenerInstalled = true;
        this.#output.write(text, (cause?: unknown) => {
          finish(cause, "callback");
        });
      } catch (cause: unknown) {
        finish(cause, "throw");
      }
    });
  }

  async start(): Promise<Result<void, NodeTerminalError>> {
    if (this.#startAttempted) {
      return ok(undefined);
    }
    if (!this.interactive) {
      return err(new NodeTerminalError("start", "terminal is not interactive"));
    }

    this.#startAttempted = true;
    this.#closed = false;
    this.#overflowed = false;
    try {
      this.#input.setEncoding("utf8");
      this.#input.on("data", this.#onData);
      this.#input.on("end", this.#onEnd);
      this.#input.on("error", this.#onInputError);
      this.#output.on("resize", this.#onResize);
      this.#output.on("error", this.#onOutputError);
      this.#input.setRawMode(true);
      this.#rawMode = true;
      this.#input.resume();
      return ok(undefined);
    } catch (cause: unknown) {
      const cleanup = await this.stop();
      return err(
        new NodeTerminalError(
          "start",
          cause,
          cleanup.ok ? [] : [cleanup.error],
        ),
      );
    }
  }

  nextEvent(): Promise<EventResult> {
    const queued = this.#events.shift();
    if (queued !== undefined) {
      if (queued.ok && queued.value.kind === "input") {
        this.#queuedInputCodeUnits -= queued.value.text.length;
      }
      return Promise.resolve(queued);
    }
    if (this.#closed) {
      return Promise.resolve(ok(Object.freeze({ kind: "end" as const })));
    }
    if (this.#waiters.length > 0) {
      return Promise.resolve(
        err(new NodeTerminalError("input", "concurrent event request")),
      );
    }
    return new Promise((resolve) => this.#waiters.push(resolve));
  }

  async stop(): Promise<Result<void, NodeTerminalError>> {
    if (!this.#startAttempted) {
      return ok(undefined);
    }

    const causes: unknown[] = [];
    const attempt = (operation: () => void): void => {
      try {
        operation();
      } catch (cause: unknown) {
        causes.push(cause);
      }
    };
    attempt(() => {
      this.#input.off("data", this.#onData);
    });
    attempt(() => {
      this.#input.off("end", this.#onEnd);
    });
    attempt(() => {
      this.#input.off("error", this.#onInputError);
    });
    attempt(() => {
      this.#output.off("resize", this.#onResize);
    });
    attempt(() => {
      this.#output.off("error", this.#onOutputError);
    });
    if (this.#rawMode) {
      attempt(() => {
        this.#input.setRawMode(false);
        this.#rawMode = false;
      });
    }
    attempt(() => {
      this.#input.pause();
    });

    this.#closed = true;
    this.#events.splice(0);
    this.#queuedInputCodeUnits = 0;
    const ended = ok(Object.freeze({ kind: "end" as const }));
    for (const waiter of this.#waiters.splice(0)) {
      waiter(ended);
    }
    if (causes.length > 0) {
      return err(new NodeTerminalError("stop", causes.at(0), causes.slice(1)));
    }
    this.#startAttempted = false;
    return ok(undefined);
  }

  readonly #onData = (text: string): void => {
    if (text.length > MAX_INPUT_CHUNK_CODE_UNITS) {
      this.#failQueue("terminal input chunk exceeded the owned limit");
      return;
    }
    const monotonicMilliseconds = Number(hrtime.bigint() / 1_000_000n);
    this.#enqueue(
      ok(
        Object.freeze({
          kind: "input" as const,
          monotonicMilliseconds,
          text,
        }),
      ),
    );
  };

  readonly #onEnd = (): void => {
    this.#closed = true;
    this.#enqueue(ok(Object.freeze({ kind: "end" as const })));
  };

  readonly #onInputError = (cause: unknown): void => {
    this.#enqueue(err(new NodeTerminalError("input", cause)));
  };

  readonly #onResize = (): void => {
    this.#enqueue(ok(Object.freeze({ kind: "resize" as const })));
  };

  readonly #onOutputError = (cause: unknown): void => {
    this.#enqueue(err(new NodeTerminalError("output", cause)));
  };

  #enqueue(result: EventResult): void {
    if (this.#overflowed) {
      return;
    }
    const waiter = this.#waiters.shift();
    if (waiter !== undefined) {
      waiter(result);
      return;
    }
    const previous = this.#events.at(-1);
    if (
      result.ok &&
      result.value.kind === "resize" &&
      previous?.ok === true &&
      previous.value.kind === "resize"
    ) {
      return;
    }
    if (
      result.ok &&
      result.value.kind === "input" &&
      this.#queuedInputCodeUnits + result.value.text.length >
        MAX_QUEUED_INPUT_CODE_UNITS
    ) {
      this.#failQueue("terminal input queue exceeded the owned limit");
      return;
    }
    if (this.#events.length >= MAX_QUEUED_EVENTS) {
      this.#failQueue("terminal event queue exceeded the owned limit");
      return;
    }
    this.#events.push(result);
    if (result.ok && result.value.kind === "input") {
      this.#queuedInputCodeUnits += result.value.text.length;
    }
  }

  #failQueue(message: string): void {
    if (this.#overflowed) {
      return;
    }
    this.#overflowed = true;
    this.#events.splice(0);
    this.#queuedInputCodeUnits = 0;
    const cleanupCauses: unknown[] = [];
    try {
      this.#input.pause();
    } catch (cause: unknown) {
      cleanupCauses.push(cause);
    }
    const failure = err(
      new NodeTerminalError("input", message, cleanupCauses),
    );
    const waiter = this.#waiters.shift();
    if (waiter === undefined) {
      this.#events.push(failure);
    } else {
      waiter(failure);
    }
  }
}
