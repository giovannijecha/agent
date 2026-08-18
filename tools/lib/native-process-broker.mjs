import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { projectRoot } from "./project.mjs";

const protocolVersion = 2;
const maximumFrameBytes = 65_536;
const defaultOutputLimit = 65_536;
const harnessDeadlineMilliseconds = 20_000;

const commandKinds = Object.freeze({ launch: 1, cancel: 2 });
const statusKinds = Object.freeze({ started: 1, finished: 2, failure: 3 });

function platformBinary(name) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(
    projectRoot,
    "packages/agent-cli/.native-build",
    process.platform + "-x64",
    name + suffix,
  );
}

export const nativeBrokerPath = platformBinary("agent-process-broker");
export const nativeFixturePath = platformBinary("agent-process-fixture");

function frame(magic, kind, payload) {
  const header = Buffer.alloc(12);
  header.write(magic, 0, 4, "ascii");
  header.writeUInt8(protocolVersion, 4);
  header.writeUInt8(kind, 5);
  header.writeUInt16LE(0, 6);
  header.writeUInt32LE(payload.length, 8);
  return Buffer.concat([header, payload]);
}

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([length, bytes]);
}

export function encodeLaunch({
  timeoutMilliseconds,
  processLimit,
  program,
  workingDirectory,
  environment = [],
  arguments: arguments_,
}) {
  const fixed = Buffer.alloc(8);
  fixed.writeUInt32LE(timeoutMilliseconds, 0);
  fixed.writeUInt32LE(processLimit, 4);
  const argumentCount = Buffer.alloc(4);
  argumentCount.writeUInt32LE(arguments_.length, 0);
  const environmentCount = Buffer.alloc(4);
  environmentCount.writeUInt32LE(environment.length, 0);
  const payload = Buffer.concat([
    fixed,
    encodeString(program),
    encodeString(workingDirectory),
    environmentCount,
    ...environment.map(encodeString),
    argumentCount,
    ...arguments_.map(encodeString),
  ]);
  if (payload.length > maximumFrameBytes) {
    throw new Error("native broker launch frame exceeds its owned bound");
  }
  return frame("AGPC", commandKinds.launch, payload);
}

export const cancelFrame = frame("AGPC", commandKinds.cancel, Buffer.alloc(0));

function parseStatusFrame(kind, payload) {
  if (kind === statusKinds.started && payload.length === 8) {
    return Object.freeze({ kind: "started", processId: payload.readBigUInt64LE(0) });
  }
  if (
    kind === statusKinds.finished &&
    payload.length === 8 &&
    payload.readUInt16LE(2) === 0
  ) {
    return Object.freeze({
      kind: "finished",
      outcome: payload.readUInt8(0),
      exitCodeKnown: payload.readUInt8(1) === 1,
      exitCode: payload.readInt32LE(4),
    });
  }
  if (kind === statusKinds.failure && payload.length === 4) {
    return Object.freeze({ kind: "failure", failure: payload.readUInt32LE(0) });
  }
  throw new Error("native broker returned a malformed status frame");
}

function appendBounded(state, chunk, limit) {
  const remaining = Math.max(0, limit - state.length);
  if (remaining > 0) {
    state.chunks.push(chunk.subarray(0, remaining));
    state.length += Math.min(chunk.length, remaining);
  }
  if (chunk.length > remaining) {
    state.overflowed = true;
  }
}

