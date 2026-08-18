import {
  CLIPBOARD_CODE_UNIT_LIMIT,
  type Frame,
  hitTextPosition,
  markdownSelectionText,
  type PointerEvent,
  TextSelection,
  type TextPosition,
  type VerticalAllocation,
} from "@agent/tui";

import type { TranscriptEntry } from "./chat-state.js";
import { CONVERSATION_DENSITY } from "./conversation-density.js";

const COMPOSER_MAXIMUM_ROWS = 6;
const DOUBLE_CLICK_MILLISECONDS = 500;

export type PointerProjection = Readonly<{
  composer: VerticalAllocation;
  frame: Frame;
  stageColumns: number;
  stageLeft: number;
  transcript: VerticalAllocation;
}>;

export type PointerInteractionUpdate = Readonly<{
  composerInteraction: boolean;
  notice: readonly string[] | undefined;
  redraw: boolean;
  scrollDelta: number | undefined;
}>;

export type EditorInteractionPort = Readonly<{
  readonly selectedEditorText: string | undefined;
  editorPositionAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): number | undefined;
  selectEditorAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
    extend: boolean,
  ): boolean;
  selectEditorWordAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): boolean;
  selectEditorWordThroughAt(
    columns: number,
    maximumRows: number,
    row: number,
    column: number,
  ): boolean;
}>;

function interactionUpdate(
  redraw: boolean,
  options: Readonly<{
    composerInteraction?: boolean | undefined;
    notice?: readonly string[] | undefined;
    scrollDelta?: number | undefined;
  }> = Object.freeze({}),
): PointerInteractionUpdate {
  return Object.freeze({
    composerInteraction: options.composerInteraction ?? false,
    notice: options.notice,
    redraw,
    scrollDelta: options.scrollDelta,
  });
}

function after(left: TextPosition, right: TextPosition): boolean {
  return (
    right.document > left.document ||
    (right.document === left.document && right.offset >= left.offset)
  );
}

function wordSelection(
  position: TextPosition,
  entries: readonly TranscriptEntry[],
): TextSelection | undefined {
  const item = entries.find(
    (entry) => entry.document === position.document,
  );
  if (item === undefined) {
    return undefined;
  }
  const characters = Array.from(markdownSelectionText(item.content));
  if (position.offset >= characters.length) {
    return undefined;
  }
  const separator = (character: string | undefined): boolean =>
    character === " " || character === "\t" || character === "\n";
  let start = position.offset;
  let end = position.offset + 1;
  const selectedSeparator = separator(characters.at(position.offset));
  while (
    start > 0 &&
    separator(characters.at(start - 1)) === selectedSeparator
  ) {
    start -= 1;
  }
  while (
    end < characters.length &&
    separator(characters.at(end)) === selectedSeparator
  ) {
    end += 1;
  }
  return TextSelection.create(
    { document: position.document, offset: start },
    { document: position.document, offset: end },
  );
}

/** CLI-owned pointer gesture state over generic TUI interaction mechanics. */
export class TerminalInteraction {
  #composerDragging = false;
  #composerMoved = false;
  #composerWordDragging = false;
  #lastComposerClick:
    | Readonly<{ position: number; timeMilliseconds: number }>
    | undefined;
  #lastTranscriptClick:
    | Readonly<{
        position: TextPosition;
        timeMilliseconds: number;
      }>
    | undefined;
  #pendingCopy: string | undefined;
  #transcriptAnchor: TextPosition | undefined;
  #transcriptDragging = false;
  #transcriptMoved = false;
  #transcriptSelection: TextSelection | undefined;
  #transcriptWordAnchor: TextSelection | undefined;

  get transcriptSelection(): TextSelection | undefined {
    return this.#transcriptSelection;
  }

  /** Returns and clears one bounded clipboard request. */
  takePendingCopy(): string | undefined {
    const pending = this.#pendingCopy;
    this.#pendingCopy = undefined;
    return pending;
  }

