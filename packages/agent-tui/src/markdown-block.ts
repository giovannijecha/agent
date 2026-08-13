import {
  ComponentError,
  validComponentViewport,
  type Component,
  type ComponentMeasurement,
} from "./component.js";
import {
  type DisplayLine,
  layoutDisplayLines,
} from "./display-text.js";
import { Fragment } from "./fragment.js";
import { TUI_LIMITS } from "./limits.js";
import { markdownDisplayDocuments } from "./markdown-parser.js";
import {
  interactiveMarkdownLines,
  markdownSelectionText,
} from "./interactive-markdown.js";
import { RichRow } from "./rich-row.js";
import { err, ok, type Result } from "./result.js";
import type { TextAnchor } from "./text-block.js";
import { TextSelection } from "./text-interaction.js";
import type { Viewport } from "./viewport.js";

/** Immutable untrusted document component for the closed owned Markdown subset. */
export class MarkdownBlock implements Component {
  readonly #anchor: TextAnchor;
  readonly #documents: readonly string[];
  readonly #document: number | undefined;
  readonly #selection: TextSelection | undefined;

  private constructor(
    documents: readonly string[],
    anchor: TextAnchor,
    document: number | undefined = undefined,
    selection: TextSelection | undefined = undefined,
  ) {
    this.#documents = Object.freeze([...documents]);
    this.#anchor = anchor;
    this.#document = document;
    this.#selection = selection;
    Object.freeze(this);
  }

  /** Creates a bounded document without retaining rejected text in failures. */
  static create(
    text: string,
    anchor: TextAnchor,
    interaction?: Readonly<{
      document: number;
      selection?: TextSelection | undefined;
    }>,
  ): Result<MarkdownBlock, ComponentError> {
    if (interaction === undefined) {
      return MarkdownBlock.createDocuments([text], anchor);
    }
    if (typeof interaction !== "object" || interaction === null) {
      return err(new ComponentError("invalidText", undefined));
    }
    let document: unknown;
    let selection: unknown;
    try {
      document = interaction.document;
      selection = interaction.selection;
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidText", undefined));
    }
    const retainedSelection = selection === undefined
      ? undefined
      : selection instanceof TextSelection
        ? TextSelection.snapshot(selection)
        : undefined;
    if (
      !Number.isSafeInteger(document) ||
      (document as number) < 0 ||
      (selection !== undefined && retainedSelection === undefined)
    ) {
      return err(new ComponentError("invalidText", undefined));
    }
    const created = MarkdownBlock.createDocuments([text], anchor);
    return created.ok
      ? ok(
          new MarkdownBlock(
            created.value.#documents,
            anchor,
            document as number,
            retainedSelection,
          ),
        )
      : created;
  }

  /** Snapshots bounded documents whose Markdown state cannot cross a boundary. */
  static createDocuments(
    documents: readonly string[],
    anchor: TextAnchor,
  ): Result<MarkdownBlock, ComponentError> {
    try {
      if (
        !Array.isArray(documents) ||
        documents.length > TUI_LIMITS.markdownDocuments
      ) {
        return err(new ComponentError("invalidComponentCount", undefined));
      }
      if (anchor !== "head" && anchor !== "tail") {
        return err(new ComponentError("invalidAnchor", undefined));
      }
      const owned: string[] = [];
      let codeUnits = 0;
      for (let position = 0; position < documents.length; position += 1) {
        const document: unknown = documents.at(position);
        if (typeof document !== "string") {
          return err(new ComponentError("invalidText", position));
        }
        const separator = position === 0 ? 0 : 2;
        if (
          codeUnits + separator + document.length >
          TUI_LIMITS.displayTextCodeUnits
        ) {
          return err(new ComponentError("textTooLong", position));
        }
        owned.push(document);
        codeUnits += separator + document.length;
      }
      return ok(new MarkdownBlock(owned, anchor));
    } catch (_cause: unknown) {
      return err(new ComponentError("invalidText", undefined));
    }
  }

  measure(columns: number): Result<ComponentMeasurement, ComponentError> {
    const laidOut = layoutDisplayLines(
      this.#displayLines(),
      columns,
      this.#anchor,
      TUI_LIMITS.frameRows,
    );
    return laidOut.ok
      ? ok(Object.freeze({ preferredRows: laidOut.value.length }))
      : laidOut;
  }

  render(viewport: Viewport): Result<Fragment, ComponentError> {
    if (!validComponentViewport(viewport)) {
      return err(new ComponentError("invalidGeometry", undefined));
    }
    const laidOut = layoutDisplayLines(
      this.#displayLines(),
      viewport.columns,
      this.#anchor,
      viewport.rows,
    );
    if (!laidOut.ok) {
      return laidOut;
    }
    const visible = laidOut.value;
    const padding = Array.from(
      { length: viewport.rows - visible.length },
      () => RichRow.empty(),
    );
    const rows =
      this.#anchor === "head"
        ? [...visible, ...padding]
        : [...padding, ...visible];
    return Fragment.create(viewport, rows);
  }

  /** Returns exact unwrapped visible text for one interactive document. */
  selectionText(): string | undefined {
    const document = this.#documents.at(0);
    return this.#document === undefined || document === undefined
      ? undefined
      : markdownSelectionText(document);
  }

  #displayLines(): Iterable<DisplayLine> {
    const document = this.#documents.at(0);
    return this.#document === undefined || document === undefined
      ? markdownDisplayDocuments(this.#documents)
      : interactiveMarkdownLines(document, this.#document, this.#selection);
  }
}
