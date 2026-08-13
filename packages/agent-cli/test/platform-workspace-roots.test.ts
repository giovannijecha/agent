import assert from "node:assert/strict";
import path from "node:path";
import { arch, platform } from "node:process";
import test from "node:test";

import {
  decodePlatformWorkspaceRoots,
  PLATFORM_WORKSPACE_ROOTS_LIMITS,
} from "../dist/platform-workspace-roots-protocol.js";
import { resolvePlatformWorkspaceRoots } from "../dist/platform-workspace-roots.js";

function ascii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    assert.ok(code <= 0x7f);
    bytes[index] = code;
  }
  return bytes;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value,
    true,
  );
}

function rootsFrame(home: Uint8Array, temporary: Uint8Array): Uint8Array {
  const payloadLength = 8 + home.length + temporary.length;
  const frame = new Uint8Array(12 + payloadLength);
  frame.set([0x41, 0x47, 0x57, 0x52, 1, 1, 0, 0], 0);
  writeU32(frame, 8, payloadLength);
  writeU32(frame, 12, home.length);
  frame.set(home, 16);
  const temporaryLengthOffset = 16 + home.length;
  writeU32(frame, temporaryLengthOffset, temporary.length);
  frame.set(temporary, temporaryLengthOffset + 4);
  return frame;
}

test("decodes one exact immutable platform-roots frame", () => {
  const home = path.resolve("platform-home");
  const temporary = path.resolve("platform-temporary");

  const decoded = decodePlatformWorkspaceRoots(
    rootsFrame(ascii(home), ascii(temporary)),
  );

  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, {
    homeDirectory: home,
    temporaryDirectory: temporary,
  });
  assert.equal(Object.isFrozen(decoded.value), true);
});

test("rejects malformed, trailing, relative, duplicate, and invalid UTF-8 roots", () => {
  const home = ascii(path.resolve("platform-home"));
  const temporary = ascii(path.resolve("platform-temporary"));
  const valid = rootsFrame(home, temporary);

  const wrongMagic = valid.slice();
  wrongMagic[0] = 0;
  assert.equal(decodePlatformWorkspaceRoots(wrongMagic).ok, false);
  for (const offset of [4, 5, 6, 7]) {
    const wrongHeader = valid.slice();
    wrongHeader[offset] = 2;
    assert.equal(decodePlatformWorkspaceRoots(wrongHeader).ok, false);
  }
  assert.equal(
    decodePlatformWorkspaceRoots(valid.slice(0, valid.length - 1)).ok,
    false,
  );
  const trailing = new Uint8Array(valid.length + 1);
  trailing.set(valid);
  assert.equal(decodePlatformWorkspaceRoots(trailing).ok, false);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(ascii("relative"), temporary)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(home, home)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(
      rootsFrame(Uint8Array.from([0xc0, 0x80]), temporary),
    ).ok,
    false,
  );
  const nulBearing = new Uint8Array(home.length + 1);
  nulBearing.set(home);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(nulBearing, temporary)).ok,
    false,
  );
});

test("enforces exact path and frame byte limits", () => {
  const temporary = ascii(path.resolve("platform-temporary"));
  const oversizedPath = new Uint8Array(
    PLATFORM_WORKSPACE_ROOTS_LIMITS.pathUtf8Bytes + 1,
  );
  oversizedPath.fill(0x61);
  assert.equal(
    decodePlatformWorkspaceRoots(rootsFrame(oversizedPath, temporary)).ok,
    false,
  );
  assert.equal(
    decodePlatformWorkspaceRoots(
      new Uint8Array(PLATFORM_WORKSPACE_ROOTS_LIMITS.frameBytes + 1),
    ).ok,
    false,
  );
});

test("resolves current roots and fails closed on unsupported targets", async () => {
  const resolved = await resolvePlatformWorkspaceRoots(platform, arch);

  assert.ok(resolved.ok);
  assert.equal(path.isAbsolute(resolved.value.homeDirectory), true);
  assert.equal(path.isAbsolute(resolved.value.temporaryDirectory), true);
  assert.equal(Object.isFrozen(resolved.value), true);

  const unsupported = await resolvePlatformWorkspaceRoots("unsupported", "x64");
  assert.equal(unsupported.ok, false);
  if (!unsupported.ok) {
    assert.equal(unsupported.error.kind, "unsupportedPlatform");
    assert.equal(Object.isFrozen(unsupported.error), true);
  }
});
