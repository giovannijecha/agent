import assert from "node:assert/strict";
import test from "node:test";

import { ClipboardPayload } from "@agent/tui";

test("encodes bounded scalar text as owned UTF-8 Base64 OSC 52", () => {
  const ascii = ClipboardPayload.create("agent\ncopy");
  const unicode = ClipboardPayload.create("è🙂");
  assert.ok(ascii.ok);
  assert.ok(unicode.ok);

  assert.equal(
    ClipboardPayload.sequence(ascii.value),
    "\u001B]52;c;YWdlbnQKY29weQ==\u001B\\",
  );
  assert.equal(
    ClipboardPayload.sequence(unicode.value),
    "\u001B]52;c;w6jwn5mC\u001B\\",
  );
});

test("rejects oversized and malformed clipboard content without retaining it", () => {
  const oversized = ClipboardPayload.create("x".repeat(65_537));
  const surrogate = ClipboardPayload.create("private\uD800");
  const empty = ClipboardPayload.create("");

  assert.equal(oversized.ok, false);
  assert.equal(surrogate.ok, false);
  assert.equal(empty.ok, false);
  if (!oversized.ok) assert.equal(oversized.error.kind, "payloadTooLong");
  if (!surrogate.ok) assert.equal(surrogate.error.kind, "invalidPayload");
  if (!empty.ok) assert.equal(empty.error.kind, "invalidPayload");
});

test("rejects proxied payload access at the renderer boundary", () => {
  const payload = ClipboardPayload.create("safe");
  assert.ok(payload.ok);

  assert.throws(() => ClipboardPayload.sequence(new Proxy(payload.value, {})));
});
