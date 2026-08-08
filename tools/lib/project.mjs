import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute root shared by owned operational tools. */
export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** Canonical workspace and ownership registry. */
export const ownershipPolicy = JSON.parse(
  readFileSync(path.join(projectRoot, "tools/ownership-policy.json"), "utf8"),
);
