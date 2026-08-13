import {
  ALTERNATE_SCREEN_ENTER,
  ALTERNATE_SCREEN_LEAVE,
  BRACKETED_PASTE_DISABLE,
  BRACKETED_PASTE_ENABLE,
  CLEAR_ROW,
  CLEAR_SCREEN,
  CURSOR_HIDE,
  CURSOR_HOME,
  CURSOR_SHOW,
  CURSOR_STEADY_BAR,
  CURSOR_STYLE_DEFAULT,
  MOUSE_BUTTON_EVENT_DISABLE,
  MOUSE_BUTTON_EVENT_ENABLE,
  MOUSE_SGR_DISABLE,
  MOUSE_SGR_ENABLE,
  STYLE_RESET,
  SYNCHRONIZED_OUTPUT_BEGIN,
  SYNCHRONIZED_OUTPUT_END,
  TERMINAL_STRING_TERMINATOR,
  beginStyle,
  HYPERLINK_CLOSE,
  moveTo,
  openHyperlink,
} from "./ansi.js";
import type { Frame } from "./frame.js";
import { ClipboardPayload } from "./clipboard.js";
import type { TextOutput } from "./output.js";
import { RichRow } from "./rich-row.js";
import { ok, type Result } from "./result.js";
import type { Viewport } from "./viewport.js";

function rowsEqual(
  left: RichRow | undefined,
  right: RichRow | undefined,
): boolean {
  return left === undefined ? right === undefined : left.equals(right);
}

function renderRow(row: RichRow): string {
  const rendered: string[] = [];
  for (const span of row.spans) {
    const prefix = beginStyle(span.tone, span.mark, span.slant, span.surface);
    const hyperlink = span.hyperlink;
    const opened = hyperlink === undefined ? "" : openHyperlink(hyperlink);
    const closed = hyperlink === undefined ? "" : HYPERLINK_CLOSE;
    rendered.push(
      prefix.length === 0
        ? opened + span.text + closed
        : opened + prefix + span.text + closed + STYLE_RESET,
    );
  }
  return rendered.join("");
}

function rowContainsHyperlink(row: RichRow): boolean {
  return row.spans.some((span) => span.hyperlink !== undefined);
}

function fitRenderedRow(row: RichRow, columns: number): RichRow {
  const fitted = row.fit(columns);
  if (!fitted.ok) {
    throw new RangeError("validated renderer geometry invariant failed");
  }
  return fitted.value;
}

/** Serialized differential renderer for one alternate-screen terminal session. */
export class Renderer<E> {
  readonly #output: TextOutput<E>;
  #previous: readonly RichRow[] = Object.freeze([]);
  #previousViewport: Viewport | undefined;
  #started = false;
  #alternateMayBeActive = false;
  #bracketedPasteMayBeActive = false;
  #cursorMayBeHidden = false;
  #cursorStyleMayBeChanged = false;
  #mouseButtonEventsMayBeActive = false;
  #mouseSgrMayBeActive = false;
  #synchronizationMayBeActive = false;
  #terminalStringMayBeActive = false;
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

