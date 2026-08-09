import type {
  RuntimeCommandError,
  RuntimeSession,
  RuntimeSourceError,
  RuntimeStopError,
} from "@agent/runtime";
import {
  err,
  type ComponentError,
  ok,
  type Result,
  Renderer,
  type Viewport,
} from "@agent/tui";

import {
  ApplicationController,
  type ApplicationEffect,
  type ApplicationError,
} from "./application.js";
import { createChatFrame } from "./chat-view.js";
import type { ProviderPresentation } from "./commands.js";
import {
  type ArbiterError,
  EventArbiter,
} from "./event-arbiter.js";
import type { SessionUpdate } from "./session.js";
import type { TerminalHost } from "./terminal-host.js";

export const PLAIN_STATUS =
  "agent\ninteractive terminal requires TTY input and output\n";

export type RunFailure<E> =
  | Readonly<{ kind: "application"; error: ApplicationError }>
  | Readonly<{ kind: "arbiter"; error: ArbiterError }>
  | Readonly<{ kind: "frame"; error: ComponentError }>
  | Readonly<{
      kind: "runtime";
      operation: "acknowledge" | "approval" | "cancel" | "commit" | "event";
      error: RuntimeCommandError | RuntimeSourceError;
    }>
  | Readonly<{ kind: "source"; source: "runtime" | "terminal" }>
  | Readonly<{
      kind: "terminal";
      operation: "event" | "output" | "start" | "viewport";
      error: E;
    }>
  | Readonly<{
      kind: "unexpected";
      operation:
        | "application"
        | "runtimeAcknowledge"
        | "runtimeApproval"
        | "runtimeCancel"
        | "runtimeCommit"
        | "runtimeStart"
        | "terminal";
    }>;

export type CleanupFailure<E, RE> =
  | Readonly<{ kind: "renderer"; error: E }>
  | Readonly<{ kind: "runtime"; error: RuntimeStopError<RE> }>
  | Readonly<{ kind: "terminal"; error: E }>
  | Readonly<{
      kind: "unexpected";
      operation: "renderer" | "runtime" | "terminal";
    }>;

export type RunError<E, RE> = Readonly<{
  primary: RunFailure<E> | undefined;
  cleanup: readonly CleanupFailure<E, RE>[];
}>;

type EffectOutcome<E> = Readonly<{
  exit: boolean;
  failure: RunFailure<E> | undefined;
  redraw: boolean;
}>;

type RuntimeStopSettlement =
  | Readonly<{ kind: "unexpected" }>
  | Readonly<{ kind: "value"; result: unknown }>;

function runError<E, RE>(
  primary: RunFailure<E> | undefined,
  cleanup: readonly CleanupFailure<E, RE>[],
): Result<void, RunError<E, RE>> {
  return err(
    Object.freeze({
      primary,
      cleanup: Object.freeze([...cleanup]),
    }),
  );
}

function terminalFailure<E>(
  operation: "event" | "output" | "start" | "viewport",
  error: E,
): RunFailure<E> {
  return Object.freeze({ kind: "terminal" as const, operation, error });
}

function beginRuntimeStop<RE>(
  runtime: RuntimeSession<RE> | undefined,
): Promise<RuntimeStopSettlement> | undefined {
  if (runtime === undefined) {
    return undefined;
  }
  try {
    return Promise.resolve(runtime.stop()).then(
      (result) => Object.freeze({ kind: "value" as const, result }),
      (_cause: unknown) => Object.freeze({ kind: "unexpected" as const }),
    );
  } catch (_cause: unknown) {
    return Promise.resolve(Object.freeze({ kind: "unexpected" as const }));
  }
}

function classifyRuntimeStop<E, RE>(
  stopped: RuntimeStopSettlement,
): CleanupFailure<E, RE> | undefined {
  if (stopped.kind === "unexpected") {
    return Object.freeze({
      kind: "unexpected" as const,
      operation: "runtime" as const,
    });
  }
  try {
    if (typeof stopped.result !== "object" || stopped.result === null) {
      return Object.freeze({
        kind: "unexpected" as const,
        operation: "runtime" as const,
      });
    }
    const result = stopped.result as Readonly<{
      error?: unknown;
      ok?: unknown;
    }>;
    if (result.ok === true) {
      return undefined;
    }
    if (result.ok === false && "error" in result) {
      return Object.freeze({
        error: result.error as RuntimeStopError<RE>,
        kind: "runtime" as const,
      });
    }
    return Object.freeze({
      kind: "unexpected" as const,
      operation: "runtime" as const,
    });
  } catch (_cause: unknown) {
    return Object.freeze({
      kind: "unexpected" as const,
      operation: "runtime" as const,
    });
  }
}

