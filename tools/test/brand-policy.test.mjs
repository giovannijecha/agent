import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BrandPolicyError,
  validateBrandPolicy,
} from "../lib/brand-policy.mjs";
import { projectRoot } from "../lib/project.mjs";

const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, "assets/brand/manifest.json"), "utf8"),
);
const registeredPaths = [
  "assets/brand/README.md",
  ...manifest.assets.map((asset) => asset.path),
  "assets/brand/manifest.json",
].sort();

function currentContext() {
  return {
    files: Object.fromEntries(
      registeredPaths.map((file) => [file, readFileSync(path.join(projectRoot, file))]),
    ),
    ownedPaths: [...registeredPaths],
  };
}

test("accepts the canonical brand pack", () => {
  assert.doesNotThrow(() => validateBrandPolicy(manifest, currentContext()));
});

test("rejects brand identity drift", () => {
  const changed = structuredClone(manifest);
  changed.identity.product = ".agent";
  assert.throws(
    () => validateBrandPolicy(changed, currentContext()),
    BrandPolicyError,
  );
});

test("rejects modified brand bytes", () => {
  const context = currentContext();
  const target = manifest.assets[0].path;
  context.files[target] = Uint8Array.from([...context.files[target], 0]);
  assert.throws(
    () => validateBrandPolicy(manifest, context),
    BrandPolicyError,
  );
});

test("rejects unsafe SVG capabilities", () => {
  const changed = structuredClone(manifest);
  const context = currentContext();
  const index = changed.assets.findIndex((asset) => asset.mediaType === "image/svg+xml");
  const target = changed.assets[index].path;
  const unsafe = Buffer.from(
    new TextDecoder().decode(context.files[target]).replace(
      "</svg>",
      "<script>void 0</script></svg>",
    ),
    "utf8",
  );
  changed.assets[index].sha256 = createHash("sha256").update(unsafe).digest("hex");
  context.files[target] = unsafe;
  assert.throws(
    () => validateBrandPolicy(changed, context),
    BrandPolicyError,
  );
});

test("rejects an unregistered brand file", () => {
  const context = currentContext();
  context.files["assets/brand/unregistered.svg"] = Buffer.from("<svg/>", "utf8");
  context.ownedPaths.push("assets/brand/unregistered.svg");
  assert.throws(
    () => validateBrandPolicy(manifest, context),
    BrandPolicyError,
  );
});