  /** Writes one prevalidated OSC 52 request in renderer order. */
  copy(payload: ClipboardPayload): Promise<Result<void, E>> {
    return this.#enqueue(async () => {
      const recovered = await this.#recoverTerminalString();
      if (!recovered.ok) {
        return recovered;
      }
      const sequence = ClipboardPayload.sequence(payload);
      this.#terminalStringMayBeActive = true;
      const written = await this.#output.write(sequence);
      if (written.ok) {
        this.#terminalStringMayBeActive = false;
      }
      return written;
    });
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
    const recovered = await this.#recoverTerminalString();
    if (!recovered.ok) {
      return recovered;
    }
    const next = Object.freeze(
      frame.rows
        .slice(0, viewport.rows)
        .map((row) => fitRenderedRow(row, viewport.columns)),
    );
    const viewportChanged =
      this.#previousViewport === undefined ||
      this.#previousViewport.columns !== viewport.columns ||
      this.#previousViewport.rows !== viewport.rows;
    const initializing = !this.#started;
    let buffer = "";
    let containsTerminalString = false;

    if (initializing) {
      buffer +=
        ALTERNATE_SCREEN_ENTER +
        MOUSE_SGR_ENABLE +
        MOUSE_BUTTON_EVENT_ENABLE +
        BRACKETED_PASTE_ENABLE +
        CURSOR_HIDE +
        CURSOR_STEADY_BAR +
        CLEAR_SCREEN +
        CURSOR_HOME;
      this.#alternateMayBeActive = true;
      this.#mouseSgrMayBeActive = true;
      this.#mouseButtonEventsMayBeActive = true;
      this.#bracketedPasteMayBeActive = true;
      this.#cursorStyleMayBeChanged = true;
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
      if (rowsEqual(previousLine, nextLine)) {
        continue;
      }
      buffer += moveTo(row, 0) + CLEAR_ROW;
      if (nextLine !== undefined) {
        containsTerminalString ||= rowContainsHyperlink(nextLine);
        buffer += renderRow(nextLine);
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
        next.at(caretRow)?.cellWidth ?? 0,
        viewport.columns - 1,
      );
    }
    buffer += moveTo(caretRow, caretColumn) + CURSOR_SHOW;

    const recovery = this.#synchronizationMayBeActive
      ? SYNCHRONIZED_OUTPUT_END + STYLE_RESET
      : "";
    this.#synchronizationMayBeActive = true;
    this.#terminalStringMayBeActive = containsTerminalString;
    const written = await this.#output.write(
      recovery + SYNCHRONIZED_OUTPUT_BEGIN + buffer + SYNCHRONIZED_OUTPUT_END,
    );
    if (!written.ok) {
      return written;
    }

    this.#synchronizationMayBeActive = false;
    this.#terminalStringMayBeActive = false;
    this.#started = true;
    this.#previous = next;
    this.#previousViewport = viewport;
    this.#cursorMayBeHidden = false;
    return ok(undefined);
  }

  async #finish(): Promise<Result<void, E>> {
    const recovered = await this.#recoverTerminalString();
    if (!recovered.ok) {
      return recovered;
    }
    if (
      !this.#alternateMayBeActive &&
      !this.#bracketedPasteMayBeActive &&
      !this.#cursorMayBeHidden &&
      !this.#cursorStyleMayBeChanged &&
      !this.#mouseButtonEventsMayBeActive &&
      !this.#mouseSgrMayBeActive &&
      !this.#synchronizationMayBeActive
    ) {
      return ok(undefined);
    }

    let cleanup = this.#synchronizationMayBeActive
      ? SYNCHRONIZED_OUTPUT_END
      : "";
    cleanup += STYLE_RESET;
    if (this.#mouseButtonEventsMayBeActive) {
      cleanup += MOUSE_BUTTON_EVENT_DISABLE;
    }
    if (this.#mouseSgrMayBeActive) {
      cleanup += MOUSE_SGR_DISABLE;
    }
    if (this.#bracketedPasteMayBeActive) {
      cleanup += BRACKETED_PASTE_DISABLE;
    }
    if (this.#cursorStyleMayBeChanged) {
      cleanup += CURSOR_STYLE_DEFAULT;
    }
    cleanup += CURSOR_SHOW;
    if (this.#alternateMayBeActive) {
      cleanup += ALTERNATE_SCREEN_LEAVE;
    }
    const restored = await this.#output.write(cleanup);
    if (!restored.ok) {
      return restored;
    }

    this.#started = false;
    this.#alternateMayBeActive = false;
    this.#bracketedPasteMayBeActive = false;
    this.#cursorMayBeHidden = false;
    this.#cursorStyleMayBeChanged = false;
    this.#mouseButtonEventsMayBeActive = false;
    this.#mouseSgrMayBeActive = false;
    this.#synchronizationMayBeActive = false;
    this.#previous = Object.freeze([]);
    this.#previousViewport = undefined;
    return ok(undefined);
  }

  async #recoverTerminalString(): Promise<Result<void, E>> {
    if (!this.#terminalStringMayBeActive) {
      return ok(undefined);
    }
    const recovered = await this.#output.write(
      TERMINAL_STRING_TERMINATOR + HYPERLINK_CLOSE,
    );
    if (recovered.ok) {
      this.#terminalStringMayBeActive = false;
    }
    return recovered;
  }
}
