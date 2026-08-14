import assert from "node:assert/strict";
import path from "node:path";
import { execPath } from "node:process";
import test from "node:test";

import {
  PROCESS_PROGRAM_TOKENS,
  ProcessProgramRegistry,
} from "../dist/process-program-registry.js";

test("registers the exact current Node executable under one canonical token", () => {
  const created = ProcessProgramRegistry.create(execPath);
  assert.ok(created.ok);

  const registration = created.value.resolve(PROCESS_PROGRAM_TOKENS.node);
  assert.deepEqual(registration, {
    executable: execPath,
    token: "node",
  });
  assert.equal(Object.isFrozen(registration), true);
  assert.equal(created.value.resolve("Node"), undefined);
  assert.equal(created.value.resolve("bash"), undefined);
  assert.equal(created.value.resolve(""), undefined);
});

test("rejects non-absolute and NUL-containing executable registrations", () => {
  assert.deepEqual(ProcessProgramRegistry.create(undefined), {
    error: { kind: "invalidExecutable" },
    ok: false,
  });
  assert.deepEqual(ProcessProgramRegistry.create("node"), {
    error: { kind: "invalidExecutable" },
    ok: false,
  });
  assert.deepEqual(
    ProcessProgramRegistry.create(path.resolve("node") + "\u0000hidden"),
    {
      error: { kind: "invalidExecutable" },
      ok: false,
    },
  );
});
