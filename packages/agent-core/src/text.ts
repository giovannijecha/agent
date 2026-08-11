/**
 * Measures one Unicode-scalar string as UTF-8 without relying on a platform
 * encoder. Invalid surrogate sequences, and optionally NUL, are rejected.
 */
export function scalarUtf8ByteLength(
  value: string,
  rejectNul: boolean = false,
): number | undefined {
  if (typeof value !== "string" || typeof rejectNul !== "boolean") {
    return undefined;
  }
  let bytes = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const first = value.charCodeAt(offset);
    if (rejectNul && first === 0) {
      return undefined;
    }
    if (first <= 0x7f) {
      bytes += 1;
      continue;
    }
    if (first <= 0x7ff) {
      bytes += 2;
      continue;
    }
    if (first >= 0xd800 && first <= 0xdbff) {
      if (offset + 1 >= value.length) {
        return undefined;
      }
      const second = value.charCodeAt(offset + 1);
      if (second < 0xdc00 || second > 0xdfff) {
        return undefined;
      }
      bytes += 4;
      offset += 1;
      continue;
    }
    if (first >= 0xdc00 && first <= 0xdfff) {
      return undefined;
    }
    bytes += 3;
  }
  return bytes;
}