async function renderApplication<E>(
  renderer: Renderer<E>,
  application: ApplicationController,
  viewport: Viewport,
): Promise<Result<void, RunFailure<E>>> {
  const frame = createChatFrame(application, viewport);
  if (!frame.ok) {
    return err(Object.freeze({ kind: "frame" as const, error: frame.error }));
  }
  const rendered = await renderer.render(frame.value, viewport);
  return rendered.ok
    ? ok(undefined)
    : err(terminalFailure("output", rendered.error));
}

function applyEffect<E, RE>(
  effect: ApplicationEffect,
  application: ApplicationController,
  arbiter: EventArbiter<E, RE>,
  runtime: RuntimeSession<RE> | undefined,
): EffectOutcome<E> {
  if (effect.kind === "exit") {
    return Object.freeze({ exit: true, failure: undefined, redraw: false });
  }
  if (effect.kind === "startTurn") {
    if (runtime === undefined) {
      application.noRuntime();
      return Object.freeze({ exit: false, failure: undefined, redraw: true });
    }
    try {
      const started = runtime.startTurn(effect.text);
      if (!started.ok) {
        application.turnRejected(started.error);
        return Object.freeze({ exit: false, failure: undefined, redraw: true });
      }
      const accepted = application.turnAccepted(started.value);
      if (!accepted.ok) {
        return Object.freeze({
          exit: false,
          failure: Object.freeze({
            kind: "application" as const,
            error: accepted.error,
          }),
          redraw: false,
        });
      }
      const armed = arbiter.armRuntime();
      return armed.ok
        ? Object.freeze({ exit: false, failure: undefined, redraw: true })
        : Object.freeze({
            exit: false,
            failure: Object.freeze({
              kind: "arbiter" as const,
              error: armed.error,
            }),
            redraw: false,
          });
    } catch (_cause: unknown) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeStart" as const,
        }),
        redraw: false,
      });
    }
  }

  if (effect.kind === "commitTurn") {
    if (runtime === undefined) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeCommit" as const,
        }),
        redraw: false,
      });
    }
    try {
      const committed = runtime.commitTurn(effect.turnId);
      if (!committed.ok) {
        return Object.freeze({
          exit: false,
          failure: Object.freeze({
            kind: "runtime" as const,
            operation: "commit" as const,
            error: committed.error,
          }),
          redraw: false,
        });
      }
      const resolved = application.turnCommitResolved(
        effect.turnId,
        committed.value,
      );
      return resolved.ok
        ? Object.freeze({
            exit: false,
            failure: undefined,
            redraw: resolved.value.redraw,
          })
        : Object.freeze({
            exit: false,
            failure: Object.freeze({
              kind: "application" as const,
              error: resolved.error,
            }),
            redraw: false,
          });
    } catch (_cause: unknown) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeCommit" as const,
        }),
        redraw: false,
      });
    }
  }

  if (effect.kind === "resolveToolApproval") {
    if (runtime === undefined) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeApproval" as const,
        }),
        redraw: false,
      });
    }
    try {
      const resolved = runtime.resolveToolApproval(
        effect.turnId,
        effect.callId,
        effect.approved,
      );
      return resolved.ok
        ? Object.freeze({ exit: false, failure: undefined, redraw: true })
        : Object.freeze({
            exit: false,
            failure: Object.freeze({
              kind: "runtime" as const,
              operation: "approval" as const,
              error: resolved.error,
            }),
            redraw: false,
          });
    } catch (_cause: unknown) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeApproval" as const,
        }),
        redraw: false,
      });
    }
  }

  if (effect.kind === "acknowledgeTurn") {
    if (runtime === undefined) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeAcknowledge" as const,
        }),
        redraw: false,
      });
    }
    try {
      const acknowledged = runtime.acknowledgeTurn(effect.turnId);
      return acknowledged.ok
        ? Object.freeze({ exit: false, failure: undefined, redraw: false })
        : Object.freeze({
            exit: false,
            failure: Object.freeze({
              kind: "runtime" as const,
              operation: "acknowledge" as const,
              error: acknowledged.error,
            }),
            redraw: false,
          });
    } catch (_cause: unknown) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "runtimeAcknowledge" as const,
        }),
        redraw: false,
      });
    }
  }

  if (runtime === undefined) {
    return Object.freeze({
      exit: false,
      failure: Object.freeze({
        kind: "unexpected" as const,
        operation: "runtimeCancel" as const,
      }),
      redraw: false,
    });
  }
  try {
    const cancelled = runtime.requestCancel(effect.turnId);
    return cancelled.ok
      ? Object.freeze({ exit: false, failure: undefined, redraw: true })
      : Object.freeze({
          exit: false,
          failure: Object.freeze({
            kind: "runtime" as const,
            operation: "cancel" as const,
            error: cancelled.error,
          }),
          redraw: false,
        });
  } catch (_cause: unknown) {
    return Object.freeze({
      exit: false,
      failure: Object.freeze({
        kind: "unexpected" as const,
        operation: "runtimeCancel" as const,
      }),
      redraw: false,
    });
  }
}

