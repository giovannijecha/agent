import assert from "node:assert/strict";
import test from "node:test";

import {
  encodePlatformClipboardWrite,
  PLATFORM_CLIPBOARD_LIMITS,
} from "../dist/platform-clipboard-protocol.js";
import { PlatformClipboard } from "../dist/platform-clipboard.js";

test("encodes one exact bounded UTF-16LE clipboard frame", () => {
  const encoded = encodePlatformClipboardWrite("A\u{1f642}");
  assert.ok(encoded.ok);

  assert.deepEqual([...encoded.value], [
    65, 71, 67, 66,
    1, 1, 0, 0,
    6, 0, 0, 0,
    65, 0, 61, 216, 66, 222,
  ]);
});

test("rejects empty, malformed, and oversized clipboard text", () => {
  const empty = encodePlatformClipboardWrite("");
  const nul = encodePlatformClipboardWrite("agent\u0000copy");
  const high = encodePlatformClipboardWrite("agent\ud800");
  const low = encodePlatformClipboardWrite("agent\udc00");
  const oversized = encodePlatformClipboardWrite(
    "x".repeat(PLATFORM_CLIPBOARD_LIMITS.codeUnits + 1),
  );

  assert.equal(empty.ok, false);
  assert.equal(nul.ok, false);
  assert.equal(high.ok, false);
  assert.equal(low.ok, false);
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.error.kind, "limit");
});

test("reports unsupported platforms without launching a clipboard process", async () => {
  const copied = await new PlatformClipboard("linux", "x64").copy("agent");

  assert.ok(copied.ok);
  assert.equal(copied.value, "unsupported");
});
