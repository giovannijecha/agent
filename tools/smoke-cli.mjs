import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(projectRoot, "packages/agent-cli/dist/main.js");
const result = spawnSync(process.execPath, [entryPoint], {
  cwd: projectRoot,
  encoding: "utf8",
});

if (result.error !== undefined) {
  throw result.error;
}
assert.equal(result.status, 0);
assert.equal(result.stderr, "");
assert.equal(
  result.stdout,
  "agent\ninteractive terminal requires TTY input and output\n",
);
assert.equal(result.stdout.includes("\u001B"), false);
