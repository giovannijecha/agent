import {
  ALTERNATE_SCREEN_ENTER,
  ALTERNATE_SCREEN_LEAVE,
  CLEAR_ROW,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_HOME,
  CURSOR_SHOW,
  moveTo,
} from "./ansi.js";
import { fitText, textCellWidth } from "./cell-width.js";
import type { Frame } from "./frame.js";
import type { TextOutput } from "./output.js";
import { ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

/** Serialized differential renderer for one alternate-screen terminal session. */
export class Renderer<E> {
  readonly #output: TextOutput<E>;
  #previous: readonly string[] = Object.freeze([]);
  #previousViewport: Viewport | undefined;
  #started = false;
  #alternateMayBeActive = false;
  #cursorMayBeHidden = false;
  #tail: Promise<void> = Promise.resolve();

  constructor(output: TextOutput<E>) {
    this.#output = output;
  }

  /**
   * Queues one complete frame and resolves after ordered output completes.
   * Committed frame and viewport snapshots change only after successful output.
   */
  render(frame: Frame, viewport: Viewport): Promise<Result<void, E>> {
    return this.#enqueue(() => this.#render(frame, viewport));
  }

  /** Shows the cursor, leaves the alternate screen, and resets after success. */
  finish(): Promise<Result<void, E>> {
    return this.#enqueue(() => this.#finish());
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #render(frame: Frame, viewport: Viewport): Promise<Result<void, E>> {
    const next = Object.freeze(
      frame.lines
        .slice(0, viewport.rows)
        .map((line) => fitText(line, viewport.columns)),
    );
    const viewportChanged =
      this.#previousViewport === undefined ||
      this.#previousViewport.columns !== viewport.columns ||
      this.#previousViewport.rows !== viewport.rows;
    const initializing = !this.#started;
    let buffer = "";

    if (initializing) {
      buffer += ALTERNATE_SCREEN_ENTER + CURSOR_HIDE + CLEAR_SCREEN + CURSOR_HOME;
      this.#alternateMayBeActive = true;
    } else if (viewportChanged) {
      buffer += CURSOR_HIDE + CLEAR_SCREEN + CURSOR_HOME;
    } else {
      buffer += CURSOR_HIDE;
    }
    this.#cursorMayBeHidden = true;

    const before = viewportChanged ? Object.freeze([]) : this.#previous;
    const rowCount = Math.min(
      viewport.rows,
      Math.max(before.length, next.length),
    );
    for (let row = 0; row < rowCount; row += 1) {
      const previousLine = before.at(row);
      const nextLine = next.at(row);
      if (previousLine === nextLine) {
        continue;
      }
      buffer += moveTo(row, 0) + CLEAR_ROW;
      if (nextLine !== undefined) {
        buffer += nextLine;
      }
    }

    const caret = frame.caret;
    let caretRow = 0;
    let caretColumn = 0;
    if (
      caret !== undefined &&
      caret.row < viewport.rows &&
      caret.column < viewport.columns
    ) {
      caretRow = caret.row;
      caretColumn = caret.column;
    } else if (next.length > 0) {
      caretRow = next.length - 1;
      caretColumn = Math.min(
        textCellWidth(next.at(caretRow) ?? ""),
        viewport.columns - 1,
      );
    }
    buffer += moveTo(caretRow, caretColumn) + CURSOR_SHOW;

    const written = await this.#output.write(buffer);
    if (!written.ok) {
      return written;
    }

    this.#started = true;
    this.#previous = next;
    this.#previousViewport = viewport;
    this.#cursorMayBeHidden = false;
    return ok(undefined);
  }

  async #finish(): Promise<Result<void, E>> {
    if (!this.#alternateMayBeActive && !this.#cursorMayBeHidden) {
      return ok(undefined);
    }

    let cleanup = CURSOR_SHOW;
    if (this.#alternateMayBeActive) {
      cleanup += ALTERNATE_SCREEN_LEAVE;
    }
    const restored = await this.#output.write(cleanup);
    if (!restored.ok) {
      return restored;
    }

    this.#started = false;
    this.#alternateMayBeActive = false;
    this.#cursorMayBeHidden = false;
    this.#previous = Object.freeze([]);
    this.#previousViewport = undefined;
    return ok(undefined);
  }
}
