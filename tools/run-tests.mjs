import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { ownershipPolicy, projectRoot } from "./lib/project.mjs";

const testRoots = [
  ...ownershipPolicy.workspaces.map((workspace) => workspace.path + "/.test-dist"),
  "tools/test",
];

function collectTests(directory) {
  const absoluteDirectory = path.resolve(projectRoot, directory);
  const tests = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absoluteEntry = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      tests.push(...collectTests(path.relative(projectRoot, absoluteEntry)));
    } else if (entry.isFile() && /\.test\.(?:js|mjs)$/u.test(entry.name)) {
      tests.push(absoluteEntry);
    }
  }
  return tests;
}

const tests = testRoots.flatMap(collectTests).sort((left, right) =>
  left.localeCompare(right, "en"),
);
if (tests.length === 0) {
  throw new Error("no tests were discovered");
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  cwd: projectRoot,
  stdio: "inherit",
});
if (result.error !== undefined) {
  throw result.error;
}
if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
