import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { projectRoot } from "../lib/project.mjs";

const entryPoint = path.join(projectRoot, "packages/agent-cli/dist/main.js");

function launchAt(workspace) {
  const environment = {};
  if (process.platform === "win32") {
    assert.equal(typeof process.env.SystemRoot, "string");
    environment.SystemRoot = process.env.SystemRoot;
  }
  return spawnSync(process.execPath, [entryPoint], {
    cwd: workspace,
    encoding: "utf8",
    env: environment,
    shell: false,
    timeout: 10_000,
    windowsHide: true,
  });
}

test("startup rejects a malformed workspace privacy policy before runtime", () => {
  const container = mkdtempSync(
    path.join(tmpdir(), "agent-read-policy-startup-"),
  );
  const workspace = path.join(container, "workspace");
  mkdirSync(workspace);
  try {
    writeFileSync(path.join(workspace, ".agentignore"), "!negation\n", {
      encoding: "utf8",
      flag: "wx",
    });

    const result = launchAt(workspace);

    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(
      result.stderr,
      "agent rejected the workspace privacy policy\n",
    );
  } finally {
    const resolvedContainer = path.resolve(container);
    const resolvedTemporary = path.resolve(tmpdir());
    assert.ok(resolvedContainer.startsWith(resolvedTemporary + path.sep));
    rmSync(resolvedContainer, { force: true, recursive: true });
  }
});
