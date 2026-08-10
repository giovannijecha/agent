import {
  InputDecoder,
  LineEditor,
  type EditorProjection,
} from "@agent/tui";

import {
  executeSubmission,
  type ProviderPresentation,
} from "./commands.js";

export type TranscriptMovement =
  | "lineDown"
  | "lineUp"
  | "pageDown"
  | "pageUp";

export type SessionAction =
  | Readonly<{ kind: "approve" }>
  | Readonly<{ kind: "deny" }>
  | Readonly<{ kind: "exit" }>
  | Readonly<{ kind: "interrupt" }>
  | Readonly<{
      kind: "navigateTranscript";
      movement: TranscriptMovement;
    }>
  | Readonly<{ kind: "notice"; lines: readonly string[] }>
  | Readonly<{ kind: "submit"; text: string }>;

export type SessionUpdate = Readonly<{
  actions: readonly SessionAction[];
  redraw: boolean;
}>;

function notice(...lines: string[]): SessionAction {
  return Object.freeze({
    kind: "notice" as const,
    lines: Object.freeze(lines),
  });
}

/** Pure terminal input and editing reducer; it owns no application lifecycle. */
export class SessionController {
  readonly #decoder = new InputDecoder();
  readonly #editor = new LineEditor();
  readonly #provider: ProviderPresentation | undefined;

  constructor(provider?: ProviderPresentation) {
    this.#provider = provider;
  }

  get draftLength(): number {
    return this.#editor.length;
  }

  projectEditor(columns: number): EditorProjection {
    return this.#editor.project(columns);
  }

  /** Decodes one chunk into ordered immutable application actions. */
  feed(chunk: string): SessionUpdate {
    const actions: SessionAction[] = [];
    let afterInterrupt = false;
    let exitCandidate: string | undefined = "";
    let redraw = false;
    let stopChunk = false;
    for (const event of this.#decoder.feed(chunk)) {
      if (stopChunk) {
        break;
      }
      if (afterInterrupt) {
        if (event.kind === "eof") {
          actions.push(Object.freeze({ kind: "exit" as const }));
          stopChunk = true;
        } else if (event.kind === "text" && exitCandidate !== undefined) {
          const nextCandidate: string = exitCandidate + event.text;
          exitCandidate = "/exit".startsWith(nextCandidate)
            ? nextCandidate
            : undefined;
        } else if (event.kind === "enter") {
          if (exitCandidate === "/exit") {
            actions.push(Object.freeze({ kind: "exit" as const }));
            stopChunk = true;
          }
          exitCandidate = undefined;
        }
        continue;
      }
      if (
        event.kind === "up" ||
        event.kind === "down" ||
        event.kind === "pageUp" ||
        event.kind === "pageDown"
      ) {
        const movement: TranscriptMovement =
          event.kind === "up"
            ? "lineUp"
            : event.kind === "down"
              ? "lineDown"
              : event.kind;
        actions.push(
          Object.freeze({
            kind: "navigateTranscript" as const,
            movement,
          }),
        );
        continue;
      }
      const outcome = this.#editor.apply(event);
      if (outcome.kind === "changed") {
        redraw = true;
      } else if (outcome.kind === "submitted") {
        redraw = true;
        const command = executeSubmission(outcome.text, this.#provider);
        if (command.kind === "exit") {
          actions.push(Object.freeze({ kind: "exit" as const }));
          stopChunk = true;
        } else if (command.kind === "notice") {
          actions.push(
            Object.freeze({ kind: "notice" as const, lines: command.lines }),
          );
        } else if (command.kind === "submit") {
          actions.push(
            Object.freeze({ kind: "submit" as const, text: command.text }),
          );
        } else if (command.kind === "approve" || command.kind === "deny") {
          actions.push(Object.freeze({ kind: command.kind }));
        }
      } else if (outcome.kind === "interrupt") {
        actions.push(Object.freeze({ kind: "interrupt" as const }));
        afterInterrupt = true;
      } else if (outcome.kind === "eof") {
        actions.push(Object.freeze({ kind: "exit" as const }));
        stopChunk = true;
      } else if (outcome.kind === "limit") {
        actions.push(
          notice("Input limit reached; additional text was ignored."),
        );
        redraw = true;
      } else if (outcome.kind === "unsupported") {
        actions.push(notice("Unsupported key sequence was ignored."));
        redraw = true;
      }
    }
    return Object.freeze({ actions: Object.freeze(actions), redraw });
  }

  /** Discards incomplete decoder state when the terminal source ends. */
  end(): SessionUpdate {
    this.#decoder.finish();
    return Object.freeze({
      actions: Object.freeze([
        Object.freeze({ kind: "exit" as const }),
      ]),
      redraw: false,
    });
  }

  /** Releases decoder fragments and all retained draft content. */
  clear(): void {
    this.#decoder.finish();
    this.#editor.clear();
  }
}
