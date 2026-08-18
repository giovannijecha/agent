import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeProcessText,
  encodeProcessLaunch,
  encodeProcessText,
  PROCESS_BROKER_LIMITS,
  ProcessBrokerStatusDecoder,
  WINDOWS_POWERSHELL_BROKER_PROGRAM,
} from "../dist/process-broker-protocol.js";

function status(kind: number, payload: readonly number[]): Uint8Array {
  const frame = new Uint8Array(12 + payload.length);
  frame.set([0x41, 0x47, 0x50, 0x53, 2, kind, 0, 0], 0);
  new DataView(frame.buffer).setUint32(8, payload.length, true);
  frame.set(payload, 12);
  return frame;
}

test("encodes launch text and exact protocol fields", () => {
  const encoded = encodeProcessLaunch({
    arguments: ["fixture.js", "€ 😀"],
    environment: ["PATH=C:\\tools", "LANG=C.UTF-8"],
    processLimit: 16,
    program: "C:\\node.exe",
    timeoutMilliseconds: 120_000,
    workingDirectory: "C:\\workspace",
  });
  assert.ok(encoded.ok);
  assert.deepEqual([...encoded.value.slice(0, 8)], [65, 71, 80, 67, 2, 1, 0, 0]);
  assert.equal(new DataView(encoded.value.buffer).getUint32(12, true), 120_000);
  assert.equal(new DataView(encoded.value.buffer).getUint32(16, true), 16);
});

test("encodes the exact broker-owned Windows shell identity", () => {
  const encoded = encodeProcessLaunch({
    arguments: ["-NoLogo"],
    environment: [],
    processLimit: 16,
    program: WINDOWS_POWERSHELL_BROKER_PROGRAM,
    timeoutMilliseconds: 120_000,
    workingDirectory: "C:\\workspace",
  });
  assert.ok(encoded.ok);
});

test("rejects malformed and duplicate launch environment entries", () => {
  for (const environment of [
    ["BROKEN"],
    ["1INVALID=value"],
    ["AGENT_DUPLICATE=one", "AGENT_DUPLICATE=two"],
  ]) {
    assert.deepEqual(encodeProcessLaunch({
      arguments: [],
      environment,
      processLimit: 16,
      program: "C:\\node.exe",
      timeoutMilliseconds: 120_000,
      workingDirectory: "C:\\workspace",
    }), {
      error: { kind: "invalidRequest" },
      ok: false,
    });
  }
});

test("round trips owned UTF-8 and rejects unsafe text", () => {
  const encoded = encodeProcessText("alpha € 😀");
  assert.ok(encoded.ok);
  const decoded = decodeProcessText(encoded.value);
  assert.ok(decoded.ok);
  assert.equal(decoded.value, "alpha € 😀");
  assert.equal(encodeProcessText("a\0b").ok, false);
  assert.equal(encodeProcessText("\ud800").ok, false);
  assert.equal(decodeProcessText(Uint8Array.from([0xc0, 0x80])).ok, false);
});

test("enforces the broker text limit in encoded UTF-8 bytes", () => {
  const maximumBytes = PROCESS_BROKER_LIMITS.stringBytes;
  const maximumCjkScalars = Math.floor(maximumBytes / 3);

  assert.equal(encodeProcessText("x".repeat(maximumBytes)).ok, true);
  assert.equal(encodeProcessText("x".repeat(maximumBytes + 1)).ok, false);
  assert.equal(encodeProcessText("\u6f22".repeat(maximumCjkScalars)).ok, true);
  assert.equal(
    encodeProcessText("\u6f22".repeat(maximumCjkScalars + 1)).ok,
    false,
  );
});

test("decodes fragmented started and finished statuses", () => {
  const startedPayload = new Uint8Array(8);
  new DataView(startedPayload.buffer).setBigUint64(0, 42n, true);
  const finishedPayload = [1, 1, 0, 0, 7, 0, 0, 0];
  const bytes = new Uint8Array(40);
  bytes.set(status(1, [...startedPayload]), 0);
  bytes.set(status(2, finishedPayload), 20);
  const decoder = new ProcessBrokerStatusDecoder();
  const first = decoder.push(bytes.slice(0, 17));
  assert.ok(first.ok);
  assert.equal(first.value.length, 0);
  const second = decoder.push(bytes.slice(17));
  assert.ok(second.ok);
  assert.deepEqual(second.value, [
    { kind: "started", processId: 42n },
    { exitCode: 7, exitCodeKnown: true, kind: "finished", outcome: "exited" },
  ]);
  assert.ok(decoder.finish().ok);
});

test("rejects malformed status headers, payloads, and partial endings", () => {
  const malformed = status(2, [1, 2, 0, 0, 0, 0, 0, 0]);
  assert.equal(new ProcessBrokerStatusDecoder().push(malformed).ok, false);
  const wrongMagic = status(3, [100, 0, 0, 0]);
  wrongMagic.set([0], 0);
  assert.equal(new ProcessBrokerStatusDecoder().push(wrongMagic).ok, false);
  const partial = new ProcessBrokerStatusDecoder();
  assert.ok(partial.push(status(1, [0, 0, 0, 0, 0, 0, 0, 0]).slice(0, 5)).ok);
  assert.equal(partial.finish().ok, false);
});
