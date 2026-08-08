import { rmSync } from "node:fs";
import path from "node:path";

import { ownershipPolicy, projectRoot } from "./lib/project.mjs";

const generated = ownershipPolicy.workspaces.flatMap((workspace) => [
  workspace.path + "/dist",
  workspace.path + "/.test-dist",
]);

for (const relativePath of generated) {
  const target = path.resolve(projectRoot, relativePath);
  const boundary = projectRoot + path.sep;
  if (!target.startsWith(boundary)) {
    throw new Error("generated path escaped the project: " + relativePath);
  }
  rmSync(target, { force: true, recursive: true });
}
