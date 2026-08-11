import assert from "node:assert/strict";
import path from "node:path";
import { arch, cwd, execPath, platform } from "node:process";
import test from "node:test";

import type { ToolCancellation } from "@agent/tools";

import { NodeProcessRunner } from "../dist/node-process-runner.js";
import {
  PROCESS_RUNNER_LIMITS,
  type ProcessRunRequest,
} from "../dist/process-runner.js";

const idleCancellation: ToolCancellation = Object.freeze({
  requested: false,
  whenRequested: async () => new Promise<void>(() => undefined),
});

function fixturePath(): string {
  const executable =
    platform === "win32"
      ? "agent-process-fixture.exe"
      : "agent-process-fixture";
  return path.resolve(
    cwd(),
    "packages",
    "agent-cli",
    ".native-build",
    platform + "-" + arch,
    executable,
  );
}

function request(
  arguments_: readonly string[],
  overrides: Partial<ProcessRunRequest> = {},
): ProcessRunRequest {
  return Object.freeze({
    arguments: Object.freeze([...arguments_]),
    executable: fixturePath(),
    processLimit: 16,
    stderrBytes: 65_536,
    stdoutBytes: 65_536,
    timeoutMilliseconds: 5_000,
    workingDirectory: path.resolve(cwd()),
    ...overrides,
  });
}

function runner(): NodeProcessRunner {
  const created = NodeProcessRunner.create(platform, arch);
  assert.ok(created.ok);
  return created.value;
}

test("runs literal arguments without a shell or user environment", async () => {
  const argumentsResult = await runner().run(
    request(["arguments", "literal value", "&", "$(ignored)"]),
    idleCancellation,
  );
  assert.ok(argumentsResult.ok);
  assert.equal(
    argumentsResult.value.stdout,
    "literal value\u0000&\u0000$(ignored)\u0000",
  );

  const environmentResult = await runner().run(
    request(["environment"]),
    idleCancellation,
  );
  assert.ok(environmentResult.ok);
  assert.equal(environmentResult.value.stdout, platform === "win32" ? "1\n" : "0\n");
});

test("boots the real Node executable with only the owned OS environment", async () => {
  const result = await runner().run(
    request(
      [
        "-e",
        "globalThis.crypto.getRandomValues(new Uint8Array(1));process.stdout.write(JSON.stringify(Object.keys(process.env).sort())+'\\n')",
      ],
      { executable: execPath },
    ),
    idleCancellation,
  );

  assert.ok(result.ok);
  assert.equal(result.value.exitCode, 0);
  assert.equal(
    result.value.stdout,
    platform === "win32" ? '["SystemRoot"]\n' : "[]\n",
  );
});

test("returns bounded stdout, stderr, working directory, and exit code", async () => {
  const directoryResult = await runner().run(
    request(["working-directory"]),
    idleCancellation,
  );
  assert.ok(directoryResult.ok);
  assert.equal(
    path.relative(
      path.resolve(cwd()),
      directoryResult.value.stdout.trim(),
    ),
    "",
  );

  const stderrResult = await runner().run(
    request(["stderr"]),
    idleCancellation,
  );
  assert.ok(stderrResult.ok);
  assert.equal(stderrResult.value.stderr, "fixture stderr\n");

  const exitResult = await runner().run(
    request(["exit", "23"]),
    idleCancellation,
  );
  assert.ok(exitResult.ok);
  assert.equal(exitResult.value.exitCode, 23);
});

test("fails closed on timeout, cancellation, and output overflow", async () => {
  const timeout = await runner().run(
    request(["sleep"], { timeoutMilliseconds: 50 }),
    idleCancellation,
  );
  assert.deepEqual(timeout, { ok: false, error: { kind: "limit" } });

  const cancelled = await runner().run(request(["sleep"]), {
    requested: false,
    whenRequested: async () => undefined,
  });
  assert.deepEqual(cancelled, { ok: false, error: { kind: "cancelled" } });

  const overflow = await runner().run(
    request(["flood", "257"], { stdoutBytes: 256 }),
    idleCancellation,
  );
  assert.deepEqual(overflow, { ok: false, error: { kind: "limit" } });
});

test("rejects unsupported process-containment targets", () => {
  assert.deepEqual(NodeProcessRunner.create("darwin", "arm64"), {
    ok: false,
    error: { kind: "unsupportedPlatform" },
  });
});

test("rejects oversized arguments before launching the broker", async () => {
  const tooMany = await runner().run(
    request(Array.from({ length: 65 }, () => "argument")),
    idleCancellation,
  );
  assert.deepEqual(tooMany, { ok: false, error: { kind: "io" } });

  const tooLong = await runner().run(
    request(["x".repeat(PROCESS_RUNNER_LIMITS.argumentCodeUnits + 1)]),
    idleCancellation,
  );
  assert.deepEqual(tooLong, { ok: false, error: { kind: "io" } });

  for (const unsafe of ["a\0b", "\ud800"]) {
    const rejected = await runner().run(
      request([unsafe]),
      idleCancellation,
    );
    assert.deepEqual(rejected, { ok: false, error: { kind: "io" } });
  }

  const oversizedUtf8Directory = await runner().run(
    request([], {
      workingDirectory:
        path.resolve(cwd()) +
        path.sep +
        "\u6f22".repeat(Math.floor(PROCESS_RUNNER_LIMITS.textUtf8Bytes / 3) + 1),
    }),
    idleCancellation,
  );
  assert.deepEqual(oversizedUtf8Directory, {
    ok: false,
    error: { kind: "io" },
  });
});
