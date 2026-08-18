import {
  InputDecoder,
  LineEditor,
  type EditorAreaProjection,
  type EditorProjection,
  type PointerEvent,
} from "@agent/tui";

import {
  commandCompletions,
  executeSubmission,
  type CommandDefinition,
} from "./commands.js";
import type { NoticeLevel } from "./notice.js";

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
  | Readonly<{ kind: "activateContextSelection" }>
  | Readonly<{ kind: "closePermissions" }>
  | Readonly<{ kind: "closeModels" }>
  | Readonly<{ kind: "closeProviders" }>
  | Readonly<{ kind: "closeTimeline" }>
  | Readonly<{ kind: "cancelProviderCredential" }>
  | Readonly<{ kind: "exit" }>
  | Readonly<{ kind: "interactionBreak" }>
  | Readonly<{ kind: "interrupt" }>
  | Readonly<{
      kind: "navigateTranscript";
      movement: TranscriptMovement;
    }>
  | Readonly<{
      kind: "notice";
      level: NoticeLevel;
      lines: readonly string[];
    }>
  | Readonly<{
      direction: "less" | "more";
      kind: "changePermission";
    }>
  | Readonly<{
      direction: "next" | "previous";
      kind: "moveContextSelection";
    }>
  | Readonly<{ kind: "openPermissions" }>
  | Readonly<{ kind: "openModels" }>
  | Readonly<{ kind: "openProviders" }>
  | Readonly<{ kind: "openTimeline" }>
  | Readonly<{
      event: PointerEvent;
      kind: "pointer";
      timeMilliseconds: number;
    }>
  | Readonly<{ kind: "submit"; text: string }>
  | Readonly<{ credential: string; kind: "submitProviderCredential" }>;

export type SessionUpdate = Readonly<{
  actions: readonly SessionAction[];
  redraw: boolean;
}>;

export type SessionReductionPort = Readonly<{
  apply(action: SessionAction): void;
  context(): SessionInputContext;
  editorRedrawn(): void;
}>;

export type SessionInputContext =
  | "composer"
  | "models"
  | "permissions"
  | "providerCredential"
  | "providers"
  | "timeline"
  | "toolDecision";

type ContextualSelectorContext =
  | "models"
  | "permissions"
  | "providers"
  | "timeline";

function contextualSelector(
  context: SessionInputContext,
): context is ContextualSelectorContext {
  return (
    context === "models" ||
    context === "permissions" ||
    context === "providers" ||
    context === "timeline"
  );
}

function closeContextualSelector(
  context: ContextualSelectorContext,
): SessionAction {
  if (context === "permissions") {
    return Object.freeze({ kind: "closePermissions" as const });
  }
  if (context === "providers") {
    return Object.freeze({ kind: "closeProviders" as const });
  }
  if (context === "models") {
    return Object.freeze({ kind: "closeModels" as const });
  }
  return Object.freeze({ kind: "closeTimeline" as const });
}

function notice(...lines: string[]): SessionAction {
  return Object.freeze({
    kind: "notice" as const,
    level: "warning" as const,
    lines: Object.freeze(lines),
  });
}

function dispatchSubmission(
  emit: (action: SessionAction) => void,
  input: string,
): boolean {
  const command = executeSubmission(input);
  if (command.kind === "exit") {
    emit(Object.freeze({ kind: "exit" as const }));
    return true;
  }
  if (command.kind === "notice") {
    emit(
      Object.freeze({
        kind: "notice" as const,
        level: command.level,
        lines: command.lines,
      }),
    );
  } else if (command.kind === "submit") {
    emit(
      Object.freeze({ kind: "submit" as const, text: command.text }),
    );
  } else if (command.kind === "permissions") {
    emit(Object.freeze({ kind: "openPermissions" as const }));
  } else if (command.kind === "providers") {
    emit(Object.freeze({ kind: "openProviders" as const }));
  } else if (command.kind === "models") {
    emit(Object.freeze({ kind: "openModels" as const }));
  } else if (command.kind === "timeline") {
    emit(Object.freeze({ kind: "openTimeline" as const }));
  }
  return false;
}