function applySessionUpdate<E, RE>(
  session: SessionUpdate,
  application: ApplicationController,
  arbiter: EventArbiter<E, RE>,
  runtime: RuntimeSession<RE> | undefined,
): EffectOutcome<E> {
  let redraw = session.redraw;
  for (const action of session.actions) {
    let applicationUpdate;
    try {
      applicationUpdate = application.applySessionAction(action);
    } catch (_cause: unknown) {
      return Object.freeze({
        exit: false,
        failure: Object.freeze({
          kind: "unexpected" as const,
          operation: "application" as const,
        }),
        redraw: false,
      });
    }
    redraw = redraw || applicationUpdate.redraw;
    for (const effect of applicationUpdate.effects) {
      const outcome = applyEffect(effect, application, arbiter, runtime);
      redraw = redraw || outcome.redraw;
      if (outcome.failure !== undefined || outcome.exit) {
        return Object.freeze({
          exit: outcome.exit,
          failure: outcome.failure,
          redraw,
        });
      }
    }
  }
  return Object.freeze({ exit: false, failure: undefined, redraw });
}

function applyApplicationUpdate<E, RE>(
  update: Readonly<{
    effects: readonly ApplicationEffect[];
    redraw: boolean;
  }>,
  application: ApplicationController,
  arbiter: EventArbiter<E, RE>,
  runtime: RuntimeSession<RE> | undefined,
): EffectOutcome<E> {
  let redraw = update.redraw;
  for (const effect of update.effects) {
    const outcome = applyEffect(effect, application, arbiter, runtime);
    redraw = redraw || outcome.redraw;
    if (outcome.failure !== undefined || outcome.exit) {
      return Object.freeze({
        exit: outcome.exit,
        failure: outcome.failure,
        redraw,
      });
    }
  }
  return Object.freeze({ exit: false, failure: undefined, redraw });
}

async function cleanup<E, RE>(
  host: TerminalHost<E>,
  renderer: Renderer<E>,
  runtime: RuntimeSession<RE> | undefined,
  arbiter: EventArbiter<E, RE> | undefined,
): Promise<readonly CleanupFailure<E, RE>[]> {
  arbiter?.close();
  const runtimeStop = beginRuntimeStop(runtime);
  const failures: CleanupFailure<E, RE>[] = [];
  try {
    const stopped = await host.stop();
    if (!stopped.ok) {
      failures.push(
        Object.freeze({ kind: "terminal" as const, error: stopped.error }),
      );
    }
  } catch (_cause: unknown) {
    failures.push(
      Object.freeze({
        kind: "unexpected" as const,
        operation: "terminal" as const,
      }),
    );
  }
  try {
    const finished = await renderer.finish();
    if (!finished.ok) {
      failures.push(
        Object.freeze({ kind: "renderer" as const, error: finished.error }),
      );
    }
  } catch (_cause: unknown) {
    failures.push(
      Object.freeze({
        kind: "unexpected" as const,
        operation: "renderer" as const,
      }),
    );
  }
  if (runtimeStop !== undefined) {
    const stopped = await runtimeStop;
    const failure = classifyRuntimeStop<E, RE>(stopped);
    if (failure !== undefined) {
      failures.push(failure);
    }
  }
  return Object.freeze(failures);
}

async function cleanupPlainRuntime<RE>(
  runtime: RuntimeSession<RE> | undefined,
): Promise<readonly CleanupFailure<never, RE>[]> {
  const stopped = beginRuntimeStop(runtime);
  if (stopped === undefined) {
    return Object.freeze([]);
  }
  const result = await stopped;
  const failure = classifyRuntimeStop<never, RE>(result);
  return failure === undefined
    ? Object.freeze([])
    : Object.freeze([failure]);
}

