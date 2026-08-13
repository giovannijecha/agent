import { hasLoneSurrogate } from "./cell-width.js";
import { err, ok, type Result } from "./result.js";

export const CLIPBOARD_CODE_UNIT_LIMIT = 65_536;
const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export type ClipboardErrorKind = "invalidPayload" | "payloadTooLong";

/** Content-free clipboard payload validation failure. */
export class ClipboardError {
  readonly #kind: ClipboardErrorKind;

  constructor(kind: ClipboardErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ClipboardErrorKind {
    return this.#kind;
  }
}

function utf8(text: string): readonly number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point === undefined) {
      continue;
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
  return Object.freeze(bytes);
}

function base64(bytes: readonly number[]): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes.at(index) ?? 0;
    const second = bytes.at(index + 1);
    const third = bytes.at(index + 2);
    const value = first << 16 | (second ?? 0) << 8 | (third ?? 0);
    encoded += BASE64.at((value >> 18) & 0x3f) ?? "";
    encoded += BASE64.at((value >> 12) & 0x3f) ?? "";
    encoded += second === undefined ? "=" : BASE64.at((value >> 6) & 0x3f) ?? "";
    encoded += third === undefined ? "=" : BASE64.at(value & 0x3f) ?? "";
  }
  return encoded;
}

/** Immutable bounded personal text encoded only at the renderer boundary. */
export class ClipboardPayload {
  readonly #sequence: string;

  private constructor(sequence: string) {
    this.#sequence = sequence;
    Object.freeze(this);
  }

  static create(text: unknown): Result<ClipboardPayload, ClipboardError> {
    if (
      typeof text !== "string" ||
      text.length === 0 ||
      hasLoneSurrogate(text)
    ) {
      return err(new ClipboardError("invalidPayload"));
    }
    if (text.length > CLIPBOARD_CODE_UNIT_LIMIT) {
      return err(new ClipboardError("payloadTooLong"));
    }
    return ok(
      new ClipboardPayload(
        "\u001B]52;c;" + base64(utf8(text)) + "\u001B\\",
      ),
    );
  }

  /** Reads a genuine payload without trusting a public accessor or proxy. */
  static sequence(value: ClipboardPayload): string {
    return value.#sequence;
  }
}
