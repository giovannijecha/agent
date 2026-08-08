import { characterCellWidth } from "./cell-width.js";
import {
  ComponentError,
  validComponentColumns,
} from "./component.js";
import { TUI_LIMITS } from "./limits.js";
import { err, ok, type Result } from "./result.js";

const TAB_CELLS = 4;
const REPLACEMENT = "?";

function isControl(point: number): boolean {
  return point <= 0x1f || (point >= 0x7f && point <= 0x9f);
}

function isSurrogate(point: number): boolean {
  return point >= 0xd800 && point <= 0xdfff;
}

/** Converts bounded untrusted text into printable conservatively wrapped rows. */
export function layoutDisplayText(
  text: string,
  columns: number,
  anchor: "head" | "tail",
  maximumRows: number,
): Result<readonly string[], ComponentError> {
  if (!validComponentColumns(columns)) {
    return err(new ComponentError("invalidGeometry", undefined));
  }
  if (typeof text !== "string") {
    return err(new ComponentError("invalidText", undefined));
  }
  if (text.length > TUI_LIMITS.displayTextCodeUnits) {
    return err(new ComponentError("textTooLong", undefined));
  }
  if (
    !Number.isSafeInteger(maximumRows) ||
    maximumRows < 1 ||
    maximumRows > TUI_LIMITS.frameRows ||
    (anchor !== "head" && anchor !== "tail")
  ) {
    return err(new ComponentError("invalidGeometry", undefined));
  }
  if (text.length === 0) {
    return ok(Object.freeze([]));
  }

  const headLines: string[] = [];
  const tailLines = new Map<number, string>();
  let retainedTailRows = 0;
  let tailCursor = 0;
  let line = "";
  let width = 0;
  let headComplete = false;
  const pushLine = (): void => {
    if (anchor === "head") {
      if (headLines.length < maximumRows) {
        headLines.push(line);
      }
      headComplete = headLines.length >= maximumRows;
    } else if (retainedTailRows < maximumRows) {
      tailLines.set(retainedTailRows, line);
      retainedTailRows += 1;
    } else {
      tailLines.set(tailCursor, line);
      tailCursor = (tailCursor + 1) % maximumRows;
    }
    line = "";
    width = 0;
  };
  const append = (value: string): void => {
    let printable = value;
    let cellWidth = characterCellWidth(printable);
    if (cellWidth > columns) {
      printable = REPLACEMENT;
      cellWidth = 1;
    }
    if (width + cellWidth > columns) {
      pushLine();
    }
    if (!headComplete) {
      line += printable;
      width += cellWidth;
    }
  };

  let index = 0;
  while (index < text.length && !headComplete) {
    const first = text.charCodeAt(index);
    if (first === 0x0d || first === 0x0a) {
      if (first === 0x0d && text.charCodeAt(index + 1) === 0x0a) {
        index += 2;
      } else {
        index += 1;
      }
      pushLine();
      continue;
    }
    if (first === 0x09) {
      const spaces = TAB_CELLS - (width % TAB_CELLS);
      for (let count = 0; count < spaces && !headComplete; count += 1) {
        append(" ");
      }
      index += 1;
      continue;
    }

    const point = text.codePointAt(index);
    if (point === undefined) {
      break;
    }
    const units = point > 0xffff ? 2 : 1;
    const character =
      isControl(point) || isSurrogate(point)
        ? REPLACEMENT
        : String.fromCodePoint(point);
    append(character);
    index += units;
  }
  if (!headComplete) {
    pushLine();
  }
  if (anchor === "head") {
    return ok(Object.freeze(headLines));
  }

  const ordered: string[] = [];
  const start = retainedTailRows < maximumRows ? 0 : tailCursor;
  for (let offset = 0; offset < retainedTailRows; offset += 1) {
    const retained = tailLines.get((start + offset) % maximumRows);
    if (retained !== undefined) {
      ordered.push(retained);
    }
  }
  return ok(Object.freeze(ordered));
}
