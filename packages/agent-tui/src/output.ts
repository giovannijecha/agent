import type { Result } from "./result.js";

/**
 * Terminal output boundary used by the renderer.
 *
 * Implementations resolve a success only after the ordered write completes.
 * The renderer treats any failure as potentially visible and attempts cleanup.
 */
export interface TextOutput<E> {
  /** Accepts one ordered text chunk without changing its bytes. */
  write(text: string): Promise<Result<void, E>>;
}
