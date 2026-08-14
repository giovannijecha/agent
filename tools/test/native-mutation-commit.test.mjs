import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { projectRoot } from "../lib/project.mjs";

const suffix = process.platform === "win32" ? ".exe" : "";
const broker = path.join(
  projectRoot,
  "packages/agent-cli/.native-build",
  process.platform + "-" + process.arch,
  "agent-mutation-commit" + suffix,
);

function launch(input, arguments_ = []) {
  return spawnSync(broker, arguments_, {
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

function header() {
  return Uint8Array.from([
    0x41, 0x47, 0x4d, 0x43,
    1, 1, 0, 0,
    32, 0, 0, 0,
  ]);
}

test("native mutation broker rejects arguments and malformed frames", () => {
  assertRejected(undefined, ["unexpected"]);
  assertRejected(undefined);
  assertRejected(Uint8Array.from([0]));

  const badMagic = header();
  badMagic[0] = 0;
  const badVersion = header();
  badVersion[4] = 2;
  const badKind = header();
  badKind[5] = 3;
  const badReserved = header();
  badReserved[6] = 1;
  const oversized = header();
  new DataView(oversized.buffer).setUint32(8, 2_129_953, true);
  const truncated = new Uint8Array(44);
  truncated.set(header());
  const trailing = new Uint8Array(45);
  trailing.set(header());
  trailing[44] = 1;

  for (const frame of [
    badMagic,
    badVersion,
    badKind,
    badReserved,
    oversized,
    truncated,
    trailing,
  ]) {
    assertRejected(frame);
  }
});
