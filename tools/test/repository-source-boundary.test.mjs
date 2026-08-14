import assert from "node:assert/strict";
import test from "node:test";

import {
  isIgnoredRepositorySourceDirectory,
} from "../lib/repository-source-boundary.mjs";

test("excludes only exact repository-root metadata, dependencies, and local state", () => {
  for (const path of [".git", "node_modules", "state"]) {
    assert.equal(isIgnoredRepositorySourceDirectory(path), true);
  }
  for (const path of [
    "evaluations",
    "packages/example/state",
    "stateful",
    "State",
    "",
    undefined,
  ]) {
    assert.equal(isIgnoredRepositorySourceDirectory(path), false);
  }
});
