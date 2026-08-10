const MAX_CHUNK_CODE_UNITS = 65_536;
const MAX_ESCAPE_CODE_UNITS = 32;
const ESCAPE = "\u001B";

export type KeyEvent =
  | Readonly<{ kind: "backspace" }>
  | Readonly<{ kind: "delete" }>
  | Readonly<{ kind: "down" }>
  | Readonly<{ kind: "end" }>
  | Readonly<{ kind: "enter" }>
  | Readonly<{ kind: "eof" }>
  | Readonly<{ kind: "home" }>
  | Readonly<{ kind: "interrupt" }>
  | Readonly<{ kind: "left" }>
  | Readonly<{ kind: "pageDown" }>
  | Readonly<{ kind: "pageUp" }>
  | Readonly<{ kind: "right" }>
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "up" }>
  | Readonly<{ kind: "unsupported" }>;

const SIMPLE_EVENTS = Object.freeze({
  backspace: Object.freeze({ kind: "backspace" as const }),
  delete: Object.freeze({ kind: "delete" as const }),
  down: Object.freeze({ kind: "down" as const }),
  end: Object.freeze({ kind: "end" as const }),
  enter: Object.freeze({ kind: "enter" as const }),
  eof: Object.freeze({ kind: "eof" as const }),
  home: Object.freeze({ kind: "home" as const }),
  interrupt: Object.freeze({ kind: "interrupt" as const }),
  left: Object.freeze({ kind: "left" as const }),
  pageDown: Object.freeze({ kind: "pageDown" as const }),
  pageUp: Object.freeze({ kind: "pageUp" as const }),
  right: Object.freeze({ kind: "right" as const }),
  up: Object.freeze({ kind: "up" as const }),
  unsupported: Object.freeze({ kind: "unsupported" as const }),
});

const KNOWN_SEQUENCES: readonly Readonly<{
  sequence: string;
  event: KeyEvent;
}>[] = Object.freeze([
  Object.freeze({ sequence: "\u001B[3~", event: SIMPLE_EVENTS.delete }),
  Object.freeze({ sequence: "\u001B[1~", event: SIMPLE_EVENTS.home }),
  Object.freeze({ sequence: "\u001B[4~", event: SIMPLE_EVENTS.end }),
  Object.freeze({ sequence: "\u001B[7~", event: SIMPLE_EVENTS.home }),
  Object.freeze({ sequence: "\u001B[8~", event: SIMPLE_EVENTS.end }),
  Object.freeze({ sequence: "\u001B[5~", event: SIMPLE_EVENTS.pageUp }),
  Object.freeze({ sequence: "\u001B[6~", event: SIMPLE_EVENTS.pageDown }),
  Object.freeze({ sequence: "\u001B[A", event: SIMPLE_EVENTS.up }),
  Object.freeze({ sequence: "\u001B[B", event: SIMPLE_EVENTS.down }),
  Object.freeze({ sequence: "\u001B[C", event: SIMPLE_EVENTS.right }),
  Object.freeze({ sequence: "\u001B[D", event: SIMPLE_EVENTS.left }),
  Object.freeze({ sequence: "\u001B[H", event: SIMPLE_EVENTS.home }),
  Object.freeze({ sequence: "\u001B[F", event: SIMPLE_EVENTS.end }),
  Object.freeze({ sequence: "\u001BOA", event: SIMPLE_EVENTS.up }),
  Object.freeze({ sequence: "\u001BOB", event: SIMPLE_EVENTS.down }),
  Object.freeze({ sequence: "\u001BOC", event: SIMPLE_EVENTS.right }),
  Object.freeze({ sequence: "\u001BOD", event: SIMPLE_EVENTS.left }),
  Object.freeze({ sequence: "\u001BOH", event: SIMPLE_EVENTS.home }),
  Object.freeze({ sequence: "\u001BOF", event: SIMPLE_EVENTS.end }),
]);

function appendEvent(events: KeyEvent[], event: KeyEvent): void {
  const previous = events.at(-1);
  if (event.kind === "unsupported" && previous?.kind === "unsupported") {
    return;
  }
  events.push(event);
}

function appendText(events: KeyEvent[], text: string): void {
  const previous = events.at(-1);
  if (previous?.kind === "text") {
    events.splice(
      events.length - 1,
      1,
      Object.freeze({
        kind: "text" as const,
        text: previous.text + text,
      }),
    );
    return;
  }
  events.push(Object.freeze({ kind: "text" as const, text }));
}

function isEditable(character: string): boolean {
  const point = character.codePointAt(0);
  return (
    point !== undefined &&
    point >= 0x20 &&
    point !== 0x7f &&
    !(point >= 0x80 && point <= 0x9f) &&
    !(point >= 0xd800 && point <= 0xdfff)
  );
}

