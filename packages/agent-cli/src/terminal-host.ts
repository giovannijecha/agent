import type { Result, TextOutput, Viewport } from "@agent/tui";

/** Ordered platform event consumed by the serialized CLI loop. */
export type HostEvent =
  | Readonly<{ kind: "end" }>
  | Readonly<{
      kind: "input";
      monotonicMilliseconds: number;
      /** The terminal boundary has settled one exact bare Escape byte. */
      settledEscape?: true;
      text: string;
    }>
  | Readonly<{ kind: "resize" }>;

/** Narrow terminal capability implemented only at the CLI platform edge. */
export interface TerminalHost<E> extends TextOutput<E> {
  /** Whether both input and output expose interactive TTY capabilities. */
  readonly interactive: boolean;
  /** Reads validated current geometry. */
  viewport(): Result<Viewport, E>;
  /** Installs listeners and enables interactive input. */
  start(): Promise<Result<void, E>>;
  /** Resolves the next ordered input, resize, end, or platform failure. */
  nextEvent(): Promise<Result<HostEvent, E>>;
  /** Removes listeners and restores platform input state idempotently. */
  stop(): Promise<Result<void, E>>;
}
