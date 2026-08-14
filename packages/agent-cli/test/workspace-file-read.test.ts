import assert from "node:assert/strict";
import test from "node:test";

import { BUILTIN_TOOL_LIMITS } from "../dist/builtin-tool-limits.js";
import { projectWorkspaceFileRead } from "../dist/workspace-file-read.js";

test("preserves complete text while reporting exact logical-line metadata", () => {
  const projected = projectWorkspaceFileRead(
    "alpha\r\nbeta\ngamma",
    undefined,
    undefined,
  );
  assert.ok(projected.ok);
  assert.deepEqual(projected.value, {
    hasMore: false,
    lineCount: 3,
    startLine: 1,
    text: "alpha\r\nbeta\ngamma",
    totalLines: 3,
  });
  assert.equal(Object.isFrozen(projected.value), true);
});

test("projects complete lines without normalizing their terminators", () => {
  assert.deepEqual(projectWorkspaceFileRead("alpha\r\nbeta\ngamma", 2, 1), {
    ok: true,
    value: {
      hasMore: true,
      lineCount: 1,
      startLine: 2,
      text: "beta\n",
      totalLines: 3,
    },
  });
  assert.deepEqual(
    projectWorkspaceFileRead("alpha\r\nbeta\ngamma", undefined, 2),
    {
      ok: true,
      value: {
        hasMore: true,
        lineCount: 2,
        startLine: 1,
        text: "alpha\r\nbeta\n",
        totalLines: 3,
      },
    },
  );
  assert.deepEqual(projectWorkspaceFileRead("alpha\r\nbeta\ngamma", 3, undefined), {
    ok: true,
    value: {
      hasMore: false,
      lineCount: 1,
      startLine: 3,
      text: "gamma",
      totalLines: 3,
    },
  });
});

test("defines empty, terminated, and beyond-end selections without phantom lines", () => {
  assert.deepEqual(projectWorkspaceFileRead("", undefined, undefined), {
    ok: true,
    value: {
      hasMore: false,
      lineCount: 0,
      startLine: 1,
      text: "",
      totalLines: 0,
    },
  });
  assert.deepEqual(projectWorkspaceFileRead("alpha\n", undefined, undefined), {
    ok: true,
    value: {
      hasMore: false,
      lineCount: 1,
      startLine: 1,
      text: "alpha\n",
      totalLines: 1,
    },
  });
  assert.deepEqual(projectWorkspaceFileRead("alpha\nbeta\n", 99, 1), {
    ok: true,
    value: {
      hasMore: false,
      lineCount: 0,
      startLine: 3,
      text: "",
      totalLines: 2,
    },
  });
});

test("fails closed on invalid direct projection inputs and source bounds", () => {
  for (const request of [
    [undefined, undefined, undefined],
    ["text", 0, undefined],
    ["text", 1.5, undefined],
    ["text", undefined, 0],
    ["text", undefined, BUILTIN_TOOL_LIMITS.fileRangeLines + 1],
  ] as const) {
    assert.deepEqual(
      projectWorkspaceFileRead(
        request.at(0),
        request.at(1),
        request.at(2),
      ),
      {
        error: { kind: "invalidInput" },
        ok: false,
      },
    );
  }
  assert.deepEqual(
    projectWorkspaceFileRead(
      "x".repeat(BUILTIN_TOOL_LIMITS.fileCodeUnits + 1),
      undefined,
      undefined,
    ),
    { error: { kind: "limit" }, ok: false },
  );
});
