/** Closed structural glyphs whose terminal width is owned by the framework. */
const SINGLE_CELL_STRUCTURAL_GLYPHS = new Set([
  "\u00b7",
  "\u2022",
  "\u203a",
  "\u2192",
  "\u2500",
  "\u2502",
  "\u258c",
  "\u250c",
  "\u2510",
  "\u2514",
  "\u2518",
]);

const SINGLE_CELL_LATIN_PROSE_RANGES = Object.freeze([
  Object.freeze({ first: 0x00a0, last: 0x00ac }),
  Object.freeze({ first: 0x00ae, last: 0x024f }),
  Object.freeze({ first: 0x1e00, last: 0x1eff }),
  Object.freeze({ first: 0x2010, last: 0x2015 }),
  Object.freeze({ first: 0x2018, last: 0x201f }),
]);

const SINGLE_CELL_LATIN_PROSE_GLYPHS = new Set([
  "\u2026",
  "\u2039",
  "\u20ac",
]);

function isSingleCellLatinProse(point: number, character: string): boolean {
  return (
    SINGLE_CELL_LATIN_PROSE_RANGES.some(
      (range) => point >= range.first && point <= range.last,
    ) || SINGLE_CELL_LATIN_PROSE_GLYPHS.has(character)
  );
}

/** Owned terminal-cell measurement with a conservative unknown fallback. */

export function characterCellWidth(character: string): number {
  const point = character.codePointAt(0);
  return point !== undefined &&
    (point <= 0x7e ||
      SINGLE_CELL_STRUCTURAL_GLYPHS.has(character) ||
      isSingleCellLatinProse(point, character))
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
