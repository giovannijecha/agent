import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DOCUMENT_PATHS,
  validateDocumentation,
} from "../lib/docs-check.mjs";

const licenseText = "licensed text";
const licenseDigest = createHash("sha256").update(licenseText).digest("hex");

function currentContext() {
  const files = Object.fromEntries(
    DOCUMENT_PATHS.map((file) => [file, "# " + file + "\n"]),
  );
  files["README.md"] = [
    "# agent",
    "",
    "An owned, zero-dependency personal coding agent.",
    "",
    "[Architecture](docs/ARCHITECTURE.md)",
    "",
  ].join("\n");
  files["AGENTS.md"] = [
    "# Agent project",
    "",
    "Canonical repository: `giovannijecha/agent`.",
    "",
  ].join("\n");
  return {
    files,
    gitAttributesText: "* text=auto eol=lf\n",
    licenseText,
    ownedPaths: [...DOCUMENT_PATHS, "LICENSE"],
  };
}

test("accepts the exact lean documentation surface", () => {
  validateDocumentation(currentContext(), {
    expectedLicenseDigest: licenseDigest,
  });
});

test("rejects missing and additional authority documents", () => {
  const missing = currentContext();
  delete missing.files["docs/ENGINEERING.md"];
  missing.ownedPaths = missing.ownedPaths.filter(
    (file) => file !== "docs/ENGINEERING.md",
  );
  assert.throws(() => validateDocumentation(missing), /documentation inventory/u);

  const additional = currentContext();
  additional.files["docs/decisions/0001-example.md"] = "# Decision\n";
  additional.ownedPaths.push("docs/decisions/0001-example.md");
  assert.throws(() => validateDocumentation(additional), /decision ledger/u);

  const lowercase = currentContext();
  lowercase.files["docs/notes.md"] = "# Parallel authority\n";
  lowercase.ownedPaths.push("docs/notes.md");
  assert.throws(
    () =>
      validateDocumentation(lowercase, {
        expectedLicenseDigest: licenseDigest,
      }),
    /documentation inventory/u,
  );
});

test("rejects broken local links and decision-ledger references", () => {
  const broken = currentContext();
  broken.files["README.md"] += "[Missing](docs/missing.md)\n";
  assert.throws(() => validateDocumentation(broken), /broken local link/u);

  const rooted = currentContext();
  rooted.files["README.md"] += "[Privacy](/PRIVACY.md)\n";
  assert.throws(
    () =>
      validateDocumentation(rooted, {
        expectedLicenseDigest: licenseDigest,
      }),
    /link target/u,
  );

  const srcset = currentContext();
  srcset.files["README.md"] +=
    '<source srcset="assets/brand/missing.png 1x, assets/brand/other.png 2x">\n';
  assert.throws(
    () =>
      validateDocumentation(srcset, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const singleQuoted = currentContext();
  singleQuoted.files["README.md"] +=
    "<img src='assets/brand/missing.png'>\n";
  assert.throws(
    () =>
      validateDocumentation(singleQuoted, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const uppercase = currentContext();
  uppercase.files["README.md"] +=
    '<source SRCSET="assets/brand/missing.png 1x">\n';
  assert.throws(
    () =>
      validateDocumentation(uppercase, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const unquoted = currentContext();
  unquoted.files["README.md"] +=
    "<img src=assets/brand/missing.png>\n";
  assert.throws(
    () =>
      validateDocumentation(unquoted, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  for (const markdownLink of [
    "[Missing](docs/missing.md 'single title')",
    "[Missing](docs/missing.md (parenthesized title))",
    "[Missing](<docs/missing.md> \"angle destination\")",
  ]) {
    const titled = currentContext();
    titled.files["README.md"] += markdownLink + "\n";
    assert.throws(
      () =>
        validateDocumentation(titled, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      markdownLink,
    );
  }

  for (const referenceLink of [
    "[Missing][target]\n\n[target]: docs/missing.md 'details'",
    "[Missing][]\n\n[Missing]: <docs/missing.md> (details)",
  ]) {
    const reference = currentContext();
    reference.files["README.md"] += referenceLink + "\n";
    assert.throws(
      () =>
        validateDocumentation(reference, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      referenceLink,
    );
  }

  const nested = currentContext();
  nested.ownedPaths.push(
    "assets/brand/agent-wordmark-transparent.png",
  );
  nested.files["README.md"] +=
    "[![Agent](assets/brand/agent-wordmark-transparent.png)](docs/missing.md)\n";
  assert.throws(
    () =>
      validateDocumentation(nested, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const decision = currentContext();
  decision.files["docs/ARCHITECTURE.md"] +=
    "See docs/decisions/0042-example.md.\n";
  assert.throws(() => validateDocumentation(decision), /decision ledger/u);

  const hyphenated = currentContext();
  hyphenated.files["docs/ARCHITECTURE.md"] += "See decision-0095.\n";
  assert.throws(
    () =>
      validateDocumentation(hyphenated, {
        expectedLicenseDigest: licenseDigest,
      }),
    /decision ledger/u,
  );
});

test("rejects automated attribution and license drift", () => {
  for (const marker of [
    "Generated by Example Bot.",
    "Written by Codex.",
    "Made without AI.",
    "No tool was used.",
    "No tools were used.",
    "Entirely human-written.",
    "100% human.",
  ]) {
    const attributed = currentContext();
    attributed.files["README.md"] += marker + "\n";
    assert.throws(
      () =>
        validateDocumentation(attributed, {
          expectedLicenseDigest: licenseDigest,
        }),
      /attribution|authorship/u,
      marker,
    );
  }

  const attributes = currentContext();
  attributes.gitAttributesText = "* text=auto\n";
  assert.throws(
    () =>
      validateDocumentation(attributes, {
        expectedLicenseDigest: licenseDigest,
      }),
    /Git text policy/u,
  );

  const license = currentContext();
  license.licenseText += " drift";
  assert.throws(
    () =>
      validateDocumentation(license, {
        expectedLicenseDigest:
          "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
      }),
    /license digest/u,
  );
});
