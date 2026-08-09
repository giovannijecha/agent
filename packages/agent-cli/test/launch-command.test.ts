import assert from "node:assert/strict";
import test from "node:test";

import { parseLaunchCommand } from "../dist/launch-command.js";

test("accepts the exact lean executable command surface", () => {
  assert.deepEqual(parseLaunchCommand([]), { command: "run", ok: true });
  assert.deepEqual(parseLaunchCommand(["--help"]), {
    command: "help",
    ok: true,
  });
  assert.deepEqual(parseLaunchCommand(["--version"]), {
    command: "version",
    ok: true,
  });
});

test("rejects unknown, combined, and malformed arguments without retention", () => {
  for (const value of [["secret"], ["--help", "extra"], {}]) {
    assert.deepEqual(parseLaunchCommand(value as readonly string[]), {
      error: { kind: "invalidArguments" },
      ok: false,
    });
  }
});
