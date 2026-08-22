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
    '[Missing](docs/missing.md "a \\"quoted\\" title")',
    "[Missing](docs/missing.md 'a \\'quoted\\' title')",
    "[Missing](docs/missing.md (a \\) title))",
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
    "[right\\] bracket][]\n\n[right\\] bracket]: docs/missing.md",
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

  const escapedLabel = currentContext();
  escapedLabel.files["README.md"] +=
    "[right\\] bracket](docs/missing.md)\n";
  assert.throws(
    () =>
      validateDocumentation(escapedLabel, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const validFragment = currentContext();
  validFragment.files["PRIVACY.md"] += "\n## Evaluation data\n";
  validFragment.files["README.md"] +=
    "[Evaluation](PRIVACY.md#evaluation-data)\n";
  validateDocumentation(validFragment, {
    expectedLicenseDigest: licenseDigest,
  });

  const missingFragment = currentContext();
  missingFragment.files["PRIVACY.md"] += "\n## Evaluation data\n";
  missingFragment.files["README.md"] +=
    "[Evaluation](PRIVACY.md#missing)\n";
  assert.throws(
    () =>
      validateDocumentation(missingFragment, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const localFragment = currentContext();
  localFragment.files["README.md"] += "[Missing](#missing)\n";
  assert.throws(
    () =>
      validateDocumentation(localFragment, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const fencedHtml = currentContext();
  fencedHtml.files["README.md"] += [
    "```html",
    '<img src="examples/not-a-real-file.png">',
    "```",
    "",
  ].join("\n");
  validateDocumentation(fencedHtml, {
    expectedLicenseDigest: licenseDigest,
  });

  const inlineCode = currentContext();
  inlineCode.files["README.md"] +=
    "`[sample](docs/not-real.md)`\n";
  validateDocumentation(inlineCode, {
    expectedLicenseDigest: licenseDigest,
  });

  const commentedHtml = currentContext();
  commentedHtml.files["README.md"] += [
    "<!--",
    '<img src="examples/not-a-real-file.png">',
    "-->",
    "",
  ].join("\n");
  validateDocumentation(commentedHtml, {
    expectedLicenseDigest: licenseDigest,
  });

  const commentedAnchor = currentContext();
  commentedAnchor.files["README.md"] += [
    "[Missing](#fake)",
    '<!-- id="fake" -->',
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(commentedAnchor, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const proseAnchor = currentContext();
  proseAnchor.files["README.md"] += [
    "[Missing](#fake)",
    'The value id="fake" is illustrative.',
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(proseAnchor, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const htmlAnchor = currentContext();
  htmlAnchor.files["README.md"] += [
    '<a title=example id="exact-anchor"></a>',
    "[Exact](#exact-anchor)",
    "",
  ].join("\n");
  validateDocumentation(htmlAnchor, {
    expectedLicenseDigest: licenseDigest,
  });

  const incompleteHtmlAnchor = currentContext();
  incompleteHtmlAnchor.files["README.md"] += [
    "[Missing](#fake)",
    '<a id="fake"',
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(incompleteHtmlAnchor, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const fencedHeading = currentContext();
  fencedHeading.files["README.md"] += [
    "[Missing](#not-an-anchor)",
    "",
    "~~~markdown",
    "## Not an anchor",
    "~~~",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(fencedHeading, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
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

test("requires exact inline-code closing runs", () => {
  const context = currentContext();
  context.files["README.md"] += "`[Missing](docs/missing.md)``\n";
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("ignores links inside indented code blocks", () => {
  const context = currentContext();
  context.files["README.md"] += "    [sample](docs/not-real.md)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("validates list-relative indented links", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "- item",
    "    [Missing](docs/missing.md)",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("rejects tab-indented fenced-code openers", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "\t```",
    "[Missing](docs/missing.md)",
    "```",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("ignores illustrative HTML attributes in prose", () => {
  const context = currentContext();
  context.files["README.md"] +=
    'The literal src="docs/missing.md" is illustrative.\n';
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("ignores fenced HTML inside block quotes", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "> ~~~html",
    '> <img src="docs/missing.md">',
    "> ~~~",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("stops list fences at an unindented continuation", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "- ```",
    "[Missing](docs/missing.md)",
    "```",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const retainedFence = currentContext();
  retainedFence.files["README.md"] += [
    "- ```html",
    '  <img src="docs/missing.md">',
    "  ```",
    "",
  ].join("\n");
  validateDocumentation(retainedFence, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("validates escaped reference destinations", () => {
  const context = currentContext();
  context.files["README.md"] +=
    "[target]: <docs/missing\\> file.md>\n";
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("validates links after deeply nested labels", () => {
  const context = currentContext();
  context.files["README.md"] += "[a [b [c]]](docs/missing.md)\n";
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
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
