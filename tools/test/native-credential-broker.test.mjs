import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { projectRoot } from "../lib/project.mjs";

const suffix = process.platform === "win32" ? ".exe" : "";
const broker = path.join(
  projectRoot,
  "packages/agent-cli/.native-build",
  process.platform + "-" + process.arch,
  "agent-credential-fixture" + suffix,
);

function request(kind, payload = new Uint8Array()) {
  const frame = new Uint8Array(12 + payload.length);
  frame.set([0x41, 0x47, 0x43, 0x52, 1, kind, 0, 0], 0);
  new DataView(frame.buffer).setUint32(8, payload.length, true);
  frame.set(payload, 12);
  return frame;
}

function ascii(value) {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}

function frames(...values) {
  const length = values.reduce((total, value) => total + value.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function responses(bytes) {
  const parsed = [];
  for (let offset = 0; offset < bytes.length;) {
    assert.ok(offset + 12 <= bytes.length);
    assert.deepEqual([...bytes.subarray(offset, offset + 5)], [
      0x41, 0x47, 0x43, 0x53, 1,
    ]);
    assert.equal(bytes.at(offset + 6), 0);
    assert.equal(bytes.at(offset + 7), 0);
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      bytes.byteLength - offset,
    ).getUint32(8, true);
    assert.ok(offset + 12 + length <= bytes.length);
    parsed.push(Object.freeze({
      kind: bytes.at(offset + 5),
      payload: bytes.subarray(offset + 12, offset + 12 + length),
    }));
    offset += 12 + length;
  }
  return parsed;
}

function launch(root, input, arguments_ = []) {
  return spawnSync(broker, arguments_, {
    cwd: root,
    env: {},
    input,
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
}

function temporaryRoot() {
  return mkdtempSync(path.join(tmpdir(), "agent-credential-fixture-"));
}

test("native Windows broker admits controlled alternate-owner profile lineage", {
  skip: process.platform !== "win32",
}, () => {
  const root = temporaryRoot();
  try {
    const snapshot = launch(root, request(1, Uint8Array.from([0])));
    assert.equal(snapshot.error, undefined);
    assert.equal(snapshot.status, 0);
    assert.equal(snapshot.stderr.length, 0);
    assert.deepEqual(responses(snapshot.stdout).map((entry) => entry.kind), [1]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("native credential broker admits the existing shared state root", () => {
  const root = temporaryRoot();
  try {
    const sessions = path.join(root, ".agent", "sessions");
    mkdirSync(sessions, { mode: 0o700, recursive: true });

    const snapshot = launch(root, request(1, Uint8Array.from([0])));
    assert.equal(snapshot.error, undefined);
    assert.equal(snapshot.status, 0);
    assert.equal(snapshot.stderr.length, 0);
    assert.deepEqual(responses(snapshot.stdout).map((entry) => entry.kind), [1]);
    assert.equal(existsSync(sessions), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("native credential broker rejects arguments and malformed requests silently", () => {
  const root = temporaryRoot();
  try {
    for (const [input, arguments_] of [
      [undefined, ["unexpected"]],
      [undefined, []],
      [Uint8Array.from([0]), []],
      [request(1, Uint8Array.from([2])), []],
      [request(3, ascii("synthetic-key")), []],
    ]) {
      const result = launch(root, input, arguments_);
      assert.equal(result.error, undefined);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.length, 0);
      assert.equal(result.stderr.length, 0);
    }
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("native credential lifecycle registers, snapshots, replaces, and removes exactly", () => {
  const root = temporaryRoot();
  try {
    const registered = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-key-one")),
    ));
    assert.equal(registered.error, undefined);
    assert.equal(registered.status, 0);
    assert.equal(registered.stderr.length, 0);
    assert.deepEqual(responses(registered.stdout).map((entry) => entry.kind), [1, 4]);

    const recordPath = path.join(
      root,
      ".agent",
      "credentials",
      "ollama-cloud.api-key",
    );
    assert.equal(
      readFileSync(recordPath, "utf8"),
      "agent/ollama-cloud/api-key/v1\n" +
        "revision=1\n" +
        "length=17\n\n" +
        "synthetic-key-one",
    );

    const snapshot = launch(root, request(1, Uint8Array.from([0])));
    assert.equal(snapshot.status, 0);
    const snap = responses(snapshot.stdout);
    assert.equal(snap.length, 1);
    assert.equal(snap.at(0)?.kind, 2);
    assert.deepEqual(
      [...(snap.at(0)?.payload ?? [])],
      [...ascii("synthetic-key-one")],
    );

    const dual = launch(root, request(1, Uint8Array.from([1])));
    assert.equal(dual.status, 0);
    assert.deepEqual(responses(dual.stdout).map((entry) => entry.kind), [9]);

    const replaced = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(4, ascii("synthetic-key-two")),
    ));
    assert.equal(replaced.status, 0);
    assert.deepEqual(responses(replaced.stdout).map((entry) => entry.kind), [3, 5]);
    assert.equal(
      readFileSync(recordPath, "utf8"),
      "agent/ollama-cloud/api-key/v1\n" +
        "revision=2\n" +
        "length=17\n\n" +
        "synthetic-key-two",
    );

    const removed = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(5),
    ));
    assert.equal(removed.status, 0);
    assert.deepEqual(responses(removed.stdout).map((entry) => entry.kind), [3, 6]);
    const absent = launch(root, request(1, Uint8Array.from([0])));
    assert.deepEqual(responses(absent.stdout).map((entry) => entry.kind), [1]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("shared snapshot admission rejects an overlapping mutation without waiting", async () => {
  const root = temporaryRoot();
  try {
    const child = spawn(broker, [], {
      cwd: root,
      env: {},
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const first = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.once("data", resolve);
    });
    child.stdin.write(request(1, Uint8Array.from([0])));
    const opened = await first;
    assert.deepEqual(responses(opened).map((entry) => entry.kind), [1]);

    const mutation = launch(root, request(2, Uint8Array.from([0])));
    assert.equal(mutation.status, 0);
    assert.deepEqual(responses(mutation.stdout).map((entry) => entry.kind), [8]);

    child.stdin.end();
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(child.exitCode, 0);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("safe envelopes classify dual authority before malformed payload bytes", () => {
  const root = temporaryRoot();
  try {
    const registered = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-key")),
    ));
    assert.equal(registered.status, 0);
    const record = path.join(
      root,
      ".agent",
      "credentials",
      "ollama-cloud.api-key",
    );
    writeFileSync(record, frames(
      ascii(
        "agent/ollama-cloud/api-key/v1\nrevision=1\nlength=1\n\n",
      ),
      Uint8Array.from([0xff]),
    ));

    const dual = launch(root, request(1, Uint8Array.from([1])));
    assert.equal(dual.status, 0);
    assert.deepEqual(responses(dual.stdout).map((entry) => entry.kind), [9]);
    const rejected = launch(root, request(1, Uint8Array.from([0])));
    assert.equal(rejected.status, 0);
    assert.deepEqual(responses(rejected.stdout).map((entry) => entry.kind), [12]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("linked records and unknown inventory entries fail closed", () => {
  const root = temporaryRoot();
  try {
    const registered = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-key")),
    ));
    assert.equal(registered.status, 0);
    const directory = path.join(root, ".agent", "credentials");
    const record = path.join(directory, "ollama-cloud.api-key");
    const alias = path.join(root, "linked-record");
    linkSync(record, alias);
    const linked = launch(root, request(1, Uint8Array.from([0])));
    assert.deepEqual(responses(linked.stdout).map((entry) => entry.kind), [12]);
    const linkedDual = launch(root, request(1, Uint8Array.from([1])));
    assert.deepEqual(
      responses(linkedDual.stdout).map((entry) => entry.kind),
      [12],
    );
    rmSync(alias, { force: true });

    writeFileSync(path.join(directory, "unexpected"), "", { encoding: "utf8" });
    const unknown = launch(root, request(1, Uint8Array.from([0])));
    assert.deepEqual(responses(unknown.stdout).map((entry) => entry.kind), [12]);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("exclusive admission recovers only pending and retired interruption states", () => {
  const root = temporaryRoot();
  try {
    const stageMarker = path.join(root, ".fixture-stop-after-stage");
    writeFileSync(stageMarker, "", { encoding: "utf8" });
    const interruptedRegister = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-first")),
    ));
    assert.equal(interruptedRegister.status, 0);
    assert.deepEqual(
      responses(interruptedRegister.stdout).map((entry) => entry.kind),
      [1, 12],
    );
    rmSync(stageMarker, { force: true });

    const recoveredRegister = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-second")),
    ));
    assert.equal(recoveredRegister.status, 0);
    assert.deepEqual(
      responses(recoveredRegister.stdout).map((entry) => entry.kind),
      [1, 4],
    );

    const retireMarker = path.join(root, ".fixture-stop-after-retire");
    writeFileSync(retireMarker, "", { encoding: "utf8" });
    const interruptedRemove = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(5),
    ));
    assert.equal(interruptedRemove.status, 0);
    assert.deepEqual(
      responses(interruptedRemove.stdout).map((entry) => entry.kind),
      [3, 12],
    );
    rmSync(retireMarker, { force: true });

    const recoveredAbsence = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(6),
    ));
    assert.equal(recoveredAbsence.status, 0);
    assert.deepEqual(
      responses(recoveredAbsence.stdout).map((entry) => entry.kind),
      [1, 7],
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("replacement recovery retains the committed credential", () => {
  const root = temporaryRoot();
  try {
    const registered = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(3, ascii("synthetic-first")),
    ));
    assert.equal(registered.status, 0);
    assert.deepEqual(
      responses(registered.stdout).map((entry) => entry.kind),
      [1, 4],
    );

    const stageMarker = path.join(root, ".fixture-stop-after-stage");
    writeFileSync(stageMarker, "", { encoding: "utf8" });
    const interruptedReplace = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(4, ascii("synthetic-second")),
    ));
    assert.equal(interruptedReplace.status, 0);
    assert.deepEqual(
      responses(interruptedReplace.stdout).map((entry) => entry.kind),
      [3, 12],
    );
    rmSync(stageMarker, { force: true });

    const recoveredReplace = launch(root, frames(
      request(2, Uint8Array.from([0])),
      request(4, ascii("synthetic-third")),
    ));
    assert.equal(recoveredReplace.status, 0);
    assert.deepEqual(
      responses(recoveredReplace.stdout).map((entry) => entry.kind),
      [3, 5],
    );
    assert.match(
      readFileSync(path.join(
        root,
        ".agent",
        "credentials",
        "ollama-cloud.api-key",
      ), "utf8"),
      /revision=2\nlength=15\n\nsynthetic-third$/u,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