/** Pure terminal input and editing reducer; it owns no application lifecycle. */
export class SessionController {
  readonly #decoder = new InputDecoder();
  readonly #editor = new LineEditor();
  #completionIndex = 0;
  #pointerContext = false;
  #toolDecisionInputBlocked = false;

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

  get selectedEditorText(): string | undefined {
    return this.#editor.selectedText;
  }

  clearEditorSelection(): boolean {
    return this.#editor.clearSelection().kind === "changed";
  }

  editorPositionAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): number | undefined {
    return this.#editor.positionAt(
      columns,
      maximumRows,
      row,
      column,
    );
  }

  selectEditorAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
    extend: boolean,
  ): boolean {
    return this.#editor.selectAt(
      columns,
      maximumRows,
      row,
      column,
      extend,
    ).kind === "changed";
  }

  selectEditorWordAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): boolean {
    return this.#editor.selectWordAt(
      columns,
      maximumRows,
      row,
      column,
    ).kind === "changed";
  }

  selectEditorWordThroughAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): boolean {
    return this.#editor.selectWordThroughAt(
      columns,
      maximumRows,
      row,
      column,
    ).kind === "changed";
  }

  /** Reduces one ordered chunk through one optional synchronous application port. */
  feed(
    chunk: string,
    timeMilliseconds = 0,
    reduction?: SessionReductionPort,
    settledTrailingEscape = false,
  ): SessionUpdate {
    const actions: SessionAction[] = [];
    let redraw = false;
    const emit = (action: SessionAction): void => {
      if (reduction === undefined) {
        actions.push(action);
      } else {
        reduction.apply(action);
      }
    };
    const markEditorRedrawn = (): void => {
      redraw = true;
      reduction?.editorRedrawn();
    };
    let afterInterrupt = false;
    let exitCandidate: string | undefined = "";
    let stopChunk = false;
    for (const event of this.#decoder.feed(chunk, settledTrailingEscape)) {
      if (stopChunk) {
        break;
      }
      if (event.kind !== "pointer" && this.#pointerContext) {
        emit(Object.freeze({ kind: "interactionBreak" as const }));
        this.#pointerContext = false;
      }
      if (afterInterrupt) {
        if (event.kind === "eof") {
          emit(Object.freeze({ kind: "exit" as const }));
          stopChunk = true;
        } else if (event.kind === "text" && exitCandidate !== undefined) {
          const nextCandidate: string = exitCandidate + event.text;
          exitCandidate = "/exit".startsWith(nextCandidate)
            ? nextCandidate
            : undefined;
        } else if (event.kind === "enter") {
          if (exitCandidate === "/exit") {
            emit(Object.freeze({ kind: "exit" as const }));
            stopChunk = true;
          }
          exitCandidate = undefined;
        }
        continue;
      }
      if (event.kind === "pointer") {
        this.#pointerContext = true;
        emit(
          Object.freeze({
            event,
            kind: "pointer" as const,
            timeMilliseconds,
          }),
        );
        continue;
      }
      const context = reduction?.context() ?? "composer";
      if (context !== "toolDecision") {
        this.#toolDecisionInputBlocked = false;
      }
      if (context === "toolDecision") {
        if (event.kind === "up" || event.kind === "down") {
          this.#toolDecisionInputBlocked = false;
          emit(
            Object.freeze({
              direction: event.kind === "up" ? "previous" as const : "next" as const,
              kind: "moveContextSelection" as const,
            }),
          );
          continue;
        }
        if (event.kind === "enter") {
          if (this.#toolDecisionInputBlocked) {
            this.#toolDecisionInputBlocked = false;
            emit(notice("Resolve the pending tool permission first."));
            continue;
          }
          emit(Object.freeze({ kind: "activateContextSelection" as const }));
          continue;
        }
        if (
          event.kind !== "interrupt" &&
          event.kind !== "eof" &&
          event.kind !== "pageUp" &&
          event.kind !== "pageDown"
        ) {
          this.#toolDecisionInputBlocked = true;
          emit(notice("Resolve the pending tool permission first."));
          continue;
        }
      }
      if (contextualSelector(context)) {
        if (event.kind === "up" || event.kind === "down") {
          emit(
            Object.freeze({
              direction: event.kind === "up" ? "previous" as const : "next" as const,
              kind: "moveContextSelection" as const,
            }),
          );
          continue;
        }
        if (
          context === "permissions" &&
          (event.kind === "left" || event.kind === "right")
        ) {
          emit(
            Object.freeze({
              direction: event.kind === "left" ? "less" as const : "more" as const,
              kind: "changePermission" as const,
            }),
          );
          continue;
        }
        if (event.kind === "enter") {
          emit(
            context === "permissions"
              ? closeContextualSelector(context)
              : Object.freeze({ kind: "activateContextSelection" as const }),
          );
          continue;
        }
        if (event.kind === "interrupt" || event.kind === "escape") {
          emit(closeContextualSelector(context));
          continue;
        }
        if (
          event.kind !== "pageUp" &&
          event.kind !== "pageDown" &&
          event.kind !== "eof"
        ) {
          continue;
        }
      }
      if (context === "providerCredential") {
        if (event.kind === "interrupt") {
          if (this.#editor.clear()) {
            markEditorRedrawn();
          }
          emit(Object.freeze({ kind: "cancelProviderCredential" as const }));
          continue;
        }
        const credentialOutcome = this.#editor.apply(event);
        if (credentialOutcome.kind === "changed") {
          markEditorRedrawn();
        } else if (credentialOutcome.kind === "submitted") {
          markEditorRedrawn();
          emit(
            Object.freeze({
              credential: credentialOutcome.text,
              kind: "submitProviderCredential" as const,
            }),
          );
        } else if (credentialOutcome.kind === "eof") {
          emit(Object.freeze({ kind: "exit" as const }));
          stopChunk = true;
        } else if (credentialOutcome.kind === "limit") {
          markEditorRedrawn();
          emit(notice("Credential limit reached; additional text was ignored."));
        } else if (credentialOutcome.kind === "unsupported") {
          markEditorRedrawn();
          emit(notice("Unsupported key sequence was ignored."));
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
            markEditorRedrawn();
          }
          continue;
        }
        const movement: TranscriptMovement =
          event.kind === "up"
            ? "lineUp"
            : event.kind === "down"
              ? "lineDown"
              : event.kind;
        emit(
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
              markEditorRedrawn();
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
            markEditorRedrawn();
            stopChunk = dispatchSubmission(
              emit,
              selected.command,
            );
            continue;
          }
        }
      }
      const outcome = this.#editor.apply(event);
      if (outcome.kind === "changed") {
        this.#completionIndex = 0;
        markEditorRedrawn();
      } else if (outcome.kind === "submitted") {
        this.#completionIndex = 0;
        markEditorRedrawn();
        stopChunk = dispatchSubmission(
          emit,
          outcome.text,
        );
      } else if (outcome.kind === "interrupt") {
        emit(Object.freeze({ kind: "interrupt" as const }));
        afterInterrupt = true;
      } else if (outcome.kind === "eof") {
        emit(Object.freeze({ kind: "exit" as const }));
        stopChunk = true;
      } else if (outcome.kind === "limit") {
        markEditorRedrawn();
        emit(notice("Input limit reached; additional text was ignored."));
      } else if (outcome.kind === "unsupported") {
        markEditorRedrawn();
        emit(notice("Unsupported key sequence was ignored."));
      }
    }
    return Object.freeze({ actions: Object.freeze(actions), redraw });
  }

  /** Discards incomplete decoder state when the terminal source ends. */
  end(): SessionUpdate {
    this.#decoder.finish();
    this.#pointerContext = false;
    this.#toolDecisionInputBlocked = false;
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
    this.#pointerContext = false;
    this.#toolDecisionInputBlocked = false;
  }
}
