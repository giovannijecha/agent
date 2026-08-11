import {
  InputDecoder,
  LineEditor,
  type EditorAreaProjection,
  type EditorProjection,
} from "@agent/tui";

import {
  commandCompletions,
  executeSubmission,
  type CommandDefinition,
  type ProviderPresentation,
} from "./commands.js";

export type CommandCompletionProjection = Readonly<{
  items: readonly CommandDefinition[];
  selectedIndex: number;
}>;

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

function dispatchSubmission(
  actions: SessionAction[],
  input: string,
  provider: ProviderPresentation | undefined,
): boolean {
  const command = executeSubmission(input, provider);
  if (command.kind === "exit") {
    actions.push(Object.freeze({ kind: "exit" as const }));
    return true;
  }
  if (command.kind === "notice") {
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
  return false;
}

/** Pure terminal input and editing reducer; it owns no application lifecycle. */
export class SessionController {
  readonly #decoder = new InputDecoder();
  readonly #editor = new LineEditor();
  readonly #provider: ProviderPresentation | undefined;
  #completionIndex = 0;

  constructor(provider?: ProviderPresentation) {
    this.#provider = provider;
  }

  get draftLength(): number {
    return this.#editor.length;
  }

  projectEditor(columns: number): EditorProjection {
    return this.#editor.project(columns);
  }

  projectEditorArea(
    columns: number,
    maximumRows: number,
  ): EditorAreaProjection {
    return this.#editor.projectArea(columns, maximumRows);
  }

  projectCommandCompletion(): CommandCompletionProjection | undefined {
    const items = commandCompletions(this.#editor.text);
    if (items.length === 0) {
      return undefined;
    }
    const selectedIndex = Math.min(this.#completionIndex, items.length - 1);
    return Object.freeze({ items, selectedIndex });
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
        const completion = this.projectCommandCompletion();
        if (
          completion !== undefined &&
          (event.kind === "up" || event.kind === "down")
        ) {
          const next =
            event.kind === "up"
              ? Math.max(0, completion.selectedIndex - 1)
              : Math.min(
                  completion.items.length - 1,
                  completion.selectedIndex + 1,
                );
          if (next !== completion.selectedIndex) {
            this.#completionIndex = next;
            redraw = true;
          }
          continue;
        }
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
      if (event.kind === "tab") {
        const completion = this.projectCommandCompletion();
        if (completion !== undefined) {
          const selected = completion.items.at(completion.selectedIndex);
          if (selected !== undefined) {
            const completed = this.#editor.replace(selected.command);
            this.#completionIndex = 0;
            if (completed.kind === "changed") {
              redraw = true;
            }
            continue;
          }
        }
      }
      if (event.kind === "enter") {
        const completion = this.projectCommandCompletion();
        if (completion !== undefined) {
          const selected = completion.items.at(completion.selectedIndex);
          if (selected !== undefined) {
            this.#editor.clear();
            this.#completionIndex = 0;
            redraw = true;
            stopChunk = dispatchSubmission(
              actions,
              selected.command,
              this.#provider,
            );
            continue;
          }
        }
      }
      const outcome = this.#editor.apply(event);
      if (outcome.kind === "changed") {
        this.#completionIndex = 0;
        redraw = true;
      } else if (outcome.kind === "submitted") {
        this.#completionIndex = 0;
        redraw = true;
        stopChunk = dispatchSubmission(
          actions,
          outcome.text,
          this.#provider,
        );
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
    this.#completionIndex = 0;
  }
}
