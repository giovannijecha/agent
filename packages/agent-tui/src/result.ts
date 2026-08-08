/** An explicit success or failure value local to the independent TUI package. */
export type Result<T, E> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

/** Creates an immutable successful result. */
export function ok<T>(value: T): Result<T, never> {
  return Object.freeze({ ok: true, value });
}

/** Creates an immutable failed result. */
export function err<E>(error: E): Result<never, E> {
  return Object.freeze({ ok: false, error });
}
