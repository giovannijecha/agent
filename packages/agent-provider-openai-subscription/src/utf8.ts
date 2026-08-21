import { err, ok, type Result } from "@agent/core";

export type Utf8Error = Readonly<{ kind: "encoding" }>;
const FAILURE = Object.freeze({ kind: "encoding" as const });

/** Strict incremental UTF-8 decoder retaining at most one partial scalar. */
export class Utf8Decoder {
  #pending: number[] = [];

  decode(bytes: Uint8Array): Result<string, Utf8Error> {
    return this.#decode(bytes, false);
  }

  finish(): Result<string, Utf8Error> {
    return this.#decode(new Uint8Array(), true);
  }

  #decode(bytes: Uint8Array, final: boolean): Result<string, Utf8Error> {
    let ownedBytes: Uint8Array;
    try {
      const byteLength = bytes.length;
      if (!Number.isSafeInteger(byteLength) || byteLength < 0) return err(FAILURE);
      ownedBytes = new Uint8Array(byteLength);
      ownedBytes.set(bytes);
    } catch (_cause: unknown) {
      return err(FAILURE);
    }
    const input = this.#pending;
    this.#pending = [];
    for (let byteIndex = 0; byteIndex < ownedBytes.length; byteIndex += 1) {
      const byte = ownedBytes.at(byteIndex);
      if (byte === undefined) return err(FAILURE);
      input.push(byte);
    }
    const output: string[] = [];
    let index = 0;
    while (index < input.length) {
      const first = input.at(index);
      if (first === undefined) return err(FAILURE);
      if (first <= 0x7f) {
        output.push(String.fromCodePoint(first));
        index += 1;
        continue;
      }
      let length: number;
      let minimum: number;
      let codePoint: number;
      if (first >= 0xc2 && first <= 0xdf) {
        length = 2;
        minimum = 0x80;
        codePoint = first & 0x1f;
      } else if (first >= 0xe0 && first <= 0xef) {
        length = 3;
        minimum = 0x800;
        codePoint = first & 0x0f;
      } else if (first >= 0xf0 && first <= 0xf4) {
        length = 4;
        minimum = 0x10000;
        codePoint = first & 0x07;
      } else {
        return err(FAILURE);
      }
      if (index + length > input.length) {
        if (final) return err(FAILURE);
        this.#pending = input.slice(index);
        return ok(output.join(""));
      }
      for (let offset = 1; offset < length; offset += 1) {
        const continuation = input.at(index + offset);
        if (continuation === undefined || continuation < 0x80 || continuation > 0xbf) {
          return err(FAILURE);
        }
        codePoint = (codePoint << 6) | (continuation & 0x3f);
      }
      if (codePoint < minimum || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return err(FAILURE);
      }
      output.push(String.fromCodePoint(codePoint));
      index += length;
    }
    return ok(output.join(""));
  }
}