  /** Clears every interaction range and geometry-dependent gesture. */
  reset(): void {
    this.#transcriptSelection = undefined;
    this.#pendingCopy = undefined;
    this.breakSequence();
  }

  /** Breaks click and drag timing without discarding a settled range. */
  breakSequence(): void {
    this.#transcriptAnchor = undefined;
    this.#transcriptDragging = false;
    this.#transcriptMoved = false;
    this.#transcriptWordAnchor = undefined;
    this.#lastTranscriptClick = undefined;
    this.#composerDragging = false;
    this.#composerMoved = false;
    this.#composerWordDragging = false;
    this.#lastComposerClick = undefined;
  }

  /** Reduces one validated pointer event against the latest planned frame. */
  apply(
    event: PointerEvent,
    timeMilliseconds: number,
    projection: PointerProjection,
    entries: readonly TranscriptEntry[],
    editor: EditorInteractionPort,
    composerEnabled: boolean,
  ): PointerInteractionUpdate {
    if (
      !Number.isSafeInteger(timeMilliseconds) ||
      timeMilliseconds < 0 ||
      event.shift
    ) {
      this.breakSequence();
      return interactionUpdate(false);
    }
    if (event.action === "wheel") {
      this.#lastTranscriptClick = undefined;
      this.#lastComposerClick = undefined;
    }

    const composer = projection.composer;
    const verticalPadding =
      composer.viewportRows >=
      CONVERSATION_DENSITY.composerRuleRows * 2 + 1
        ? CONVERSATION_DENSITY.composerRuleRows
        : CONVERSATION_DENSITY.flushRows;
    const horizontalPadding =
      projection.stageColumns >=
      CONVERSATION_DENSITY.contentInsetCells * 2 + 1
        ? CONVERSATION_DENSITY.contentInsetCells
        : CONVERSATION_DENSITY.flushCells;
    const composerRow = event.row - composer.startRow - verticalPadding;
    const composerColumn =
      event.column - projection.stageLeft - horizontalPadding;
    const composerRows = Math.min(
      COMPOSER_MAXIMUM_ROWS,
      Math.max(0, composer.viewportRows - verticalPadding * 2),
    );
    const composerColumns =
      projection.stageColumns - horizontalPadding * 2;
    const inComposer =
      composerRow >= 0 &&
      composerRow < composerRows &&
      composerColumn >= 0 &&
      composerColumn < composerColumns;
    if (
      composerEnabled &&
      !this.#transcriptDragging &&
      (inComposer || this.#composerDragging) &&
      event.button === "left" &&
      event.action !== "wheel"
    ) {
      const composerUpdate = this.#applyComposer(
        event,
        timeMilliseconds,
        composerColumns,
        composerRows,
        composerRow,
        composerColumn,
        editor,
      );
      return interactionUpdate(composerUpdate.redraw, {
        composerInteraction: true,
        notice: composerUpdate.notice,
        scrollDelta: composerUpdate.scrollDelta,
      });
    }

    const transcript = projection.transcript;
    const inTranscript =
      event.row >= transcript.startRow &&
      event.row < transcript.startRow + transcript.viewportRows;
    if (event.action === "wheel") {
      return inTranscript && event.wheel !== undefined
        ? interactionUpdate(false, {
            scrollDelta: event.wheel === "up" ? -3 : 3,
          })
        : interactionUpdate(false);
    }
    if (
      (!inTranscript && !this.#transcriptDragging) ||
      event.button !== "left"
    ) {
      return interactionUpdate(false);
    }
    const position = hitTextPosition(
      projection.frame,
      event.row,
      event.column,
    );
    if (position === undefined) {
      if (event.action === "release" && this.#transcriptDragging) {
        this.#transcriptDragging = false;
        this.#transcriptAnchor = undefined;
        this.#transcriptMoved = false;
        this.#transcriptWordAnchor = undefined;
        const queued = this.#queueTranscriptCopy(entries);
        return interactionUpdate(this.#transcriptSelection !== undefined, queued);
      }
      if (event.action === "press") {
        const changed = this.#transcriptSelection !== undefined;
        this.#transcriptSelection = undefined;
        this.#lastTranscriptClick = undefined;
        return interactionUpdate(changed);
      }
      return interactionUpdate(false);
    }
    return this.#applyTranscript(
      event,
      timeMilliseconds,
      position,
      entries,
    );
  }

  #applyTranscript(
    event: PointerEvent,
    timeMilliseconds: number,
    position: TextPosition,
    entries: readonly TranscriptEntry[],
  ): PointerInteractionUpdate {
    if (event.action === "press") {
      const previous = this.#lastTranscriptClick;
      const doubleClick =
        previous !== undefined &&
        previous.position.document === position.document &&
        previous.position.offset === position.offset &&
        timeMilliseconds >= previous.timeMilliseconds &&
        timeMilliseconds - previous.timeMilliseconds <=
          DOUBLE_CLICK_MILLISECONDS;
      this.#lastTranscriptClick = Object.freeze({
        position,
        timeMilliseconds,
      });
      if (doubleClick) {
        const range = wordSelection(position, entries);
        if (range !== undefined) {
          this.#lastTranscriptClick = undefined;
          this.#transcriptSelection = range;
          this.#transcriptAnchor = undefined;
          this.#transcriptWordAnchor = range;
          this.#transcriptDragging = true;
          this.#transcriptMoved = false;
          return interactionUpdate(true);
        }
      }
      this.#transcriptAnchor = position;
      this.#transcriptWordAnchor = undefined;
      this.#transcriptDragging = true;
      this.#transcriptMoved = false;
      this.#transcriptSelection = TextSelection.create(position, position);
      return interactionUpdate(true);
    }
    if (event.action === "move" && this.#transcriptDragging) {
      const wordAnchor = this.#transcriptWordAnchor;
      if (wordAnchor !== undefined) {
        const target = wordSelection(position, entries);
        if (target === undefined) return interactionUpdate(false);
        this.#transcriptMoved = true;
        this.#transcriptSelection = this.#wordDragSelection(
          wordAnchor,
          target,
        );
        return interactionUpdate(true);
      }
      const anchor = this.#transcriptAnchor;
      if (anchor === undefined) return interactionUpdate(false);
      this.#transcriptMoved = true;
      this.#lastTranscriptClick = undefined;
      this.#transcriptSelection = this.#dragSelection(anchor, position);
      return interactionUpdate(true);
    }
    if (event.action === "release" && this.#transcriptDragging) {
      const anchor = this.#transcriptAnchor;
      const wordAnchor = this.#transcriptWordAnchor;
      this.#transcriptDragging = false;
      this.#transcriptAnchor = undefined;
      this.#transcriptWordAnchor = undefined;
      if (wordAnchor !== undefined) {
        const target = wordSelection(position, entries);
        if (target !== undefined) {
          this.#transcriptSelection = this.#wordDragSelection(
            wordAnchor,
            target,
          );
        }
      } else if (anchor !== undefined && this.#transcriptMoved) {
        this.#transcriptSelection = this.#dragSelection(anchor, position);
      } else if (!this.#transcriptMoved) {
        this.#transcriptSelection = undefined;
      }
      this.#transcriptMoved = false;
      return interactionUpdate(true, this.#queueTranscriptCopy(entries));
    }
    return interactionUpdate(false);
  }

  #applyComposer(
    event: PointerEvent,
    timeMilliseconds: number,
    columns: number,
    rows: number,
    row: number,
    column: number,
    editor: EditorInteractionPort,
  ): PointerInteractionUpdate {
    const position = editor.editorPositionAt(columns, rows, row, column);
    if (position === undefined) {
      if (event.action === "release" && this.#composerDragging) {
        this.#composerDragging = false;
        const wordDragging = this.#composerWordDragging;
        this.#composerWordDragging = false;
        const moved = this.#composerMoved;
        this.#composerMoved = false;
        if (moved || wordDragging) this.#queueEditorCopy(editor);
        return interactionUpdate(moved || wordDragging);
      }
      return interactionUpdate(false);
    }
    if (event.action === "press") {
      const previous = this.#lastComposerClick;
      const doubleClick =
        previous !== undefined &&
        previous.position === position &&
        timeMilliseconds >= previous.timeMilliseconds &&
        timeMilliseconds - previous.timeMilliseconds <=
          DOUBLE_CLICK_MILLISECONDS;
      this.#lastComposerClick = Object.freeze({
        position,
        timeMilliseconds,
      });
      this.#composerDragging = true;
      this.#composerWordDragging = doubleClick;
      this.#composerMoved = false;
      const changed = doubleClick
        ? editor.selectEditorWordAt(columns, rows, row, column)
        : editor.selectEditorAt(columns, rows, row, column, false);
      if (doubleClick) this.#lastComposerClick = undefined;
      return interactionUpdate(changed);
    }
    if (event.action === "move" && this.#composerDragging) {
      this.#composerMoved = true;
      if (!this.#composerWordDragging) this.#lastComposerClick = undefined;
      return interactionUpdate(
        this.#composerWordDragging
          ? editor.selectEditorWordThroughAt(columns, rows, row, column)
          : editor.selectEditorAt(columns, rows, row, column, true),
      );
    }
    if (event.action === "release" && this.#composerDragging) {
      this.#composerDragging = false;
      const wordDragging = this.#composerWordDragging;
      this.#composerWordDragging = false;
      if (!this.#composerMoved && !wordDragging) {
        return interactionUpdate(false);
      }
      this.#composerMoved = false;
      const changed = wordDragging
        ? editor.selectEditorWordThroughAt(columns, rows, row, column)
        : editor.selectEditorAt(columns, rows, row, column, true);
      this.#queueEditorCopy(editor);
      return interactionUpdate(
        changed || editor.selectedEditorText !== undefined,
      );
    }
    return interactionUpdate(false);
  }

  #dragSelection(
    anchor: TextPosition,
    position: TextPosition,
  ): TextSelection | undefined {
    return after(anchor, position)
      ? TextSelection.create(anchor, {
          document: position.document,
          offset: position.offset + 1,
        })
      : TextSelection.create(
          {
            document: anchor.document,
            offset: anchor.offset + 1,
          },
          position,
        );
  }

  #wordDragSelection(
    anchor: TextSelection,
    target: TextSelection,
  ): TextSelection | undefined {
    if (after(target.end, anchor.start)) {
      return TextSelection.create(target.start, anchor.end);
    }
    if (after(anchor.end, target.start)) {
      return TextSelection.create(anchor.start, target.end);
    }
    return TextSelection.create(anchor.start, anchor.end);
  }

  #queueEditorCopy(editor: EditorInteractionPort): void {
    const selected = editor.selectedEditorText;
    if (
      selected !== undefined &&
      selected.length <= CLIPBOARD_CODE_UNIT_LIMIT
    ) {
      this.#pendingCopy = selected;
    }
  }

  #queueTranscriptCopy(
    entries: readonly TranscriptEntry[],
  ): Readonly<{ notice?: readonly string[] }> {
    const selection = this.#transcriptSelection;
    if (selection === undefined || selection.empty) {
      return Object.freeze({});
    }
    const selected: string[] = [];
    for (const item of entries) {
      if (
        item.document < selection.start.document ||
        item.document > selection.end.document
      ) {
        continue;
      }
      const visible = Array.from(markdownSelectionText(item.content));
      const start = item.document === selection.start.document
        ? selection.start.offset
        : 0;
      const end = item.document === selection.end.document
        ? selection.end.offset
        : visible.length;
      selected.push(visible.slice(start, end).join(""));
    }
    const text = selected.join("\n\n");
    if (text.length === 0) {
      return Object.freeze({});
    }
    if (text.length <= CLIPBOARD_CODE_UNIT_LIMIT) {
      this.#pendingCopy = text;
      return Object.freeze({});
    }
    return Object.freeze({
      notice: Object.freeze(["Selection is too large to copy safely."]),
    });
  }
}
