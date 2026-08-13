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

function contextWithChangedSvg(transform) {
  const changed = structuredClone(manifest);
  const context = currentContext();
  const index = changed.assets.findIndex(
    (asset) => asset.mediaType === "image/svg+xml",
  );
  const target = changed.assets[index].path;
  const unsafe = Buffer.from(
    transform(new TextDecoder().decode(context.files[target])),
    "utf8",
  );
  changed.assets[index].sha256 = createHash("sha256")
    .update(unsafe)
    .digest("hex");
  context.files[target] = unsafe;
  return { changed, context };
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
  const { changed, context } = contextWithChangedSvg((text) =>
    text.replace(
      "</svg>",
      "<script>void 0</script></svg>",
    ),
  );
  assert.throws(
    () => validateBrandPolicy(changed, context),
    BrandPolicyError,
  );
});

test("rejects SVG event-handler attributes", () => {
  for (const attribute of [
    'onload="void 0"',
    'ONCLICK = "void 0"',
    'onfocusin\n= "void 0"',
  ]) {
    const { changed, context } = contextWithChangedSvg((text) =>
      text.replace("<rect ", "<rect " + attribute + " "),
    );
    assert.throws(
      () => validateBrandPolicy(changed, context),
      BrandPolicyError,
    );
  }
});

test("rejects namespace-qualified SVG names", () => {
  const mutations = [
    (text) =>
      text.replace(
        "</svg>",
        '<s:script xmlns:s="http://www.w3.org/2000/svg">void 0</s:script></svg>',
      ),
    (text) =>
      text.replace(
        "<rect ",
        '<rect xml:lang="en" ',
      ),
  ];
  for (const mutate of mutations) {
    const { changed, context } = contextWithChangedSvg(mutate);
    assert.throws(
      () => validateBrandPolicy(changed, context),
      BrandPolicyError,
    );
  }
});

test("allows colons outside SVG markup names", () => {
  const mutations = [
    (text) => text.replace("</desc>", ": owned identity</desc>"),
    (text) => text.replace(
      "<rect ",
      '<rect data-note="owned a:b=1" ',
    ),
  ];
  for (const mutate of mutations) {
    const { changed, context } = contextWithChangedSvg(mutate);
    assert.doesNotThrow(() => validateBrandPolicy(changed, context));
  }
});

test("rejects other active SVG features", () => {
  const mutations = [
    (text) => text.replace("</svg>", "<animate attributeName=\"x\"/></svg>"),
    (text) => text.replace(
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><?xml-stylesheet href=\"x\"?>",
    ),
    (text) => text.replace("<svg ", "<!DOCTYPE svg><svg "),
  ];
  for (const mutate of mutations) {
    const { changed, context } = contextWithChangedSvg(mutate);
    assert.throws(
      () => validateBrandPolicy(changed, context),
      BrandPolicyError,
    );
  }
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