function completeEscapeLength(source: string): number | undefined {
  if (source.startsWith(ESCAPE + "O")) {
    return source.length >= 3 ? 3 : undefined;
  }
  if (!source.startsWith(ESCAPE + "[")) {
    return source.length >= 2 ? 2 : undefined;
  }
  for (let index = 2; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return index + 1;
    }
  }
  return undefined;
}

/** Incrementally converts bounded terminal input into owned key events. */
export class InputDecoder {
  #pendingEscape = "";
  #pendingHighSurrogate = "";
  #previousWasCarriageReturn = false;
  #discardingEscape = false;

  /**
   * Decodes one bounded UTF-8 text chunk in order.
   * Incomplete escape and surrogate fragments remain private until the next call.
   */
  feed(chunk: string): readonly KeyEvent[] {
    if (chunk.length > MAX_CHUNK_CODE_UNITS) {
      this.#pendingEscape = "";
      this.#pendingHighSurrogate = "";
      this.#previousWasCarriageReturn = false;
      this.#discardingEscape = false;
      return Object.freeze([SIMPLE_EVENTS.unsupported]);
    }

    let source = this.#pendingEscape + this.#pendingHighSurrogate + chunk;
    this.#pendingEscape = "";
    this.#pendingHighSurrogate = "";
    if (source.length > 0) {
      const finalCode = source.charCodeAt(source.length - 1);
      if (finalCode >= 0xd800 && finalCode <= 0xdbff) {
        this.#pendingHighSurrogate = source.slice(-1);
        source = source.slice(0, -1);
      }
    }

    const events: KeyEvent[] = [];
    let index = 0;
    while (index < source.length) {
      if (this.#discardingEscape) {
        let completed = false;
        while (index < source.length) {
          const code = source.charCodeAt(index);
          index += 1;
          if (code >= 0x40 && code <= 0x7e) {
            completed = true;
            break;
          }
        }
        this.#discardingEscape = !completed;
        continue;
      }
      if (source.at(index) === ESCAPE) {
        const remaining = source.slice(index);
        const known = KNOWN_SEQUENCES.find((entry) =>
          remaining.startsWith(entry.sequence),
        );
        if (known !== undefined) {
          appendEvent(events, known.event);
          index += known.sequence.length;
          this.#previousWasCarriageReturn = false;
          continue;
        }
        let embeddedControl = 1;
        while (embeddedControl < remaining.length) {
          const code = remaining.charCodeAt(embeddedControl);
          if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
            break;
          }
          embeddedControl += 1;
        }
        if (embeddedControl < remaining.length) {
          appendEvent(events, SIMPLE_EVENTS.unsupported);
          index += embeddedControl;
          this.#previousWasCarriageReturn = false;
          continue;
        }
        if (KNOWN_SEQUENCES.some((entry) => entry.sequence.startsWith(remaining))) {
          this.#pendingEscape = remaining;
          break;
        }
        const completeLength = completeEscapeLength(remaining);
        if (
          completeLength === undefined &&
          remaining.length < MAX_ESCAPE_CODE_UNITS
        ) {
          this.#pendingEscape = remaining;
          break;
        }
        appendEvent(events, SIMPLE_EVENTS.unsupported);
        if (completeLength === undefined) {
          this.#discardingEscape = true;
          index = source.length;
        } else {
          index += completeLength;
        }
        this.#previousWasCarriageReturn = false;
        continue;
      }

      const point = source.codePointAt(index);
      if (point === undefined) {
        break;
      }
      const character = String.fromCodePoint(point);
      index += character.length;

      if (character === "\n" && this.#previousWasCarriageReturn) {
        this.#previousWasCarriageReturn = false;
        continue;
      }
      this.#previousWasCarriageReturn = false;
      if (character === "\r") {
        appendEvent(events, SIMPLE_EVENTS.enter);
        this.#previousWasCarriageReturn = true;
      } else if (character === "\n") {
        appendEvent(events, SIMPLE_EVENTS.enter);
      } else if (character === "\u0003") {
        appendEvent(events, SIMPLE_EVENTS.interrupt);
      } else if (character === "\u0004") {
        appendEvent(events, SIMPLE_EVENTS.eof);
      } else if (character === "\u0008" || character === "\u007F") {
        appendEvent(events, SIMPLE_EVENTS.backspace);
      } else if (isEditable(character)) {
        appendText(events, character);
      } else {
        appendEvent(events, SIMPLE_EVENTS.unsupported);
      }
    }

    return Object.freeze(events);
  }

  /** Discards incomplete terminal data and reports that it was unsupported. */
  finish(): readonly KeyEvent[] {
    const incomplete =
      this.#pendingEscape.length > 0 || this.#pendingHighSurrogate.length > 0;
    this.#pendingEscape = "";
    this.#pendingHighSurrogate = "";
    this.#previousWasCarriageReturn = false;
    this.#discardingEscape = false;
    return incomplete
      ? Object.freeze([SIMPLE_EVENTS.unsupported])
      : Object.freeze([]);
  }
}
