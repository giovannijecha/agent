import assert from "node:assert/strict";
import test from "node:test";

import {
  TOOL_ACTIVITY_PRESENTATION_DEFINITIONS,
  projectToolActivityPresentation,
} from "../dist/tool-activity-presentation.js";
import { TOOL_PERMISSION_DEFINITIONS } from "../dist/tool-permissions.js";

test("binds compact activity labels to the exact permission catalog", () => {
  assert.equal(Object.isFrozen(TOOL_ACTIVITY_PRESENTATION_DEFINITIONS), true);
  assert.equal(
    TOOL_ACTIVITY_PRESENTATION_DEFINITIONS.every((entry) =>
      Object.isFrozen(entry)
    ),
    true,
  );
  assert.deepEqual(
    TOOL_ACTIVITY_PRESENTATION_DEFINITIONS.map(({ name, risk }) => ({
      name,
      risk,
    })),
    TOOL_PERMISSION_DEFINITIONS.map(({ name, risk }) => ({ name, risk })),
  );
  assert.deepEqual(
    TOOL_ACTIVITY_PRESENTATION_DEFINITIONS.map(({ action }) => action),
    ["Read", "List", "Search", "Write", "Manage", "Run"],
  );
});

test("projects every lifecycle through explicit written and visual truth", () => {
  const expectations = [
    ["permission", "attention", "\u2022"],
    ["queued", "attention", "\u2022"],
    ["running", "attention", "\u2022"],
    ["cancelling", "attention", "\u2022"],
    ["succeeded", "positive", "\u2022"],
    ["failed", "negative", "x"],
    ["denied", "negative", "x"],
    ["cancelled", "negative", "x"],
  ] as const;

  for (const [state, truth, marker] of expectations) {
    const projected = projectToolActivityPresentation({
      name: "read_file",
      preview: "",
      risk: "read",
      state,
    });
    assert.equal(projected.ok, true);
    if (projected.ok) {
      assert.equal(Object.isFrozen(projected.value), true);
      assert.equal(projected.value.action, "Read");
      assert.equal(projected.value.marker, marker);
      assert.equal(projected.value.previewKind, "plain");
      assert.equal(projected.value.stateLabel, state);
      assert.equal(projected.value.truth, truth);
    }
  }
});

test("projects one patch path as useful detail and removes it from the diff body", () => {
  const projected = projectToolActivityPresentation({
    name: "apply_patch",
    preview: "Path: src/index.ts\n- old\n+ new",
    risk: "write",
    state: "permission",
  });
  assert.deepEqual(projected, {
    ok: true,
    value: {
      action: "Write",
      detail: "src/index.ts",
      marker: "\u2022",
      preview: "- old\n+ new",
      previewKind: "patchDiff",
      state: "permission",
      stateLabel: "permission",
      truth: "attention",
    },
  });
});

test("keeps non-patch permission previews plain", () => {
  const projected = projectToolActivityPresentation({
    name: "manage_path",
    preview: "Operation: create_directory\nPath: docs",
    risk: "write",
    state: "permission",
  });
  assert.equal(projected.ok, true);
  if (projected.ok) {
    assert.equal(projected.value.previewKind, "plain");
    assert.equal(
      projected.value.preview,
      "Operation: create_directory\nPath: docs",
    );
  }
});

test("rejects unknown activity identity and risk drift without a fallback", () => {
  assert.deepEqual(
    projectToolActivityPresentation({
      name: "unknown_tool",
      preview: "",
      risk: "read",
      state: "running",
    }),
    { error: { kind: "unknownTool" }, ok: false },
  );
  assert.deepEqual(
    projectToolActivityPresentation({
      name: "read_file",
      preview: "",
      risk: "write",
      state: "running",
    }),
    { error: { kind: "riskMismatch" }, ok: false },
  );
  assert.deepEqual(
    projectToolActivityPresentation({
      name: "read_file",
      preview: "",
      risk: "read",
      state: "unknown" as never,
    }),
    { error: { kind: "invalidState" }, ok: false },
  );
  assert.deepEqual(
    projectToolActivityPresentation({
      name: "apply_patch",
      preview: "technical binding",
      risk: "write",
      state: "permission",
    }),
    { error: { kind: "invalidPreview" }, ok: false },
  );
});