export async function runNativeBroker({
  launchFrame,
  cancelOnStarted = false,
  closeControllerOnStarted = false,
  killBrokerOnOutput = false,
  cancelOnOutput = false,
  cancelImmediately = false,
  outputLimit = defaultOutputLimit,
}) {
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 1) {
    throw new Error("native broker output limit is invalid");
  }
  const child = spawn(nativeBrokerPath, [], {
    cwd: projectRoot,
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const statuses = [];
  const targetOutput = { chunks: [], length: 0, overflowed: false };
  const targetError = { chunks: [], length: 0, overflowed: false };
  const diagnostics = { chunks: [], length: 0, overflowed: false };
  let statusBuffer = Buffer.alloc(0);
  let parseFailure;
  let cancelSent = false;

  const requestCancellation = () => {
    if (!cancelSent && !child.stdin.destroyed) {
      cancelSent = true;
      child.stdin.write(cancelFrame);
    }
  };
  const parseStatuses = (chunk) => {
    statusBuffer = Buffer.concat([statusBuffer, chunk]);
    if (statusBuffer.length > maximumFrameBytes + 12) {
      throw new Error("native broker status stream exceeded its owned bound");
    }
    while (statusBuffer.length >= 12) {
      if (
        statusBuffer.toString("ascii", 0, 4) !== "AGPS" ||
        statusBuffer.readUInt8(4) !== protocolVersion ||
        statusBuffer.readUInt16LE(6) !== 0
      ) {
        throw new Error("native broker returned an invalid status header");
      }
      const payloadLength = statusBuffer.readUInt32LE(8);
      if (payloadLength > maximumFrameBytes) {
        throw new Error("native broker status payload exceeded its owned bound");
      }
      const frameLength = 12 + payloadLength;
      if (statusBuffer.length < frameLength) {
        return;
      }
      const status = parseStatusFrame(
        statusBuffer.readUInt8(5),
        statusBuffer.subarray(12, frameLength),
      );
      statuses.push(status);
      statusBuffer = statusBuffer.subarray(frameLength);
      if (status.kind === "started") {
        if (cancelOnStarted) {
          requestCancellation();
        }
        if (closeControllerOnStarted) {
          child.stdin.destroy();
        }
      }
    }
  };

  child.stdout.on("data", (chunk) => {
    try {
      parseStatuses(chunk);
    } catch (error) {
      parseFailure = error;
      child.kill();
    }
  });
  child.stderr.on("data", (chunk) => appendBounded(diagnostics, chunk, 4096));
  child.stdio[3].on("data", (chunk) => {
    appendBounded(targetOutput, chunk, outputLimit);
    if (killBrokerOnOutput) {
      child.kill();
    }
    if (targetOutput.overflowed || cancelOnOutput) {
      requestCancellation();
    }
  });
  child.stdio[4].on("data", (chunk) => {
    appendBounded(targetError, chunk, outputLimit);
    if (targetError.overflowed) {
      requestCancellation();
    }
  });

  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  if (cancelImmediately) {
    cancelSent = true;
    child.stdin.write(Buffer.concat([launchFrame, cancelFrame]));
  } else {
    child.stdin.write(launchFrame);
  }

  let guardExpired = false;
  const guard = setTimeout(() => {
    guardExpired = true;
    child.kill();
  }, harnessDeadlineMilliseconds);
  const close = await completed;
  clearTimeout(guard);
  if (guardExpired) {
    throw new Error("native broker exceeded the conformance harness deadline");
  }
  if (parseFailure !== undefined) {
    throw parseFailure;
  }
  if (statusBuffer.length !== 0) {
    throw new Error("native broker ended with a partial status frame");
  }
  return Object.freeze({
    close: Object.freeze(close),
    statuses: Object.freeze(statuses),
    stdout: Buffer.concat(targetOutput.chunks),
    stderr: Buffer.concat(targetError.chunks),
    diagnostics: Buffer.concat(diagnostics.chunks),
    stdoutOverflowed: targetOutput.overflowed,
    stderrOverflowed: targetError.overflowed,
  });
}

export function runNativeFixture({
  arguments: arguments_,
  environment = [],
  workingDirectory = projectRoot,
  timeoutMilliseconds = 5_000,
  processLimit = 4,
  cancelOnStarted = false,
  closeControllerOnStarted = false,
  killBrokerOnOutput = false,
  cancelOnOutput = false,
  cancelImmediately = false,
  outputLimit = defaultOutputLimit,
}) {
  return runNativeBroker({
    launchFrame: encodeLaunch({
      timeoutMilliseconds,
      processLimit,
      program: nativeFixturePath,
      workingDirectory,
      environment,
      arguments: arguments_,
    }),
    cancelOnStarted,
    closeControllerOnStarted,
    killBrokerOnOutput,
    cancelOnOutput,
    cancelImmediately,
    outputLimit,
  });
}
