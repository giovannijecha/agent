import { err, ok, type Result } from "@agent/core";
import { CLIPBOARD_CODE_UNIT_LIMIT } from "@agent/tui";

const HEADER_BYTES = 12;
const PROTOCOL_VERSION = 1;
const WRITE_KIND = 1;
const CLIPBOARD_MAGIC = Object.freeze([0x41, 0x47, 0x43, 0x42]);

export const PLATFORM_CLIPBOARD_LIMITS = Object.freeze({
  codeUnits: CLIPBOARD_CODE_UNIT_LIMIT,
  frameBytes: HEADER_BYTES + CLIPBOARD_CODE_UNIT_LIMIT * 2,
  payloadBytes: CLIPBOARD_CODE_UNIT_LIMIT * 2,
});

export type PlatformClipboardProtocolError = Readonly<{
  kind: "invalidText" | "limit";
}>;

function failure(
  kind: PlatformClipboardProtocolError["kind"],
): PlatformClipboardProtocolError {
  return Object.freeze({ kind });
}

function validScalarText(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit === 0) {
      return false;
    }
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Encodes one bounded scalar string for the owned Windows clipboard broker. */
export function encodePlatformClipboardWrite(
  value: unknown,
): Result<Uint8Array, PlatformClipboardProtocolError> {
  if (typeof value !== "string" || value.length === 0) {
    return err(failure("invalidText"));
  }
  if (value.length > PLATFORM_CLIPBOARD_LIMITS.codeUnits) {
    return err(failure("limit"));
  }
  if (!validScalarText(value)) {
    return err(failure("invalidText"));
  }
  const payloadBytes = value.length * 2;
  const frame = new Uint8Array(HEADER_BYTES + payloadBytes);
  frame.set(CLIPBOARD_MAGIC, 0);
  frame.set([PROTOCOL_VERSION, WRITE_KIND, 0, 0], 4);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(8, payloadBytes, true);
  for (let index = 0; index < value.length; index += 1) {
    view.setUint16(HEADER_BYTES + index * 2, value.charCodeAt(index), true);
  }
  return ok(frame);
}
