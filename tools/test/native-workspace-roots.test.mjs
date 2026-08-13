import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { projectRoot } from "../lib/project.mjs";

const suffix = process.platform === "win32" ? ".exe" : "";
const nativeResolver = path.join(
  projectRoot,
  "packages/agent-cli/.native-build",
  process.platform + "-" + process.arch,
  "agent-workspace-roots" + suffix,
);
const entryPoint = path.join(projectRoot, "packages/agent-cli/dist/main.js");

function hostileEnvironment() {
  const environment = {
    HOME: projectRoot,
    TEMP: projectRoot,
    TMP: projectRoot,
    TMPDIR: projectRoot,
    USERPROFILE: projectRoot,
  };
  if (process.platform === "win32") {
    assert.equal(typeof process.env.SystemRoot, "string");
    environment.SystemRoot = process.env.SystemRoot;
  }
  return environment;
}

function launchAt(candidate) {
  return spawnSync(process.execPath, [entryPoint], {
    cwd: candidate,
    encoding: "utf8",
    env: hostileEnvironment(),
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
}

function resolveNativeRoots() {
  const result = spawnSync(nativeResolver, [], {
    cwd: projectRoot,
    env: {},
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.equal(result.stderr.length, 0);
  const frame = result.stdout;
  assert.ok(frame instanceof Uint8Array);
  assert.ok(frame.length >= 20);
  assert.deepEqual([...frame.subarray(0, 8)], [65, 71, 87, 82, 1, 1, 0, 0]);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  assert.equal(view.getUint32(8, true), frame.length - 12);
  const homeLength = view.getUint32(12, true);
  const homeStart = 16;
  const temporaryLengthOffset = homeStart + homeLength;
  assert.ok(temporaryLengthOffset + 4 <= frame.length);
  const temporaryLength = view.getUint32(temporaryLengthOffset, true);
  const temporaryStart = temporaryLengthOffset + 4;
  assert.equal(temporaryStart + temporaryLength, frame.length);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return Object.freeze({
    homeDirectory: decoder.decode(
      frame.subarray(homeStart, temporaryLengthOffset),
    ),
    temporaryDirectory: decoder.decode(frame.subarray(temporaryStart)),
  });
}

test("native platform-root resolver rejects arguments without output", () => {
  const result = spawnSync(nativeResolver, ["unexpected"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {},
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("hostile inherited environment cannot relocate protected workspace roots", () => {
  const roots = resolveNativeRoots();

  for (const candidate of [
    roots.homeDirectory,
    roots.temporaryDirectory,
  ]) {
    const result = launchAt(candidate);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "agent rejected the workspace root\n");
  }
});
