import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { projectRoot } from "../lib/project.mjs";

const suffix = process.platform === "win32" ? ".exe" : "";
const fixture = path.join(
  projectRoot,
  "packages/agent-cli/.native-build",
  process.platform + "-" + process.arch,
  "agent-clipboard-fixture" + suffix,
);

function frame(text) {
  const result = new Uint8Array(12 + text.length * 2);
  result.set([65, 71, 67, 66, 1, 1, 0, 0]);
  const view = new DataView(
    result.buffer,
    result.byteOffset,
    result.byteLength,
  );
  view.setUint32(8, text.length * 2, true);
  for (let index = 0; index < text.length; index += 1) {
    view.setUint16(12 + index * 2, text.charCodeAt(index), true);
  }
  return result;
}

function launch(input, arguments_ = []) {
  return spawnSync(fixture, arguments_, {
    cwd: projectRoot,
    env: {},
    input,
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
}

function assertRejected(input, arguments_ = []) {
  const result = launch(input, arguments_);
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
}

test("native clipboard fixture accepts one exact scalar frame", () => {
  const result = launch(frame("agent copy\u{1f642}"));

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.length, 0);
});

test("native clipboard fixture rejects arguments and invalid frames", () => {
  assertRejected(frame("agent copy\u{1f642}"), ["unexpected"]);

  const badMagic = frame("agent copy\u{1f642}");
  badMagic[0] = 0;
  const badVersion = frame("agent copy\u{1f642}");
  badVersion[4] = 2;
  const badKind = frame("agent copy\u{1f642}");
  badKind[5] = 2;
  const badReserved = frame("agent copy\u{1f642}");
  badReserved[6] = 1;
  const empty = frame("");
  const odd = frame("x");
  new DataView(odd.buffer).setUint32(8, 1, true);
  const oversized = frame("x");
  new DataView(oversized.buffer).setUint32(8, 131_074, true);
  const truncated = frame("agent copy\u{1f642}").subarray(0, 15);
  const nul = frame("agent\u0000copy");
  const high = frame("agent\ud800");
  const low = frame("agent\udc00");
  const valid = frame("agent copy\u{1f642}");
  const trailing = new Uint8Array(valid.length + 1);
  trailing.set(valid);
  trailing[trailing.length - 1] = 1;

  for (const candidate of [
    badMagic,
    badVersion,
    badKind,
    badReserved,
    empty,
    odd,
    oversized,
    truncated,
    nul,
    high,
    low,
    trailing,
    frame("different scalar text"),
  ]) {
    assertRejected(candidate);
  }
});
