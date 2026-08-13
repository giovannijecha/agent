import { err, ok, type Result } from "@agent/core";

export type Utf8TextError = Readonly<{ kind: "invalidText" }>;

const INVALID_TEXT = Object.freeze({ kind: "invalidText" as const });

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
