const MAX_HYPERLINK_CODE_UNITS = 2_048;
const HTTPS_PREFIX = "https://";

export type TextPosition = Readonly<{
  document: number;
  offset: number;
}>;

export type TextInteraction = Readonly<{
  hyperlink?: string;
  position?: TextPosition;
}>;

export type NormalizedTextInteraction = Readonly<{
  hyperlink: string | undefined;
  position: TextPosition | undefined;
}>;

function comparePosition(left: TextPosition, right: TextPosition): number {
  return left.document - right.document || left.offset - right.offset;
}

/** Immutable logical linear range independent from viewport coordinates. */
export class TextSelection {
  readonly #anchor: TextPosition;
  readonly #focus: TextPosition;

  private constructor(anchor: TextPosition, focus: TextPosition) {
    this.#anchor = anchor;
    this.#focus = focus;
    Object.freeze(this);
  }

  static create(
    anchor: unknown,
    focus: unknown,
  ): TextSelection | undefined {
    const normalizedAnchor = normalizePosition(anchor);
    const normalizedFocus = normalizePosition(focus);
    return normalizedAnchor === undefined || normalizedFocus === undefined
      ? undefined
      : new TextSelection(normalizedAnchor, normalizedFocus);
  }

  /** Snapshots one genuine selection without trusting public accessors. */
  static snapshot(value: TextSelection): TextSelection | undefined {
    try {
      return TextSelection.create(value.#anchor, value.#focus);
    } catch (_cause: unknown) {
      return undefined;
    }
  }

  get anchor(): TextPosition {
    return this.#anchor;
  }

  get focus(): TextPosition {
    return this.#focus;
  }

  get empty(): boolean {
    return comparePosition(this.#anchor, this.#focus) === 0;
  }

  get start(): TextPosition {
    return comparePosition(this.#anchor, this.#focus) <= 0
      ? this.#anchor
      : this.#focus;
  }

  get end(): TextPosition {
    return comparePosition(this.#anchor, this.#focus) <= 0
      ? this.#focus
      : this.#anchor;
  }

  contains(position: TextPosition): boolean {
    return (
      comparePosition(this.start, position) <= 0 &&
      comparePosition(position, this.end) < 0
    );
  }
}

const EMPTY_INTERACTION: NormalizedTextInteraction = Object.freeze({
  hyperlink: undefined,
  position: undefined,
});

function earlierDelimiter(
  value: string,
  start: number,
  end: number,
  delimiter: string,
): number {
  const candidate = value.indexOf(delimiter, start);
  return candidate >= 0 && candidate < end ? candidate : end;
}

function validHttpsTarget(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length <= HTTPS_PREFIX.length ||
    value.length > MAX_HYPERLINK_CODE_UNITS ||
    !value.startsWith(HTTPS_PREFIX)
  ) {
    return false;
  }
  for (const character of value) {
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      point < 0x21 ||
      point > 0x7e ||
      character === "\"" ||
      character === "'" ||
      character === "<" ||
      character === ">" ||
      character === "`"
    ) {
      return false;
    }
  }
  const authorityStart = HTTPS_PREFIX.length;
  let authorityEnd = value.length;
  authorityEnd = earlierDelimiter(value, authorityStart, authorityEnd, "/");
  authorityEnd = earlierDelimiter(value, authorityStart, authorityEnd, "?");
  authorityEnd = earlierDelimiter(value, authorityStart, authorityEnd, "#");
  const authority = value.slice(authorityStart, authorityEnd);
  if (authority.length === 0 || authority.includes("@")) {
    return false;
  }
  return true;
}

function normalizePosition(value: unknown): TextPosition | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  try {
    const candidate = value as Partial<TextPosition>;
    if (
      !Number.isSafeInteger(candidate.document) ||
      (candidate.document as number) < 0 ||
      !Number.isSafeInteger(candidate.offset) ||
      (candidate.offset as number) < 0
    ) {
      return undefined;
    }
    return Object.freeze({
      document: candidate.document as number,
      offset: candidate.offset as number,
    });
  } catch (_cause: unknown) {
    return undefined;
  }
}

/** Validates optional non-styling metadata without retaining rejected input. */
export function normalizeTextInteraction(
  value: unknown,
): NormalizedTextInteraction | undefined {
  if (value === undefined) {
    return EMPTY_INTERACTION;
  }
  try {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const candidate = value as Partial<TextInteraction>;
    const hyperlink = candidate.hyperlink;
    const position = candidate.position;
    if (hyperlink !== undefined && !validHttpsTarget(hyperlink)) {
      return undefined;
    }
    const normalizedPosition =
      position === undefined ? undefined : normalizePosition(position);
    if (position !== undefined && normalizedPosition === undefined) {
      return undefined;
    }
    return Object.freeze({
      hyperlink,
      position: normalizedPosition,
    });
  } catch (_cause: unknown) {
    return undefined;
  }
}

export function isHttpsTarget(value: unknown): value is string {
  return validHttpsTarget(value);
}
