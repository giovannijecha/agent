import assert from "node:assert/strict";
import test from "node:test";

import {
  CREDENTIAL_BROKER_LIMITS,
  decodeCredentialBrokerResponse,
  encodeCredentialBrokerRequest,
} from "../dist/credential-broker-protocol.js";

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(
    offset,
    value,
    true,
  );
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function asciiText(value: Uint8Array): string {
  return [...value].map((byte) => String.fromCharCode(byte)).join("");
}

function response(kind: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const frame = new Uint8Array(12 + payload.length);
  frame.set([0x41, 0x47, 0x43, 0x53, 1, kind, 0, 0], 0);
  writeU32(frame, 8, payload.length);
  frame.set(payload, 12);
  return frame;
}

test("encodes the exact bounded private broker requests", () => {
  const snapshot = encodeCredentialBrokerRequest({
    environmentPresent: true,
    kind: "snapshot",
  });
  const open = encodeCredentialBrokerRequest({
    environmentPresent: false,
    kind: "openMutation",
  });
  const register = encodeCredentialBrokerRequest({
    key: "synthetic-key",
    kind: "register",
  });

  assert.ok(snapshot.ok);
  assert.deepEqual([...snapshot.value], [
    0x41, 0x47, 0x43, 0x52, 1, 1, 0, 0, 1, 0, 0, 0, 1,
  ]);
  assert.ok(open.ok);
  assert.deepEqual([...open.value], [
    0x41, 0x47, 0x43, 0x52, 1, 2, 0, 0, 1, 0, 0, 0, 0,
  ]);
  assert.ok(register.ok);
  assert.equal(register.value.at(5), 3);
  assert.equal(register.value.length, 12 + "synthetic-key".length);
  assert.equal(asciiText(register.value.slice(12)), "synthetic-key");

  for (const kind of ["remove", "cancel"] as const) {
    const encoded = encodeCredentialBrokerRequest({ kind });
    assert.ok(encoded.ok);
    assert.equal(encoded.value.length, 12);
    assert.equal(encoded.value.at(5), kind === "remove" ? 5 : 6);
  }
});

test("rejects invalid or oversized broker request values without normalization", () => {
  for (const key of ["", "two words", "line\nfeed", "nul\u0000byte"]) {
    assert.equal(
      encodeCredentialBrokerRequest({ key, kind: "replace" }).ok,
      false,
    );
  }
  assert.equal(
    encodeCredentialBrokerRequest({
      key: "a".repeat(CREDENTIAL_BROKER_LIMITS.keyCodeUnits + 1),
      kind: "register",
    }).ok,
    false,
  );
  assert.equal(
    encodeCredentialBrokerRequest({
      key: "\u0800".repeat(10_923),
      kind: "register",
    }).ok,
    false,
  );
});

test("decodes only exact response kinds and exposes payload only as a validated key", () => {
  for (const [kind, expected] of [
    [1, "absent"],
    [3, "present"],
    [4, "registered"],
    [5, "replaced"],
    [6, "removed"],
    [7, "cancelled"],
    [8, "busy"],
    [9, "dualAuthority"],
    [10, "invalidCredential"],
    [11, "invalidState"],
    [12, "store"],
  ] as const) {
    const decoded = decodeCredentialBrokerResponse(response(kind));
    assert.ok(decoded.ok);
    assert.deepEqual(decoded.value, { kind: expected });
    assert.equal(Object.isFrozen(decoded.value), true);
  }

  const decoded = decodeCredentialBrokerResponse(
    response(2, ascii("synthetic-key")),
  );
  assert.ok(decoded.ok);
  assert.deepEqual(decoded.value, {
    key: "synthetic-key",
    kind: "credential",
  });
});

test("rejects malformed, trailing, payload-bearing status, and invalid-key responses", () => {
  const valid = response(1);
  const wrongMagic = valid.slice();
  wrongMagic[0] = 0;
  const wrongVersion = valid.slice();
  wrongVersion[4] = 2;
  const wrongReserved = valid.slice();
  wrongReserved[6] = 1;
  const trailing = new Uint8Array(valid.length + 1);
  trailing.set(valid);
  const payloadStatus = response(1, Uint8Array.from([1]));
  const malformedUtf8 = response(2, Uint8Array.from([0xc0, 0x80]));
  const whitespaceKey = response(2, ascii("two words"));

  for (const frame of [
    new Uint8Array(),
    wrongMagic,
    wrongVersion,
    wrongReserved,
    trailing,
    payloadStatus,
    malformedUtf8,
    whitespaceKey,
  ]) {
    assert.equal(decodeCredentialBrokerResponse(frame).ok, false);
  }
});
