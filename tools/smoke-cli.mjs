import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(projectRoot, "packages/agent-cli/dist/main.js");

function runAgent(arguments_) {
  return spawnSync(process.execPath, [entryPoint, ...arguments_], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

const result = runAgent([]);

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

const evaluation = runAgent(["--evaluation-receipt"]);
if (evaluation.error !== undefined) {
  throw evaluation.error;
}
assert.equal(evaluation.status, 2);
assert.equal(evaluation.stdout, "");
assert.equal(
  evaluation.stderr,
  "agent evaluation receipt requires TTY input and output\n",
);
assert.equal(evaluation.stderr.includes("\u001B"), false);