/** Runs plain output or one serialized terminal/runtime application session. */
export async function run<E, RE = never>(
  host: TerminalHost<E>,
  runtime?: RuntimeSession<RE>,
  provider?: ProviderPresentation,
): Promise<Result<void, RunError<E, RE>>> {
  if (!host.interactive) {
    let primary: RunFailure<E> | undefined;
    try {
      const written = await host.write(PLAIN_STATUS);
      if (!written.ok) {
        primary = terminalFailure("output", written.error);
      }
    } catch (_cause: unknown) {
      primary = Object.freeze({
        kind: "unexpected" as const,
        operation: "terminal" as const,
      });
    }
    const runtimeCleanup = await cleanupPlainRuntime(runtime);
    const cleanupFailures = runtimeCleanup as readonly CleanupFailure<E, RE>[];
    return primary === undefined && cleanupFailures.length === 0
      ? ok(undefined)
      : runError(primary, cleanupFailures);
  }

  const renderer = new Renderer(host);
  let application: ApplicationController | undefined;
  let arbiter: EventArbiter<E, RE> | undefined;
  let primary: RunFailure<E> | undefined;
  let viewport: Viewport | undefined;
  try {
    const measured = host.viewport();
    if (!measured.ok) {
      primary = terminalFailure("viewport", measured.error);
    } else {
      viewport = measured.value;
    }

    if (primary === undefined) {
      const started = await host.start();
      if (!started.ok) {
        primary = terminalFailure("start", started.error);
      }
    }

    if (primary === undefined && viewport !== undefined) {
      application = new ApplicationController(runtime !== undefined, provider);
      arbiter = new EventArbiter(host, runtime);
      const initial = await renderApplication(renderer, application, viewport);
      if (!initial.ok) {
        primary = initial.error;
      }

      let running = primary === undefined;
      while (running && primary === undefined) {
        const received = await arbiter.nextEvent();
        if (!received.ok) {
          primary = Object.freeze({
            kind: "arbiter" as const,
            error: received.error,
          });
          break;
        }
        const event = received.value;
        if (event.kind === "unexpectedSource") {
          primary = Object.freeze({
            kind: "source" as const,
            source: event.source,
          });
          break;
        }

        let redraw = false;
        if (event.kind === "terminal") {
          if (!event.result.ok) {
            primary = terminalFailure("event", event.result.error);
            break;
          }
          const terminal = event.result.value;
          if (terminal.kind === "resize") {
            const measured = host.viewport();
            if (!measured.ok) {
              primary = terminalFailure("viewport", measured.error);
              break;
            }
            viewport = measured.value;
            redraw = true;
          } else {
            const session =
              terminal.kind === "end"
                ? application.end()
                : application.feed(terminal.text);
            const outcome = applySessionUpdate(
              session,
              application,
              arbiter,
              runtime,
            );
            redraw = outcome.redraw;
            if (outcome.failure !== undefined) {
              primary = outcome.failure;
              break;
            }
            if (outcome.exit) {
              running = false;
            }
          }
        } else if (!event.result.ok) {
          primary = Object.freeze({
            kind: "runtime" as const,
            operation: "event" as const,
            error: event.result.error,
          });
          break;
        } else {
          const applied = application.applyRuntime(event.result.value);
          if (!applied.ok) {
            primary = Object.freeze({
              kind: "application" as const,
              error: applied.error,
            });
            break;
          }
          const outcome = applyApplicationUpdate(
            applied.value,
            application,
            arbiter,
            runtime,
          );
          redraw = outcome.redraw;
          if (outcome.failure !== undefined) {
            primary = outcome.failure;
            break;
          }
          if (outcome.exit) {
            running = false;
          }
          if (application.activeTurnId !== undefined) {
            const armed = arbiter.armRuntime();
            if (!armed.ok) {
              primary = Object.freeze({
                kind: "arbiter" as const,
                error: armed.error,
              });
              break;
            }
          }
        }

        if (running && primary === undefined && redraw) {
          const rendered = await renderApplication(
            renderer,
            application,
            viewport,
          );
          if (!rendered.ok) {
            primary = rendered.error;
          }
        }
      }
    }
  } catch (_cause: unknown) {
    primary = Object.freeze({
      kind: "unexpected" as const,
      operation: "application" as const,
    });
  }

  application?.clear();
  const cleanupFailures = await cleanup(host, renderer, runtime, arbiter);
  return primary === undefined && cleanupFailures.length === 0
    ? ok(undefined)
    : runError(primary, cleanupFailures);
}
