import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOL_PERMISSION_DEFINITIONS,
  ToolPermissionPolicy,
} from "../dist/tool-permissions.js";

test("owns the exact six-tool session permission catalog and defaults", () => {
  assert.deepEqual(
    TOOL_PERMISSION_DEFINITIONS.map(({ defaultMode, name, risk }) => ({
      defaultMode,
      name,
      risk,
    })),
    [
      { defaultMode: "allow", name: "read_file", risk: "read" },
      { defaultMode: "allow", name: "list_directory", risk: "read" },
      { defaultMode: "allow", name: "search_text", risk: "read" },
      { defaultMode: "ask", name: "apply_patch", risk: "write" },
      { defaultMode: "ask", name: "manage_path", risk: "write" },
      { defaultMode: "ask", name: "run_process", risk: "execute" },
    ],
  );

  const policy = new ToolPermissionPolicy();
  assert.equal(Object.isFrozen(policy.snapshots()), true);
  assert.equal(Object.isFrozen(policy.snapshots().at(0)), true);
  assert.equal(policy.modeFor("read_file", "read").ok, true);
  assert.deepEqual(policy.modeFor("apply_patch", "write"), {
    ok: true,
    value: "ask",
  });
});

test("changes bounded modes without wrapping and resets session grants", () => {
  const policy = new ToolPermissionPolicy();

  assert.deepEqual(policy.changeAt(3, "less"), {
    ok: true,
    value: { mode: "deny", name: "apply_patch", risk: "write" },
  });
  assert.equal(policy.changeAt(3, "less").ok, true);
  assert.equal(policy.changeAt(3, "more").ok, true);
  assert.equal(policy.changeAt(3, "more").ok, true);
  assert.equal(policy.changeAt(3, "more").ok, true);
  assert.deepEqual(policy.modeFor("apply_patch", "write"), {
    ok: true,
    value: "allow",
  });

  policy.reset();
  assert.deepEqual(policy.modeFor("apply_patch", "write"), {
    ok: true,
    value: "ask",
  });
});

test("fails closed for unknown tools, risk drift, and invalid indices", () => {
  const policy = new ToolPermissionPolicy();

  assert.deepEqual(policy.modeFor("unknown", "read"), {
    error: { kind: "unknownTool" },
    ok: false,
  });
  assert.deepEqual(policy.modeFor("read_file", "write"), {
    error: { kind: "riskMismatch" },
    ok: false,
  });
  assert.deepEqual(policy.changeAt(6, "more"), {
    error: { kind: "invalidIndex" },
    ok: false,
  });
});
