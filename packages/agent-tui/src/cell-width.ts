/** Closed structural glyphs whose terminal width is owned by the framework. */
const SINGLE_CELL_STRUCTURAL_GLYPHS = new Set([
  "\u00b7",
  "\u2022",
  "\u203a",
  "\u2192",
  "\u2500",
  "\u2502",
  "\u250c",
  "\u2510",
  "\u2514",
  "\u2518",
]);

/** Conservative owned terminal-cell measurement. */

export function characterCellWidth(character: string): number {
  const point = character.codePointAt(0);
  return point !== undefined &&
    (point <= 0x7e || SINGLE_CELL_STRUCTURAL_GLYPHS.has(character))
    ? 1
    : 2;
}

export function textCellWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width += characterCellWidth(character);
  }
  return width;
}

export function fitText(text: string, columns: number): string {
  let fitted = "";
  let width = 0;
  for (const character of text) {
    const nextWidth = characterCellWidth(character);
    if (width + nextWidth > columns) {
      break;
    }
    fitted += character;
    width += nextWidth;
  }
  return fitted;
}

/** Returns whether a string contains an unmatched UTF-16 surrogate code unit. */
export function hasLoneSurrogate(text: string): boolean {
  let index = 0;
  while (index < text.length) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 2;
    } else {
      if (unit >= 0xdc00 && unit <= 0xdfff) {
        return true;
      }
      index += 1;
    }
  }
  return false;
}
