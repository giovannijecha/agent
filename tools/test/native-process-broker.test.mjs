import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  encodeLaunch,
  nativeFixturePath,
  runNativeBroker,
  runNativeFixture,
} from "../lib/native-process-broker.mjs";

function terminalStatus(result) {
  return result.statuses.at(-1);
}

function assertCleanBroker(result) {
  assert.equal(result.close.signal, null);
  assert.equal(
    result.diagnostics.length,
    0,
    result.diagnostics.toString("utf8"),
  );
}

function processExists(processId) {
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function waitForProcessToExit(processId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processExists(processId)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("contained process remained alive after broker termination");
}

function assertLinuxRunsDirectoryEmpty() {
  const membership = readFileSync("/proc/self/cgroup", "utf8")
    .split("\n")
    .find((line) => line.startsWith("0::"));
  assert.notEqual(membership, undefined);
  const relative = membership.slice(3);
  assert.equal(relative.endsWith("/control"), true);
  const delegatedRoot = relative.slice(0, -"/control".length);
  const runsDirectory = path.posix.resolve(
    "/sys/fs/cgroup",
    "." + delegatedRoot,
    "runs",
  );
  const childCgroups = readdirSync(runsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  assert.deepEqual(childCgroups, []);
}

async function assertRecordedProcessesGone(result, processIds) {
  assert.equal(new Set(processIds).size, processIds.length);
  for (const processId of processIds) {
    assert.equal(Number.isSafeInteger(processId) && processId > 0, true);
  }
  if (process.platform === "win32") {
    for (const processId of processIds) {
      assert.equal(processExists(processId), false);
    }
    return;
  }
  const started = result.statuses.find((status) => status.kind === "started");
  assert.notEqual(started, undefined);
  await waitForProcessToExit(Number(started.processId));
  assertLinuxRunsDirectoryEmpty();
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
}

function waitForClose(child) {
  return new Promise((resolve) => child.once("close", resolve));
}

test("executes an exact program and preserves its exit status", async () => {
  const result = await runNativeFixture({ arguments: ["exit", "37"] });

  assertCleanBroker(result);
  assert.equal(result.close.code, 0);
  assert.deepEqual(
    result.statuses.map((status) => status.kind),
    ["started", "finished"],
  );
  assert.deepEqual(terminalStatus(result), {
    kind: "finished",
    outcome: 1,
    exitCodeKnown: true,
    exitCode: 37,
  });
});

test("preserves structured arguments without shell interpretation", async () => {
  const arguments_ = [
    "",
    "plain",
    "two words",
    "embedded\"quote",
    "trailing\\",
    "backslash\\\"quote",
    "unicodé-雪",
    "$(not-a-command)",
  ];
  const result = await runNativeFixture({
    arguments: ["arguments", ...arguments_],
  });

  assertCleanBroker(result);
  assert.equal(terminalStatus(result).outcome, 1);
  assert.deepEqual(
    result.stdout.subarray(0, -1).toString("utf8").split("\0"),
    arguments_,
  );
  assert.equal(terminalStatus(result).outcome, 1);
});

test("starts the target with an empty environment and exact directory", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-cwd-"));
  try {
    const environment = await runNativeFixture({ arguments: ["environment"] });
    const workingDirectory = await runNativeFixture({
      arguments: ["working-directory"],
      workingDirectory: directory,
    });

    assert.equal(environment.stdout.toString("utf8"), "0\n");
    assert.equal(terminalStatus(environment).outcome, 1);
    assert.equal(terminalStatus(workingDirectory).outcome, 1);
    assert.equal(
      path.resolve(workingDirectory.stdout.toString("utf8").trim()),
      path.resolve(directory),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("keeps target stderr separate from broker diagnostics", async () => {
  const result = await runNativeFixture({ arguments: ["stderr"] });

  assertCleanBroker(result);
  assert.equal(terminalStatus(result).outcome, 1);
  assert.equal(result.stdout.length, 0);
  assert.equal(result.stderr.toString("utf8"), "fixture stderr\n");
});

test("reports launch failure without retaining the rejected path", async () => {
  const missingProgram = path.join(
    path.dirname(nativeFixturePath),
    "missing-native-target",
  );
  const result = await runNativeBroker({
    launchFrame: encodeLaunch({
      timeoutMilliseconds: 5_000,
      processLimit: 1,
      program: missingProgram,
      workingDirectory: path.dirname(nativeFixturePath),
      arguments: [],
    }),
  });

  assertCleanBroker(result);
  assert.deepEqual(result.statuses, [{ kind: "failure", failure: 202 }]);
  assert.equal(result.diagnostics.includes(Buffer.from(missingProgram)), false);
});

test("cancels the complete contained process set", async () => {
  const result = await runNativeFixture({
    arguments: ["sleep"],
    cancelOnStarted: true,
  });

  assertCleanBroker(result);
  assert.deepEqual(terminalStatus(result), {
    kind: "finished",
    outcome: 2,
    exitCodeKnown: false,
    exitCode: 0,
  });
});

test("honors cancellation already queued at the launch boundary", async () => {
  const result = await runNativeFixture({
    arguments: ["sleep"],
    cancelImmediately: true,
  });

  assertCleanBroker(result);
  assert.deepEqual(
    result.statuses.map((status) => status.kind),
    ["started", "finished"],
  );
  assert.equal(terminalStatus(result).outcome, 2);
});

test("treats controller loss as cancellation", async () => {
  const result = await runNativeFixture({
    arguments: ["sleep"],
    closeControllerOnStarted: true,
  });

  assertCleanBroker(result);
  assert.equal(terminalStatus(result).outcome, 2);
});

test("times out and proves all descendants are gone", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-tree-"));
  const processFile = path.join(directory, "processes.txt");
  try {
    const result = await runNativeFixture({
      arguments: ["spawn-tree", processFile],
      timeoutMilliseconds: 1_000,
      processLimit: 4,
    });

    assertCleanBroker(result);
    assert.equal(terminalStatus(result).outcome, 3);
    assert.equal(existsSync(processFile), true);
    const processIds = readFileSync(processFile, "utf8")
      .trim()
      .split("\n")
      .map(Number);
    assert.equal(processIds.length, 2);
    await assertRecordedProcessesGone(result, processIds);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("contains a six-process descendant chain", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-chain-"));
  const processFile = path.join(directory, "processes.txt");
  try {
    const result = await runNativeFixture({
      arguments: ["spawn-chain", processFile, "5"],
      timeoutMilliseconds: 1_000,
      processLimit: 8,
    });

    assertCleanBroker(result);
    assert.equal(terminalStatus(result).outcome, 3);
    const processIds = readFileSync(processFile, "utf8")
      .trim()
      .split("\n")
      .map(Number);
    assert.equal(processIds.length, 6);
    await assertRecordedProcessesGone(result, processIds);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("enforces the configured process limit inside the container", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-limit-"));
  const processFile = path.join(directory, "processes.txt");
  try {
    const result = await runNativeFixture({
      arguments: ["spawn-chain", processFile, "5"],
      timeoutMilliseconds: 1_000,
      processLimit: 2,
    });

    assertCleanBroker(result);
    assert.equal(terminalStatus(result).outcome, 3);
    const processIds = readFileSync(processFile, "utf8")
      .trim()
      .split("\n")
      .map(Number);
    assert.equal(processIds.length, 2);
    await assertRecordedProcessesGone(result, processIds);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("contains detached descendants and inherited pipes after parent exit", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-detached-"));
  const processFile = path.join(directory, "processes.txt");
  try {
    const result = await runNativeFixture({
      arguments: ["spawn-chain-exit", processFile, "2"],
      timeoutMilliseconds: 5_000,
      processLimit: 8,
    });

    assertCleanBroker(result);
    assert.equal(terminalStatus(result).outcome, 3);
    const processIds = readFileSync(processFile, "utf8")
      .trim()
      .split("\n")
      .map(Number);
    assert.equal(processIds.length, 3);
    await assertRecordedProcessesGone(result, processIds);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("cancellation is authoritative after the target refuses cooperative signals", async () => {
  const result = await runNativeFixture({
    arguments: ["ignore-signals"],
    cancelOnOutput: true,
  });

  assertCleanBroker(result);
  assert.equal(result.stdout.toString("utf8"), "ready\n");
  assert.equal(terminalStatus(result).outcome, 2);
});

test("contains descendants created concurrently with cancellation", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "agent-broker-storm-"));
  const processFile = path.join(directory, "processes.txt");
  try {
    const result = await runNativeFixture({
      arguments: ["spawn-storm", processFile],
      cancelOnOutput: true,
      processLimit: 64,
    });

    assertCleanBroker(result);
    assert.equal(result.stdout.toString("utf8"), "ready\n");
    assert.equal(terminalStatus(result).outcome, 2);
    const processIds = readFileSync(processFile, "utf8")
      .trim()
      .split("\n")
      .map(Number);
    assert.equal(processIds.length > 0, true);
    await assertRecordedProcessesGone(result, processIds);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("abrupt broker loss still terminates the contained process set", async () => {
  const result = await runNativeFixture({
    arguments: ["sleep"],
    killBrokerOnStarted: true,
  });

  const started = result.statuses.find((status) => status.kind === "started");
  assert.notEqual(started, undefined);
  await waitForProcessToExit(Number(started.processId));
});

test("containment never terminates an unrelated process", async () => {
  const unrelated = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { shell: false, stdio: "ignore", windowsHide: true },
  );
  await waitForSpawn(unrelated);
  try {
    const result = await runNativeFixture({
      arguments: ["sleep"],
      cancelOnStarted: true,
    });

    assertCleanBroker(result);
    assert.equal(terminalStatus(result).outcome, 2);
    assert.equal(processExists(unrelated.pid), true);
  } finally {
    unrelated.kill();
    await waitForClose(unrelated);
  }
});

test("cancels and drains output after the owned output bound", async () => {
  const result = await runNativeFixture({
    arguments: ["flood", "10000000"],
    outputLimit: 4096,
  });

  assertCleanBroker(result);
  assert.equal(result.stdout.length, 4096);
  assert.equal(result.stdoutOverflowed, true);
  assert.equal(terminalStatus(result).outcome, 2);
});

test("rejects malformed controller frames without launching a target", async () => {
  const malformed = Buffer.alloc(12);
  malformed.write("NOPE", 0, 4, "ascii");
  const result = await runNativeBroker({ launchFrame: malformed });

  assertCleanBroker(result);
  assert.equal(result.close.code, 1);
  assert.deepEqual(result.statuses, [{ kind: "failure", failure: 100 }]);
});
