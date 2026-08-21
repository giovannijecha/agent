import assert from "node:assert/strict";
import test from "node:test";

import { SseDecoder } from "../dist/sse.js";
import { Utf8Decoder } from "../dist/utf8.js";

test("scans one fragmented SSE frame with bounded incremental work", () => {
  const decoder = new SseDecoder();
  assert.ok(decoder.push("data: ").ok);
  let valid = true;
  const started = Date.now();
  for (let index = 0; index < 150_000; index += 1) {
    const pushed = decoder.push("a");
    const next = decoder.next();
    if (!pushed.ok || !next.ok || next.value.kind !== "needMore") valid = false;
  }
  const elapsed = Date.now() - started;
  assert.equal(valid, true);
  assert.ok(elapsed < 750);
  assert.ok(decoder.push("\n\n").ok);
  const framed = decoder.next();
  assert.ok(framed.ok && framed.value.kind === "data");
  assert.equal(framed.value.event.data.length, 150_000);
});

test("releases partial SSE and UTF-8 input", () => {
  const sse = new SseDecoder();
  assert.ok(sse.push("data: private partial text").ok);
  sse.release();
  assert.ok(sse.push("data: fresh\n\n").ok);
  const framed = sse.next();
  assert.deepEqual(framed, {
    ok: true,
    value: {
      event: { data: "fresh", event: undefined },
      kind: "data",
    },
  });

  const utf8 = new Utf8Decoder();
  assert.deepEqual(utf8.decode(Uint8Array.of(0xe2)), { ok: true, value: "" });
  utf8.release();
  assert.deepEqual(utf8.decode(Uint8Array.of(0x66, 0x72, 0x65, 0x73, 0x68)), {
    ok: true,
    value: "fresh",
  });
  assert.deepEqual(utf8.finish(), { ok: true, value: "" });
});
