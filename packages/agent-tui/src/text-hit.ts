import { characterCellWidth } from "./cell-width.js";
import type { Frame } from "./frame.js";
import type { TextPosition } from "./text-interaction.js";

/** Resolves one exact rendered cell to its preserved logical text position. */
export function hitTextPosition(
  frame: Frame,
  row: number,
  column: number,
): TextPosition | undefined {
  if (
    !Number.isSafeInteger(row) ||
    row < 0 ||
    !Number.isSafeInteger(column) ||
    column < 0
  ) {
    return undefined;
  }
  const line = frame.rows.at(row);
  if (line === undefined) {
    return undefined;
  }
  let currentColumn = 0;
  for (const span of line.spans) {
    let currentOffset = span.position?.offset;
    for (const character of span.text) {
      const width = characterCellWidth(character);
      if (
        column >= currentColumn &&
        column < currentColumn + width &&
        span.position !== undefined &&
        currentOffset !== undefined
      ) {
        return Object.freeze({
          document: span.position.document,
          offset: currentOffset,
        });
      }
      currentColumn += width;
      if (currentOffset !== undefined) {
        currentOffset += 1;
      }
    }
  }
  return undefined;
}
