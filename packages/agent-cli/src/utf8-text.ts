import { err, ok, type Result } from "@agent/core";

export type Utf8TextError = Readonly<{ kind: "invalidText" }>;

const INVALID_TEXT = Object.freeze({ kind: "invalidText" as const });

/** Strictly encodes Unicode-scalar text without a platform text encoder. */
export function encodeUtf8Text(
  value: unknown,
  rejectNul: boolean = false,
): Result<Uint8Array, Utf8TextError> {
  if (typeof value !== "string" || typeof rejectNul !== "boolean") {
    return err(INVALID_TEXT);
  }
  const bytes: number[] = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      (rejectNul && point === 0) ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      return err(INVALID_TEXT);
    }
    if (point <= 0x7f) {
      bytes.push(point);
    } else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(
        0xe0 | (point >> 12),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return ok(Uint8Array.from(bytes));
}

function continuation(byte: number | undefined): byte is number {
  return byte !== undefined && (byte & 0xc0) === 0x80;
}

/** Strictly decodes Unicode-scalar UTF-8 without a platform text decoder. */
export function decodeUtf8Text(
  value: unknown,
  rejectNul: boolean = false,
): Result<string, Utf8TextError> {
  if (!(value instanceof Uint8Array) || typeof rejectNul !== "boolean") {
    return err(INVALID_TEXT);
  }
  const scalars: string[] = [];
  for (let offset = 0; offset < value.length; ) {
    const first = value.at(offset);
    if (first === undefined || (rejectNul && first === 0)) {
      return err(INVALID_TEXT);
    }
    let point: number;
    let width: number;
    if (first <= 0x7f) {
      point = first;
      width = 1;
    } else if (first >= 0xc2 && first <= 0xdf) {
      const second = value.at(offset + 1);
      if (!continuation(second)) {
        return err(INVALID_TEXT);
      }
      point = ((first & 0x1f) << 6) | (second & 0x3f);
      width = 2;
    } else if (first >= 0xe0 && first <= 0xef) {
      const second = value.at(offset + 1);
      const third = value.at(offset + 2);
      if (
        !continuation(second) ||
        !continuation(third) ||
        (first === 0xe0 && second < 0xa0) ||
        (first === 0xed && second >= 0xa0)
      ) {
        return err(INVALID_TEXT);
      }
      point =
        ((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f);
      width = 3;
    } else if (first >= 0xf0 && first <= 0xf4) {
      const second = value.at(offset + 1);
      const third = value.at(offset + 2);
      const fourth = value.at(offset + 3);
      if (
        !continuation(second) ||
        !continuation(third) ||
        !continuation(fourth) ||
        (first === 0xf0 && second < 0x90) ||
        (first === 0xf4 && second >= 0x90)
      ) {
        return err(INVALID_TEXT);
      }
      point =
        ((first & 0x07) << 18) |
        ((second & 0x3f) << 12) |
        ((third & 0x3f) << 6) |
        (fourth & 0x3f);
      width = 4;
    } else {
      return err(INVALID_TEXT);
    }
    scalars.push(String.fromCodePoint(point));
    offset += width;
  }
  return ok(scalars.join(""));
}
