import assert from "node:assert/strict";
import test from "node:test";

import { ShellExecutionPolicy } from "../dist/shell-execution-policy.js";

test("owns the exact Linux shell and credential-free environment", () => {
  const created = ShellExecutionPolicy.create("linux", {
    AGENT_OLLAMA_API_KEY: "secret",
    HOME: "/home/operator",
    LANG: "C.UTF-8",
    PATH: "/owned/bin",
    UNREGISTERED: "absent",
  });
  assert.ok(created.ok);

  const invocation = created.value.invocation("git status --short");
  assert.deepEqual(invocation, {
    arguments: ["--noprofile", "--norc", "-c", "git status --short"],
    environment: [
      "PATH=/owned/bin",
      "HOME=/home/operator",
      "LANG=C.UTF-8",
    ],
    executable: "/bin/bash",
  });
  assert.equal(Object.isFrozen(invocation), true);
  assert.equal(Object.isFrozen(invocation.arguments), true);
  assert.equal(Object.isFrozen(invocation.environment), true);
});

test("owns the exact Windows PowerShell and fixed UTF-8 prelude", () => {
  const created = ShellExecutionPolicy.create("win32", {
    AGENT_OLLAMA_API_KEY: "secret",
    APPDATA: "C:\\Users\\operator\\AppData\\Roaming",
    Path: "C:\\tools",
    TEMP: "C:\\Temp",
  });
  assert.ok(created.ok);

  const invocation = created.value.invocation("git status --short");
  assert.equal(
    invocation.executable,
    "agent:windows-powershell",
  );
  assert.deepEqual(invocation.arguments.slice(0, 4), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
  ]);
  assert.equal(invocation.arguments.at(4)?.endsWith("git status --short"), true);
  assert.equal(invocation.arguments.at(4)?.includes("OutputEncoding"), true);
  assert.deepEqual(invocation.environment, [
    "Path=C:\\tools",
    "TEMP=C:\\Temp",
    "APPDATA=C:\\Users\\operator\\AppData\\Roaming",
  ]);
});

test("enforces the aggregate encoded environment byte bound", () => {
  const exact = ShellExecutionPolicy.create("linux", {
    HOME: "h".repeat(4_091),
    PATH: "p".repeat(4_091),
  });
  assert.ok(exact.ok);

  assert.deepEqual(ShellExecutionPolicy.create("linux", {
    HOME: "h".repeat(4_092),
    PATH: "p".repeat(4_091),
  }), {
    error: { kind: "invalidEnvironment" },
    ok: false,
  });
  assert.deepEqual(ShellExecutionPolicy.create("win32", {
    PATHEXT: "e".repeat(4_089),
    Path: "p".repeat(4_091),
  }), {
    error: { kind: "invalidEnvironment" },
    ok: false,
  });
});

test("fails closed on unsupported hosts and ambiguous or unsafe environment", () => {
  assert.deepEqual(ShellExecutionPolicy.create("darwin", {}), {
    error: { kind: "unsupportedPlatform" },
    ok: false,
  });
  for (const source of [
    { PATH: "one", Path: "two" },
    { Path: "unsafe\0value" },
  ]) {
    assert.deepEqual(ShellExecutionPolicy.create("win32", source), {
      error: { kind: "invalidEnvironment" },
      ok: false,
    });
  }
  assert.equal(ShellExecutionPolicy.create("win32", {}).ok, true);
  assert.deepEqual(ShellExecutionPolicy.create("linux", { PATH: "x\0y" }), {
    error: { kind: "invalidEnvironment" },
    ok: false,
  });
  const hostile = Object.create(null) as { PATH?: string };
  Object.defineProperty(hostile, "PATH", {
    get: () => {
      throw new Error("hostile environment getter");
    },
  });
  assert.deepEqual(ShellExecutionPolicy.create("linux", hostile), {
    error: { kind: "invalidEnvironment" },
    ok: false,
  });
});
