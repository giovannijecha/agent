import assert from "node:assert/strict";
import test from "node:test";

import { SseDecoder } from "../dist/sse.js";

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
