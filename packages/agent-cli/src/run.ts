import type {
  RuntimeCommandError,
  RuntimeSession,
  RuntimeSourceError,
  RuntimeStopError,
} from "@agent/runtime";
import {
  advanceMotionPhase,
  ClipboardPayload,
  err,
  type ComponentError,
  type MotionPhase,
  ok,
  type Result,
  Renderer,
  type Viewport,
} from "@agent/tui";

import {
  ApplicationController,
  type ApplicationEffect,
  type ApplicationError,
  type ApplicationUpdate,
  type ClipboardSettlement,
} from "./application.js";
import { createChatRender } from "./chat-view.js";
import type { ChatRender } from "./chat-view.js";
import type { ProviderPresentation } from "./commands.js";
import {
  type ArbiterError,
  EventArbiter,
} from "./event-arbiter.js";
import type { TerminalHost } from "./terminal-host.js";
import type { MotionController } from "./motion-scheduler.js";
import { isMotionActive } from "./motion-policy.js";
import type { NoticeController } from "./notice-scheduler.js";
import type { ClipboardPort } from "./platform-clipboard.js";
import type { EvaluationReceiptRecorder } from "./evaluation-receipt.js";

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
  | Readonly<{
      kind: "source";
      source: "motion" | "notice" | "runtime" | "terminal";
    }>
  | Readonly<{
      kind: "terminal";
      operation: "event" | "output" | "start" | "viewport";
      error: E;
    }>
  | Readonly<{
      kind: "unexpected";
      operation:
        | "application"
        | "motion"
        | "notice"
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
      operation: "motion" | "notice" | "renderer" | "runtime" | "terminal";
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

async function copySelection<E>(
  text: string,
  renderer: Renderer<E>,
  clipboard: ClipboardPort | undefined,
): Promise<ClipboardSettlement> {
  if (clipboard !== undefined) {
    try {
      const copied = await clipboard.copy(text);
      if (!copied.ok) return "failed";
      if (copied.value === "copied") return "copied";
    } catch (_cause: unknown) {
      return "failed";
    }
  }
  const payload = ClipboardPayload.create(text);
  if (!payload.ok) return "failed";
  try {
    const requested = await renderer.copy(payload.value);
    return requested.ok ? "requested" : "failed";
  } catch (_cause: unknown) {
    return "failed";
  }
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
  motionPhase: MotionPhase,
): Promise<Result<ChatRender, RunFailure<E>>> {
  const prepared = createChatRender(application, viewport, motionPhase);
  if (!prepared.ok) {
    return err(Object.freeze({ kind: "frame" as const, error: prepared.error }));
  }
  const observed = application.observeTranscriptGeometry(
    prepared.value.transcript.contentRows,
    prepared.value.transcript.viewportRows,
  );
  if (!observed.ok) {
    return err(
      Object.freeze({ kind: "application" as const, error: observed.error }),
    );
  }
  const rendered = await renderer.render(prepared.value.frame, viewport);
  return rendered.ok
    ? ok(prepared.value)
    : err(terminalFailure("output", rendered.error));
}

function applyEffect<E, RE>(
  effect: ApplicationEffect,
  application: ApplicationController,
  arbiter: EventArbiter<E, RE>,
  runtime: RuntimeSession<RE> | undefined,
  evaluation: EvaluationReceiptRecorder | undefined,
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
      evaluation?.acceptedTurn();
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
      if (resolved.ok && effect.approved) {
        evaluation?.approvedTool();
      }
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

function applyApplicationUpdate<E, RE>(
  update: Readonly<{
    effects: readonly ApplicationEffect[];
    redraw: boolean;
  }>,
  application: ApplicationController,
  arbiter: EventArbiter<E, RE>,
  runtime: RuntimeSession<RE> | undefined,
  evaluation: EvaluationReceiptRecorder | undefined,
): EffectOutcome<E> {
  let redraw = update.redraw;
  for (const effect of update.effects) {
    const outcome = applyEffect(
      effect,
      application,
      arbiter,
      runtime,
      evaluation,
    );
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
  motion: MotionController | undefined,
  notices: NoticeController | undefined,
): Promise<readonly CleanupFailure<E, RE>[]> {
  const failures = closeAuxiliaryControllers<E, RE>(motion, notices);
  arbiter?.close();
  const runtimeStop = beginRuntimeStop(runtime);
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

function closeAuxiliaryControllers<E, RE>(
  motion: MotionController | undefined,
  notices: NoticeController | undefined,
): CleanupFailure<E, RE>[] {
  const failures: CleanupFailure<E, RE>[] = [];
  try {
    notices?.close();
  } catch (_cause: unknown) {
    failures.push(
      Object.freeze({
        kind: "unexpected" as const,
        operation: "notice" as const,
      }),
    );
  }
  try {
    motion?.close();
  } catch (_cause: unknown) {
    failures.push(
      Object.freeze({
        kind: "unexpected" as const,
        operation: "motion" as const,
      }),
    );
  }
  return failures;
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
  workspace?: string,
  motion?: MotionController,
  notices?: NoticeController,
  clipboard?: ClipboardPort,
  evaluation?: EvaluationReceiptRecorder,
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
    const cleanupFailures = closeAuxiliaryControllers<E, RE>(motion, notices);
    const runtimeCleanup = await cleanupPlainRuntime(runtime);
    cleanupFailures.push(
      ...(runtimeCleanup as readonly CleanupFailure<E, RE>[]),
    );
    return primary === undefined && cleanupFailures.length === 0
      ? ok(undefined)
      : runError(primary, Object.freeze(cleanupFailures));
  }

  const renderer = new Renderer(host);
  let application: ApplicationController | undefined;
  let arbiter: EventArbiter<E, RE> | undefined;
  let primary: RunFailure<E> | undefined;
  let viewport: Viewport | undefined;
  let motionPhase: MotionPhase = 0;
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
      application = new ApplicationController(
        runtime !== undefined,
        provider,
        workspace,
      );
      arbiter = new EventArbiter(host, runtime, motion, notices);
      const initial = await renderApplication(
        renderer,
        application,
        viewport,
        motionPhase,
      );
      if (!initial.ok) {
        primary = initial.error;
      }
      let lastRender = initial.ok ? initial.value : undefined;

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
        if (event.kind === "motion") {
          if (!event.result.ok) {
            primary = Object.freeze({
              kind: "source" as const,
              source: "motion" as const,
            });
            break;
          }
          if (isMotionActive(application.phase)) {
            motionPhase = advanceMotionPhase(motionPhase);
            redraw = true;
          }
        } else if (event.kind === "notice") {
          if (!event.result.ok) {
            primary = Object.freeze({
              kind: "source" as const,
              source: "notice" as const,
            });
            break;
          }
          redraw = application.expireNotice(event.result.value.token).redraw;
        } else if (event.kind === "terminal") {
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
            application.resize();
            redraw = true;
          } else {
            let applicationUpdate: ApplicationUpdate;
            try {
              applicationUpdate =
                terminal.kind === "end"
                  ? application.end()
                  : application.feed(
                      terminal.text,
                      terminal.monotonicMilliseconds,
                      lastRender === undefined
                        ? undefined
                        : Object.freeze({
                            composer: lastRender.composer,
                            frame: lastRender.frame,
                            stageColumns: lastRender.stage.columns,
                            stageLeft: lastRender.stage.left,
                            transcript: lastRender.transcript,
                          }),
                    );
            } catch (_cause: unknown) {
              primary = Object.freeze({
                kind: "unexpected" as const,
                operation: "application" as const,
              });
              break;
            }
            const outcome = applyApplicationUpdate(
              applicationUpdate,
              application,
              arbiter,
              runtime,
              evaluation,
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
          if (event.result.value.kind === "toolRequested") {
            evaluation?.requestedTool();
          }
          const outcome = applyApplicationUpdate(
            applied.value,
            application,
            arbiter,
            runtime,
            evaluation,
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

        const pendingCopy = application.takePendingCopy();
        if (pendingCopy !== undefined) {
          const settlement = await copySelection(
            pendingCopy,
            renderer,
            clipboard,
          );
          redraw = application.clipboardSettled(settlement).redraw || redraw;
        }

        const functionalRedraw =
          redraw && (event.kind === "terminal" || event.kind === "runtime");
        const authoritativeRedraw = redraw && event.kind !== "motion";
        if (authoritativeRedraw) {
          if (functionalRedraw) {
            motionPhase = 0;
          }
          try {
            motion?.discardReady();
            arbiter.discardMotionReady();
          } catch (_cause: unknown) {
            primary = Object.freeze({
              kind: "unexpected" as const,
              operation: "motion" as const,
            });
            break;
          }
        }

        try {
          notices?.setNotice(application.noticeToken);
        } catch (_cause: unknown) {
          primary = Object.freeze({
            kind: "unexpected" as const,
            operation: "notice" as const,
          });
          break;
        }

        const motionActive = isMotionActive(application.phase);
        if (!motionActive) {
          motionPhase = 0;
        }
        try {
          motion?.setActive(motionActive);
        } catch (_cause: unknown) {
          primary = Object.freeze({
            kind: "unexpected" as const,
            operation: "motion" as const,
          });
          break;
        }

        if (running && primary === undefined && redraw) {
          const rendered = await renderApplication(
            renderer,
            application,
            viewport,
            motionPhase,
          );
          if (!rendered.ok) {
            primary = rendered.error;
          } else {
            lastRender = rendered.value;
          }
          if (rendered.ok && motionActive) {
            try {
              motion?.frameRendered();
            } catch (_cause: unknown) {
              primary = Object.freeze({
                kind: "unexpected" as const,
                operation: "motion" as const,
              });
            }
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
  const cleanupFailures = await cleanup(
    host,
    renderer,
    runtime,
    arbiter,
    motion,
    notices,
  );
  return primary === undefined && cleanupFailures.length === 0
    ? ok(undefined)
    : runError(primary, cleanupFailures);
}
