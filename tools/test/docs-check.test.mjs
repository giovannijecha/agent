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
    sourceLineCounts: {},
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

  for (const file of ["guide.md", "guide.MD", "packages/example/README.md"]) {
    const unregistered = currentContext();
    unregistered.files[file] = "# Parallel authority\n";
    unregistered.ownedPaths.push(file);
    assert.throws(
      () =>
        validateDocumentation(unregistered, {
          expectedLicenseDigest: licenseDigest,
        }),
      /documentation inventory/u,
    );
  }
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

  const commaInSource = currentContext();
  commaInSource.files["README.md"] +=
    '<source srcset="https://example.com/image,large.png 2x">\n';
  validateDocumentation(commaInSource, {
    expectedLicenseDigest: licenseDigest,
  });

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

  const invalidUnquoted = currentContext();
  invalidUnquoted.files["README.md"] +=
    "<span title=[inner](docs/missing.md)=x>\n";
  assert.throws(
    () =>
      validateDocumentation(invalidUnquoted, {
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

  const invalidAngleDestination = currentContext();
  invalidAngleDestination.files["README.md"] +=
    "[sample](<docs/missing<.md>)\n";
  validateDocumentation(invalidAngleDestination, {
    expectedLicenseDigest: licenseDigest,
  });

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
    "--> [still inactive](docs/not-real.md)",
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

  const inlineComment = currentContext();
  inlineComment.files["README.md"] +=
    "Text <!-- [inactive](docs/not-real.md) --> " +
    "[active](docs/still-not-real.md)\n";
  assert.throws(
    () =>
      validateDocumentation(inlineComment, {
        expectedLicenseDigest: licenseDigest,
      }),
    /docs\/still-not-real\.md/u,
  );

  const escapedComment = currentContext();
  escapedComment.files["README.md"] +=
    "\\<!-- [Missing](docs/not-real.md) -->\n";
  assert.throws(
    () =>
      validateDocumentation(escapedComment, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
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

test("accepts only line fragments on tracked non-document files", () => {
  const admitted = currentContext();
  admitted.ownedPaths.push(
    ".github/workflows/verify.yml",
    "config/example.yaml",
    "tools/verify.mjs",
  );
  admitted.sourceLineCounts[".github/workflows/verify.yml"] = 157;
  admitted.sourceLineCounts["config/example.yaml"] = 3;
  admitted.sourceLineCounts["tools/verify.mjs"] = 2;
  admitted.files["README.md"] +=
    "[Implementation](tools/verify.mjs#L1) " +
    "[Last](tools/verify.mjs#L2) " +
    "[Range](tools/verify.mjs#L1-L2) " +
    "[CI](.github/workflows/verify.yml#L1) " +
    "[YAML](config/example.yaml#L2)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  for (const fragment of ["implementation", "L3", "L1-L3", "L2-L1"]) {
    const rejected = currentContext();
    rejected.ownedPaths.push("tools/verify.mjs");
    rejected.sourceLineCounts["tools/verify.mjs"] = 2;
    rejected.files["README.md"] +=
      "[Implementation](tools/verify.mjs#" + fragment + ")\n";
    assert.throws(
      () =>
        validateDocumentation(rejected, {
          expectedLicenseDigest: licenseDigest,
        }),
      /fragment/u,
      fragment,
    );
  }
});

test("does not mask malformed HTML comments", () => {
  const context = currentContext();
  context.files["README.md"] +=
    "Text <!-- [Missing](docs/missing.md) -- invalid -->\n";
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("masks permissively terminated raw HTML comments", () => {
  const fakeAnchor = currentContext();
  fakeAnchor.files["README.md"] += [
    "[Missing](#fake)",
    "",
    "<!-- open -- invalid",
    '<a id="fake"></a>',
    "-->",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(fakeAnchor, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const inertImage = currentContext();
  inertImage.files["README.md"] += [
    "<!-- open -- invalid",
    '<img src="docs/not-real.md">',
    "-->",
    "",
  ].join("\n");
  validateDocumentation(inertImage, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("enforces inline title and destination parenthesis bounds", () => {
  const nestedTitle = currentContext();
  nestedTitle.files["README.md"] +=
    "[Missing](docs/not-real.md (outer (inner)))\n";
  validateDocumentation(nestedTitle, {
    expectedLicenseDigest: licenseDigest,
  });

  const escapedTitle = currentContext();
  escapedTitle.files["README.md"] +=
    "[Missing](docs/missing.md (outer \\(inner\\)))\n";
  assert.throws(
    () =>
      validateDocumentation(escapedTitle, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const depth32 =
    "docs/missing.md" + "(".repeat(32) + "x" + ")".repeat(32);
  const admitted = currentContext();
  admitted.files["README.md"] += "[Missing](" + depth32 + ")\n";
  assert.throws(
    () =>
      validateDocumentation(admitted, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const depth33 =
    "docs/not-real.md" + "(".repeat(33) + "x" + ")".repeat(33);
  const rejected = currentContext();
  rejected.files["README.md"] += "[Missing](" + depth33 + ")\n";
  validateDocumentation(rejected, {
    expectedLicenseDigest: licenseDigest,
  });

  const escapedPrefix =
    "docs/not-real.md\\(" + "(".repeat(33) + "x" + ")".repeat(32);
  const escapeBoundary = currentContext();
  escapeBoundary.files["README.md"] +=
    "[Missing](" + escapedPrefix + ")\n";
  validateDocumentation(escapeBoundary, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("stops inline destinations at blank lines", () => {
  const inactive = currentContext();
  inactive.files["README.md"] +=
    "[Missing](\n\ndocs/not-real.md)\n";
  validateDocumentation(inactive, {
    expectedLicenseDigest: licenseDigest,
  });

  const active = currentContext();
  active.files["README.md"] +=
    "[Missing](\n docs/missing.md)\n";
  assert.throws(
    () =>
      validateDocumentation(active, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("stops inline titles at blank lines", () => {
  const inactive = currentContext();
  inactive.files["README.md"] +=
    '[Missing](docs/not-real.md "title\n\ncontinued")\n';
  validateDocumentation(inactive, {
    expectedLicenseDigest: licenseDigest,
  });

  const active = currentContext();
  active.files["README.md"] +=
    '[Missing](docs/missing.md "title\ncontinued")\n';
  assert.throws(
    () =>
      validateDocumentation(active, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
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

test("closes code spans at backslash-prefixed backticks", () => {
  const context = currentContext();
  context.files["README.md"] +=
    "`code\\` [Missing](docs/missing.md) `\n";
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("rescans the unescaped remainder of backtick runs", () => {
  for (const markdown of [
    "\\``[Missing](docs/not-real.md)`",
    "\\```[Missing](docs/not-real.md)``",
  ]) {
    const context = currentContext();
    context.files["README.md"] += markdown + "\n";
    validateDocumentation(context, {
      expectedLicenseDigest: licenseDigest,
    });
  }

  const escapedOnly = currentContext();
  escapedOnly.files["README.md"] +=
    "\\`[Missing](docs/missing.md)`\n";
  assert.throws(
    () =>
      validateDocumentation(escapedOnly, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("keeps code-span matching within one paragraph", () => {
  const crossParagraph = currentContext();
  crossParagraph.files["README.md"] +=
    "`open\n\n[Missing](docs/not-real.md)`\n";
  assert.throws(
    () =>
      validateDocumentation(crossParagraph, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const sameParagraph = currentContext();
  sameParagraph.files["README.md"] +=
    "`open\n[Missing](docs/not-real.md)`\n";
  validateDocumentation(sameParagraph, {
    expectedLicenseDigest: licenseDigest,
  });

  for (const markdown of [
    "# `open\n[Missing](docs/not-real.md)`",
    "`open\n# [Missing](docs/not-real.md)`",
    "`open\n- [Missing](docs/not-real.md)`",
    "`open\n> [Missing](docs/not-real.md)`",
    "`open\n---\n[Missing](docs/not-real.md)`",
    "> # `open\n> [Missing](docs/not-real.md)`",
    "- # `open\n  [Missing](docs/not-real.md)`",
  ]) {
    const crossBlock = currentContext();
    crossBlock.files["README.md"] += markdown + "\n";
    assert.throws(
      () =>
        validateDocumentation(crossBlock, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
    );
  }
});

test("ignores links inside indented code blocks", () => {
  const context = currentContext();
  context.files["README.md"] += "\n    [sample](docs/not-real.md)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("keeps indented paragraph continuations active", () => {
  for (const paragraph of [
    ["Paragraph", "    [Missing](docs/not-real.md)"],
    ["- Paragraph", "      [Missing](docs/not-real.md)"],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [...paragraph, ""].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      paragraph.join(" | "),
    );
  }
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

test("admits only one as an ordered-list paragraph interruption", () => {
  const rejectedInterruption = currentContext();
  rejectedInterruption.files["PRIVACY.md"] += [
    "Paragraph text",
    "2. # Fake heading",
    "",
  ].join("\n");
  rejectedInterruption.files["README.md"] +=
    "[Fake](PRIVACY.md#fake-heading)\n";
  assert.throws(
    () =>
      validateDocumentation(rejectedInterruption, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const admittedInterruption = currentContext();
  admittedInterruption.files["PRIVACY.md"] += [
    "Paragraph text",
    "1. # First heading",
    "",
    "2. # Second heading",
    "",
  ].join("\n");
  admittedInterruption.files["README.md"] += [
    "[First](PRIVACY.md#first-heading)",
    "[Second](PRIVACY.md#second-heading)",
    "",
  ].join("\n");
  validateDocumentation(admittedInterruption, {
    expectedLicenseDigest: licenseDigest,
  });
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

test("honors first-wins duplicate HTML attributes", () => {
  const admitted = currentContext();
  admitted.files["README.md"] +=
    '<a HREF="README.md" href="docs/missing.md">Home</a> ' +
    '<a href href="docs/missing.md">Empty</a>\n';
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["README.md"] +=
    '<a href="docs/missing.md" href="README.md">Missing</a>\n';
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const duplicateId = currentContext();
  duplicateId.files["PRIVACY.md"] +=
    '<a id="exact" id="fake"></a>\n';
  duplicateId.files["README.md"] +=
    "[Fake](PRIVACY.md#fake)\n";
  assert.throws(
    () =>
      validateDocumentation(duplicateId, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("ignores URL attributes outside their effective HTML semantics", () => {
  const inert = currentContext();
  inert.files["README.md"] += [
    '<span href="docs/missing.md" src="docs/missing.md" ' +
      'srcset="docs/missing.md 1x">Text</span>',
    '<input type="text" src="docs/missing.md">',
    '<input src="docs/missing.md" type="text">',
    '<input src="docs/missing.md">',
    '<input type="text" type="image" src="docs/missing.md">',
    '<input type type="image" src="docs/missing.md">',
    '<button type="button" formaction="docs/missing.md">Text</button>',
    '<button type="reset" formaction="docs/missing.md">Text</button>',
    '<input type="text" formaction="docs/missing.md">',
    '<a ping="docs/missing.md">Placeholder</a>',
    '<link rel="stylesheet" as="image" ' +
      'imagesrcset="docs/missing.md 1x">',
    '<link rel="preload" as="script" ' +
      'imagesrcset="docs/missing.md 1x">',
    '<link rel="stylesheet" rel="preload" as="image" ' +
      'imagesrcset="docs/missing.md 1x">',
    '<link rel="preload" as="script" as="image" ' +
      'imagesrcset="docs/missing.md 1x">',
    "",
  ].join("\n");
  validateDocumentation(inert, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("rejects targets in effective single-URL HTML attributes", () => {
  for (const [label, markup] of [
    ...["a", "area", "base", "link"].map((element) => [
      element + "[href]",
      "<" + element + ' href="docs/missing.md"></' + element + ">",
    ]),
    ...["audio", "embed", "iframe", "img", "script", "source", "track",
      "video"].map((element) => [
      element + "[src]",
      "<" + element + ' src="docs/missing.md"></' + element + ">",
    ]),
    [
      "input[type=image][src]",
      '<input type="image" src="docs/missing.md">',
    ],
    ["video[poster]", '<video poster="docs/missing.md"></video>'],
    ["object[data]", '<object data="docs/missing.md"></object>'],
    ...["blockquote", "del", "ins", "q"].map((element) => [
      element + "[cite]",
      "<" + element + ' cite="docs/missing.md"></' + element + ">",
    ]),
    ["form[action]", '<form action="docs/missing.md"></form>'],
    [
      "button default [formaction]",
      '<button formaction="docs/missing.md">Submit</button>',
    ],
    [
      "button[type=submit][formaction]",
      '<button type="submit" formaction="docs/missing.md">Submit</button>',
    ],
    [
      "input[type=submit][formaction]",
      '<input type="submit" formaction="docs/missing.md">',
    ],
    [
      "input[type=image][formaction]",
      '<input type="image" formaction="docs/missing.md">',
    ],
  ]) {
    const active = currentContext();
    active.files["README.md"] += markup + "\n";
    assert.throws(
      () =>
        validateDocumentation(active, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      label,
    );
  }
});

test("uses the first effective input type for image source admission", () => {
  for (const markup of [
    '<input type="ImAgE" src="docs/missing.md">',
    '<input type="im&#97;ge" src="docs/missing.md">',
    '<input src="docs/missing.md" type="image">',
    '<input type="image" type="text" src="docs/missing.md">',
  ]) {
    const context = currentContext();
    context.files["README.md"] += markup + "\n";
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      markup,
    );
  }
});

test("rejects targets in effective URL-list HTML attributes", () => {
  for (const [label, markup] of [
    ["img[srcset]", '<img srcset="README.md 1x, docs/missing.md 2x">'],
    [
      "source[srcset]",
      '<source srcset="README.md 1x, docs/missing.md 2x">',
    ],
    [
      "link[imagesrcset]",
      '<link rel="preload" as="image" ' +
        'imagesrcset="README.md 1x, docs/missing.md 2x">',
    ],
    [
      "link[imagesrcset] before conditions",
      '<link imagesrcset="README.md 1x, docs/missing.md 2x" ' +
        'rel="pre&#108;oad" as="IMAGE">',
    ],
    [
      "a[ping]",
      '<a href="README.md" ping="README.md docs/missing.md">Home</a>',
    ],
    [
      "area[ping]",
      '<area href="README.md" ping="README.md docs/missing.md">',
    ],
    [
      "a[ping] before valueless href",
      '<a ping="README.md&#32;docs/missing.md" href>Home</a>',
    ],
  ]) {
    const context = currentContext();
    context.files["README.md"] += markup + "\n";
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      label,
    );
  }
});

test("validates only parsed srcset candidates", () => {
  for (const descriptor of [
    "2q",
    "0w",
    "-1x",
    "1w 2x",
    "1h",
    "1x 2x",
    "1w 2w",
    "(future)",
    "2X",
    "1.0w",
    "1.x",
  ]) {
    const inert = currentContext();
    inert.files["README.md"] +=
      '<img srcset="docs/not-real.md ' + descriptor + '">\n';
    validateDocumentation(inert, {
      expectedLicenseDigest: licenseDigest,
    });
  }

  for (const descriptor of ["", "1w", "1x", "0x", ".5x", "1e2x",
    "100w 200h"]) {
    const active = currentContext();
    active.files["README.md"] +=
      '<img srcset="docs/missing.md' +
      (descriptor.length === 0 ? "" : " " + descriptor) + '">\n';
    assert.throws(
      () =>
        validateDocumentation(active, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      descriptor,
    );
  }

  for (const srcset of [
    "README.md, docs/missing.md 2x",
    "README.md,, docs/missing.md 2x",
    "docs/not-real.md 2q, docs/missing.md 1x",
  ]) {
    const nextCandidate = currentContext();
    nextCandidate.files["README.md"] +=
      '<img srcset="' + srcset + '">\n';
    assert.throws(
      () =>
        validateDocumentation(nextCandidate, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      srcset,
    );
  }

  const invalidSecond = currentContext();
  invalidSecond.files["README.md"] +=
    '<img srcset="README.md 1x, docs/not-real.md 2q">\n';
  validateDocumentation(invalidSecond, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("ignores Markdown-like text inside HTML attributes", () => {
  const context = currentContext();
  context.files["README.md"] +=
    '<div title="[sample](docs/not-real.md)"></div>\n';
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("stops inline HTML tags at Markdown block boundaries", () => {
  for (const markup of [
    ['<span title="', "", '[Missing](docs/missing.md)">'],
    ['<span title="', '# [Missing](docs/missing.md)">'],
    ['- <span title="', '- [Missing](docs/missing.md)">'],
    ["Text <!-- open", "", "[Missing](docs/missing.md) -->"],
    ["Text <? open", "", "[Missing](docs/missing.md) ?>"],
    ["Text <!EXAMPLE open", "", "[Missing](docs/missing.md)>"],
    ["Text <![CDATA[open", "", "[Missing](docs/missing.md)]]>"],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [...markup, ""].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      markup.join("\n"),
    );
  }
});

test("requires whitespace between inline HTML attributes", () => {
  const context = currentContext();
  context.files["README.md"] +=
    '<span title="[Missing](docs/missing.md)"id=x>Text</span>\n';
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  for (const markup of [
    '<span title="[Missing](docs/missing.md)" id=x>Text</span>',
    '<span title="[Missing](docs/missing.md)"/>',
    '<span hidden title="[Missing](docs/missing.md)">',
    '<span title="safe"\n data-note="[Missing](docs/missing.md)">',
  ]) {
    const admitted = currentContext();
    admitted.files["README.md"] += markup + "\n";
    validateDocumentation(admitted, {
      expectedLicenseDigest: licenseDigest,
    });
  }
});

test("masks complete inline HTML non-tag constructs", () => {
  for (const construct of [
    "<? [Missing](docs/not-real.md) ?>",
    "<!EXAMPLE [Missing](docs/not-real.md)>",
    "<![CDATA[[Missing](docs/not-real.md)]]>",
    '<? <a href="docs/not-real.md"> ?>',
    '<!EXAMPLE <a href="docs/not-real.md">>',
    '<![CDATA[<a href="docs/not-real.md">]]>',
  ]) {
    const context = currentContext();
    context.files["README.md"] += "Before " + construct + " after\n";
    validateDocumentation(context, {
      expectedLicenseDigest: licenseDigest,
    });
  }
});

test("continues HTML scanning after incomplete non-tag constructs", () => {
  for (const opening of ["<? literal", "<![CDATA[ literal"]) {
    const context = currentContext();
    context.files["README.md"] += [
      "Before " + opening,
      '<a href="docs/missing.md">Missing</a>',
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      opening,
    );
  }

  const declaration = currentContext();
  declaration.files["README.md"] += [
    "Before <!EXAMPLE literal",
    "[Missing](docs/missing.md)",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(declaration, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("decodes legacy semicolonless references in HTML attributes", () => {
  const admitted = currentContext();
  admitted.ownedPaths.push("assets/x&.png");
  admitted.files["README.md"] += '<img src="assets/x&amp.png">\n';
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const decoy = currentContext();
  decoy.ownedPaths.push("assets/x&amp.png");
  decoy.files["README.md"] += '<img src="assets/x&amp.png">\n';
  assert.throws(
    () =>
      validateDocumentation(decoy, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const alphanumericBoundary = currentContext();
  alphanumericBoundary.ownedPaths.push("assets/x&ampx.png");
  alphanumericBoundary.files["README.md"] +=
    '<img src="assets/x&ampx.png">\n';
  validateDocumentation(alphanumericBoundary, {
    expectedLicenseDigest: licenseDigest,
  });

  const equalsBoundary = currentContext();
  equalsBoundary.ownedPaths.push("assets/x&amp=.png");
  equalsBoundary.files["README.md"] +=
    '<img src="assets/x&amp=.png">\n';
  validateDocumentation(equalsBoundary, {
    expectedLicenseDigest: licenseDigest,
  });

  const singlePass = currentContext();
  singlePass.ownedPaths.push("assets/x&copy.png");
  singlePass.files["README.md"] +=
    '<img src="assets/x&amp;copy.png">\n';
  validateDocumentation(singlePass, {
    expectedLicenseDigest: licenseDigest,
  });

  const numeric = currentContext();
  numeric.ownedPaths.push("assets/x&.png");
  numeric.files["README.md"] += '<img src="assets/x&#38.png">\n';
  validateDocumentation(numeric, {
    expectedLicenseDigest: licenseDigest,
  });

  const exactOnce = currentContext();
  exactOnce.ownedPaths.push("assets/x&amp;.png");
  exactOnce.files["README.md"] +=
    '<img src="assets/x&amp;amp;.png">\n';
  validateDocumentation(exactOnce, {
    expectedLicenseDigest: licenseDigest,
  });

  const doubleDecodedDecoy = currentContext();
  doubleDecodedDecoy.ownedPaths.push("assets/x&.png");
  doubleDecodedDecoy.files["README.md"] +=
    '<img src="assets/x&amp;amp;.png">\n';
  assert.throws(
    () =>
      validateDocumentation(doubleDecodedDecoy, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("ignores Markdown-like text inside raw HTML blocks", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "<pre>",
    "[sample](docs/not-real.md)",
    "</pre>",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });

  const comment = currentContext();
  comment.files["README.md"] += [
    "<!-- open",
    "",
    "[sample](docs/not-real.md)",
    "-->",
    "",
  ].join("\n");
  validateDocumentation(comment, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("parses HTML before code spans inside raw blocks", () => {
  const rawBlock = currentContext();
  rawBlock.files["README.md"] += [
    "<div>",
    '`<img src="docs/missing.md">`',
    "</div>",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(rawBlock, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const rawAnchor = currentContext();
  rawAnchor.files["README.md"] += [
    "<div>",
    '`<a id="raw-anchor"></a>`',
    "</div>",
    "",
    "[Anchor](#raw-anchor)",
    "",
  ].join("\n");
  validateDocumentation(rawAnchor, {
    expectedLicenseDigest: licenseDigest,
  });

  const inlineCode = currentContext();
  inlineCode.files["README.md"] +=
    '`<img src="docs/not-real.md">`\n';
  validateDocumentation(inlineCode, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("ignores apparent HTML tags inside raw-text elements", () => {
  for (const element of [
    "iframe",
    "noembed",
    "noframes",
    "script",
    "style",
    "textarea",
    "title",
    "xmp",
  ]) {
    const context = currentContext();
    context.files["README.md"] += [
      "<" + element + ">",
      '<img src="docs/not-real.md">',
      "</" + element + ">",
      "",
    ].join("\n");
    assert.doesNotThrow(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      element,
    );
  }
});

test("parses active child tags inside pre elements", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "<pre>",
    '<img src="docs/missing.md">',
    "</pre>",
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

test("keeps template contents inert and the template element active", () => {
  const fakeAnchor = currentContext();
  fakeAnchor.files["README.md"] += [
    "[Missing](#fake)",
    "",
    '<template id="template-anchor">',
    '<a id="fake"></a>',
    "<template>",
    '<a id="nested-fake"></a>',
    "</template>",
    '<img src="docs/not-real.md">',
    "</template>",
    "",
    "[Template](#template-anchor)",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(fakeAnchor, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const inertContents = currentContext();
  inertContents.files["README.md"] += [
    '<template id="template-anchor">',
    '<a id="fake"></a>',
    "<template>",
    '<img src="docs/not-real.md">',
    "</template>",
    "</template>",
    "",
    "[Template](#template-anchor)",
    "",
  ].join("\n");
  validateDocumentation(inertContents, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("requires exact type-one raw HTML block end tags", () => {
  for (const element of ["pre", "script", "style", "textarea"]) {
    const whitespaceVariant = currentContext();
    whitespaceVariant.files["README.md"] += [
      "<" + element + ">",
      "</" + element + " >",
      "[Missing](docs/not-real.md)",
      "</" + element + ">",
      "",
    ].join("\n");
    validateDocumentation(whitespaceVariant, {
      expectedLicenseDigest: licenseDigest,
    });
  }

  const mismatchedExactEnd = currentContext();
  mismatchedExactEnd.files["README.md"] += [
    "<pre>",
    "</ScRiPt>",
    "[Missing](docs/not-real.md)",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(mismatchedExactEnd, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("ignores Markdown-like text inside every terminated raw HTML block", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "<?example",
    "[instruction](docs/not-real.md)",
    '<img src="docs/not-real.md">',
    "?>",
    "",
    "<!EXAMPLE",
    "[declaration](docs/not-real.md)",
    '<img src="docs/not-real.md">',
    ">",
    "",
    "<![CDATA[",
    "[cdata](docs/not-real.md)",
    '<img src="docs/not-real.md">',
    "]]>",
    "",
    "<custom-element>",
    "[generic](docs/not-real.md)",
    "</custom-element>",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("does not let a generic HTML tag interrupt a paragraph", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "Paragraph text",
    "<custom-element>",
    "[active](docs/not-real.md)",
    "</custom-element>",
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

test("ends raw HTML when its Markdown container ends", () => {
  for (const block of [
    ["- <div>", "[Missing](docs/not-real.md)"],
    ["- <div>", "- [Missing](docs/not-real.md)"],
    ["> <div>", "[Missing](docs/not-real.md)"],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [...block, ""].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
    );
  }

  const continued = currentContext();
  continued.files["README.md"] += [
    "- <div>",
    "  [inactive](docs/not-real.md)",
    "",
  ].join("\n");
  validateDocumentation(continued, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("retains attributes on raw-text opening tags", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "<script",
    '  src="docs/not-real.md">',
    'const sample = \'<img src="README.md">\';',
    "</script>",
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

test("ignores fenced HTML after nested list markers", () => {
  for (const fence of [
    [
      "- - ```html",
      '    <img src="docs/missing.md">',
      "    ```",
    ],
    [
      "- > ```html",
      '  > <img src="docs/missing.md">',
      "  > ```",
    ],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [...fence, ""].join("\n");
    validateDocumentation(context, {
      expectedLicenseDigest: licenseDigest,
    });
  }
});

test("validates escaped reference destinations", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: <docs/missing\\> file.md>",
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

test("admits empty angle-bracket reference destinations", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += [
    "# [Foo][empty]",
    "",
    "[empty]: <>",
    "",
  ].join("\n");
  admitted.files["README.md"] += "[Foo](PRIVACY.md#foo)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += [
    "# [Foo][empty]",
    "",
    "[empty]: <>",
    "",
  ].join("\n");
  rejected.files["README.md"] += "[Literal](PRIVACY.md#fooempty)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("enforces reference title and destination parenthesis bounds", () => {
  const nestedTitle = currentContext();
  nestedTitle.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: docs/not-real.md (outer (inner))",
    "",
  ].join("\n");
  validateDocumentation(nestedTitle, {
    expectedLicenseDigest: licenseDigest,
  });

  const escapedTitle = currentContext();
  escapedTitle.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: docs/missing.md (outer \\(inner\\))",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(escapedTitle, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const depth32 =
    "docs/missing.md" + "(".repeat(32) + "x" + ")".repeat(32);
  const admitted = currentContext();
  admitted.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: " + depth32,
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(admitted, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const depth33 =
    "docs/not-real.md" + "(".repeat(33) + "x" + ")".repeat(33);
  const rejected = currentContext();
  rejected.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: " + depth33,
    "",
  ].join("\n");
  validateDocumentation(rejected, {
    expectedLicenseDigest: licenseDigest,
  });

  const escapedPrefix =
    "docs/not-real.md\\(" + "(".repeat(33) + "x" + ")".repeat(32);
  const escapeBoundary = currentContext();
  escapeBoundary.files["README.md"] += [
    "[Missing][target]",
    "",
    "[target]: " + escapedPrefix,
    "",
  ].join("\n");
  validateDocumentation(escapeBoundary, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("validates only the selected active reference definition", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "[Home][selected]",
    "",
    "[selected]: README.md",
    "[selected]: docs/not-real.md",
    "[unused]: docs/not-real.md",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("does not parse reference definitions inside open paragraphs", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "",
    "Paragraph",
    "[ref]: docs/missing.md",
    "[use][ref]",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("retains list containers for lazy paragraph continuations", () => {
  const lazy = currentContext();
  lazy.files["README.md"] += [
    "- Paragraph",
    "[ref]: docs/missing.md",
    "[use][ref]",
    "",
  ].join("\n");
  validateDocumentation(lazy, {
    expectedLicenseDigest: licenseDigest,
  });

  const separated = currentContext();
  separated.files["README.md"] += [
    "- Paragraph",
    "",
    "[ref]: docs/missing.md",
    "[use][ref]",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(separated, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("retains block quotes for lazy paragraph continuations", () => {
  const lazy = currentContext();
  lazy.files["README.md"] += [
    "> Paragraph",
    "[ref]: docs/missing.md",
    "[use][ref]",
    "",
  ].join("\n");
  validateDocumentation(lazy, {
    expectedLicenseDigest: licenseDigest,
  });

  const separated = currentContext();
  separated.files["README.md"] += [
    "> Paragraph",
    "",
    "[ref]: docs/missing.md",
    "[use][ref]",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(separated, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("rejects non-punctuation destination escapes", () => {
  for (const markdown of [
    "[Missing](docs/not\\ real.md)",
    "[Missing][ref]\n\n[ref]: docs/not\\ real.md",
  ]) {
    const context = currentContext();
    context.files["README.md"] += markdown + "\n";
    validateDocumentation(context, {
      expectedLicenseDigest: licenseDigest,
    });
  }

  const punctuation = currentContext();
  punctuation.files["README.md"] +=
    "[Missing](docs/not\\(real\\).md)\n";
  assert.throws(
    () =>
      validateDocumentation(punctuation, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("does not resolve GFM footnotes as ordinary references", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "Footnote.[^1]",
    "",
    "[^1]: Missing",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });

  const activeBodyLink = currentContext();
  activeBodyLink.files["README.md"] += [
    "Footnote.[^1]",
    "",
    "[^1]: [Missing](docs/missing.md)",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(activeBodyLink, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("rejects unescaped brackets in reference labels", () => {
  const literal = currentContext();
  literal.files["README.md"] += [
    "[use][foo[bar]] [foo[bar]] [foo[bar]][]",
    "",
    "[foo\\[bar\\]]: docs/missing.md",
    "",
  ].join("\n");
  validateDocumentation(literal, {
    expectedLicenseDigest: licenseDigest,
  });

  const invalidDefinition = currentContext();
  invalidDefinition.files["README.md"] += [
    "[use][foo\\[bar\\]]",
    "",
    "[foo[bar]]: docs/missing.md",
    "",
  ].join("\n");
  validateDocumentation(invalidDefinition, {
    expectedLicenseDigest: licenseDigest,
  });

  const escaped = currentContext();
  escaped.files["README.md"] += [
    "[use][foo\\[bar\\]]",
    "",
    "[foo\\[bar\\]]: docs/missing.md",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(escaped, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("counts Unicode code points in reference-label bounds", () => {
  for (const length of [500, 999]) {
    const label = "\u{1f642}".repeat(length);
    const active = currentContext();
    active.files["README.md"] += [
      "[use][" + label + "]",
      "",
      "[" + label + "]: docs/missing.md",
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(active, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      String(length),
    );
  }

  const oversizedLabel = "\u{1f642}".repeat(1000);
  const inactive = currentContext();
  inactive.files["README.md"] += [
    "[use][" + oversizedLabel + "]",
    "",
    "[" + oversizedLabel + "]: docs/missing.md",
    "",
  ].join("\n");
  validateDocumentation(inactive, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("applies full non-Turkic Unicode case folding to reference labels", () => {
  for (const [useLabel, definitionLabel] of [
    ["ẞ", "SS"],
    ["İ", "i\u0307"],
    ["ς", "σ"],
    ["ﬃ", "FFI"],
  ]) {
    const equivalent = currentContext();
    equivalent.files["README.md"] += [
      "[" + useLabel + "]",
      "",
      "[" + definitionLabel + "]: docs/missing.md",
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(equivalent, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
    );
  }

  const dotless = currentContext();
  dotless.files["README.md"] += [
    "[I]",
    "",
    "[ı]: docs/missing.md",
    "",
  ].join("\n");
  validateDocumentation(dotless, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("masks next-line reference titles", () => {
  for (const definition of [
    [
      "[selected]: README.md",
      '  "title [sample](docs/not-real.md)"',
    ],
    [
      "[selected]:",
      "  README.md",
      '  "title [sample](docs/not-real.md)"',
    ],
    [
      "- [selected]: README.md",
      '  "title [sample](docs/not-real.md)"',
    ],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [
      "[Home][selected]",
      "",
      ...definition,
      "",
    ].join("\n");
    validateDocumentation(context, {
      expectedLicenseDigest: licenseDigest,
    });
  }
});

test("validates multiline reference-definition titles", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "[use][ref]",
    "",
    '[ref]: docs/missing.md "title',
    " continued",
    ' still"',
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(context, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const nextLineTitle = currentContext();
  nextLineTitle.files["README.md"] += [
    "[use][ref]",
    "",
    "[ref]: README.md",
    ' "title',
    ' continued [sample](docs/not-real.md)"',
    "",
  ].join("\n");
  validateDocumentation(nextLineTitle, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("keeps block-like lines inside open reference titles", () => {
  const blockLikeTitle = currentContext();
  blockLikeTitle.files["README.md"] += [
    "[use][ref]",
    "",
    '[ref]: docs/missing.md "title',
    '# continued"',
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(blockLikeTitle, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const maskedHeading = currentContext();
  maskedHeading.files["PRIVACY.md"] += [
    '[ref]: README.md "title',
    '# hidden"',
    "",
  ].join("\n");
  maskedHeading.files["README.md"] +=
    "[Hidden](PRIVACY.md#hidden)\n";
  assert.throws(
    () =>
      validateDocumentation(maskedHeading, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const deepContinuation = currentContext();
  deepContinuation.files["README.md"] += [
    "[use][ref]",
    "",
    "[ref]:",
    "          docs/missing.md",
    "               'title'",
    "",
  ].join("\n");
  assert.throws(
    () =>
      validateDocumentation(deepContinuation, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );
});

test("parses and masks multiline reference-definition labels", () => {
  for (const definition of [
    ["[foo", "bar]: docs/missing.md"],
    ["[", "foo", "]: docs/missing.md"],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [
      "[use][foo bar]",
      "[use][foo]",
      "",
      ...definition,
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      definition.join("\n"),
    );
  }

  const maskedHeading = currentContext();
  maskedHeading.files["PRIVACY.md"] += [
    "[foo",
    "# hidden",
    "]: README.md",
    "",
  ].join("\n");
  maskedHeading.files["README.md"] +=
    "[Hidden](PRIVACY.md#hidden)\n";
  assert.throws(
    () =>
      validateDocumentation(maskedHeading, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("keeps reference continuations in their Markdown container", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "[selected]: README.md",
    '- "title [Missing](docs/not-real.md)"',
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

test("validates reference definitions inside block quotes", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "> [Missing][target]",
    ">",
    "> [target]: docs/missing.md",
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

test("validates reference definitions after list markers", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "- [target]: docs/missing.md",
    "",
    "[Missing][target]",
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

test("validates reference definitions after alternating containers", () => {
  for (const definition of [
    "- > [target]: docs/missing.md",
    "> - > [target]: docs/missing.md",
  ]) {
    const context = currentContext();
    context.files["README.md"] += [
      definition,
      "",
      "[Missing][target]",
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
    );
  }
});

test("validates reference destinations on the following line", () => {
  for (const definition of [
    ["[target]:", "  docs/missing.md"],
    ["> [target]:", ">   docs/missing.md"],
    ["- [target]:", "    docs/missing.md"],
  ]) {
    const context = currentContext();
    context.files["README.md"] += [
      "",
      ...definition,
      "",
      "[Missing][target]",
      "",
    ].join("\n");
    assert.throws(
      () =>
        validateDocumentation(context, {
          expectedLicenseDigest: licenseDigest,
        }),
      /broken local link/u,
      definition.join(" | "),
    );
  }
});

test("decodes Markdown escapes in local destinations", () => {
  const context = currentContext();
  context.files["README.md"] +=
    "[Engineering](docs/ENGINEERING\\.md)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("decodes character references in local destinations", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "[Decimal](docs/ENGINEERING&#46;md)",
    "[Hexadecimal](docs/ENGINEERING&#x2e;md)",
    "[Named](docs&sol;ENGINEERING&period;md)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("recognizes Setext heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "",
    "Evaluation data",
    "---------------",
    "",
  ].join("\n");
  context.files["README.md"] +=
    "[Evaluation](PRIVACY.md#evaluation-data)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("avoids collisions with generated heading suffixes", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "",
    "# Foo",
    "# Foo",
    "# Foo-1",
    "",
  ].join("\n");
  context.files["README.md"] +=
    "[Allocated suffix](PRIVACY.md#foo-1-1)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("collects complete multiline Setext heading paragraphs", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "First line",
    "second line",
    "-----------",
    "",
    "First adjacent",
    "==============",
    "Second adjacent",
    "---------------",
    "",
  ].join("\n");
  context.files["README.md"] += [
    "[Multiline](PRIVACY.md#first-line-second-line)",
    "[First adjacent](PRIVACY.md#first-adjacent)",
    "[Second adjacent](PRIVACY.md#second-adjacent)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("keeps Setext heading paragraphs in one Markdown container", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += [
    "- First line",
    "- Second line",
    "  -----------",
    "",
  ].join("\n");
  admitted.files["README.md"] += "[Second](PRIVACY.md#second-line)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += [
    "- First line",
    "- Second line",
    "  -----------",
    "",
  ].join("\n");
  rejected.files["README.md"] +=
    "[Combined](PRIVACY.md#first-line-second-line)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("decodes character references in explicit anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += '<a id="exact&#45;anchor"></a>\n';
  context.files["README.md"] += "[Exact](PRIVACY.md#exact-anchor)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("admits legacy name fragments only on anchor elements", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += '<a name="legacy"></a>\n';
  admitted.files["README.md"] += "[Legacy](PRIVACY.md#legacy)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += '<div name="fake"></div>\n';
  rejected.files["README.md"] += "[Fake](PRIVACY.md#fake)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("decodes the complete named character-reference registry", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += '<a id="exact&copy;"></a>\n';
  context.files["README.md"] += "[Exact](PRIVACY.md#exact%C2%A9)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("applies HTML control mappings to numeric references", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += '<a id="exact&#128;"></a>\n';
  context.files["README.md"] += "[Exact](PRIVACY.md#exact%E2%82%AC)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("recognizes heading anchors inside Markdown containers", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "",
    "> # Quoted ATX heading",
    ">",
    "> Quoted Setext heading",
    "> ---------------------",
    "",
    "- # Listed ATX heading",
    "- Listed Setext heading",
    "  ---------------------",
    "",
    "> - Nested Setext heading",
    ">   ---------------------",
    "",
    "- > # Alternating heading",
    "",
  ].join("\n");
  context.files["README.md"] += [
    "[Quoted ATX](PRIVACY.md#quoted-atx-heading)",
    "[Quoted Setext](PRIVACY.md#quoted-setext-heading)",
    "[Listed ATX](PRIVACY.md#listed-atx-heading)",
    "[Listed Setext](PRIVACY.md#listed-setext-heading)",
    "[Nested Setext](PRIVACY.md#nested-setext-heading)",
    "[Alternating](PRIVACY.md#alternating-heading)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("derives heading anchors from rendered link labels", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "",
    "# [Evaluation](https://example.com) and [policy][policy]",
    "",
    "[policy]: https://example.com/policy",
    "",
  ].join("\n");
  context.files["README.md"] +=
    "[Evaluation policy](PRIVACY.md#evaluation-and-policy)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("removes HTML comment bytes from heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] +=
    "## Evaluation <!-- note --> data\n";
  context.files["README.md"] +=
    "[Evaluation](PRIVACY.md#evaluation--data)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("preserves inactive outer link syntax in heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] +=
    "# [outer [inner](https://example.com)](README.md)\n";
  context.files["README.md"] +=
    "[Nested](PRIVACY.md#outer-innerreadmemd)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] +=
    "# [outer [inner](https://example.com)](README.md)\n";
  rejected.files["README.md"] += "[Nested](PRIVACY.md#outer-inner)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("preserves visible autolink text in heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "## <https://example.com>",
    "## <maintainer@example.com>",
    "",
  ].join("\n");
  context.files["README.md"] += [
    "[URI](PRIVACY.md#httpsexamplecom)",
    "[Email](PRIVACY.md#maintainerexamplecom)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("normalizes code-span whitespace in heading anchors", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += "# `foo   bar`\n";
  admitted.files["README.md"] += "[Code](PRIVACY.md#foo-bar)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += "# `foo   bar`\n";
  rejected.files["README.md"] += "[Code](PRIVACY.md#foo---bar)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("preserves emphasis delimiters rendered by heading code spans", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += "# `_x_`\n";
  admitted.files["README.md"] += "[Literal](PRIVACY.md#_x_)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += "# `_x_`\n";
  rejected.files["README.md"] += "[Emphasis](PRIVACY.md#x)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );
});

test("preserves heading code-span literals through inline parsing", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "# `<span>`",
    "# `&amp;`",
    "# `` ` `` _Visible_ `",
    "",
  ].join("\n");
  context.files["README.md"] += [
    "[Tag literal](PRIVACY.md#span)",
    "[Reference literal](PRIVACY.md#amp)",
    "[Backtick literal](PRIVACY.md#visible)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("preserves escaped tag text in heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += "# \\<span>\n";
  context.files["README.md"] += "[Span](PRIVACY.md#span)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("preserves non-tag angle text in heading anchors", () => {
  const admitted = currentContext();
  admitted.files["PRIVACY.md"] += "# 1 < 2 > 0\n";
  admitted.files["README.md"] +=
    "[Comparison](PRIVACY.md#1--2--0)\n";
  validateDocumentation(admitted, {
    expectedLicenseDigest: licenseDigest,
  });

  const rejected = currentContext();
  rejected.files["PRIVACY.md"] += "# 1 < 2 > 0\n";
  rejected.files["README.md"] +=
    "[Comparison](PRIVACY.md#1--0)\n";
  assert.throws(
    () =>
      validateDocumentation(rejected, {
        expectedLicenseDigest: licenseDigest,
      }),
    /fragment/u,
  );

  const tagged = currentContext();
  tagged.files["PRIVACY.md"] +=
    "# Before <span>inside</span> after\n";
  tagged.files["README.md"] +=
    "[Tagged](PRIVACY.md#before-inside-after)\n";
  validateDocumentation(tagged, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("removes emphasis delimiters from heading anchors", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] +=
    "# _Emphasized heading_ and snake_case\n";
  context.files["README.md"] +=
    "[Emphasis](PRIVACY.md#emphasized-heading-and-snake_case)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("preserves unmatched emphasis delimiter characters", () => {
  const context = currentContext();
  context.files["PRIVACY.md"] += [
    "# __foo_",
    "# ___bar__",
    "# __baz___",
    "",
  ].join("\n");
  context.files["README.md"] += [
    "[Long opener](PRIVACY.md#_foo)",
    "[Strong long opener](PRIVACY.md#_bar)",
    "[Strong long closer](PRIVACY.md#baz_)",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
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

test("ignores inactive outer destinations in nested links", () => {
  const context = currentContext();
  context.files["README.md"] +=
    "[outer [inner](README.md)](docs/not-real.md)\n";
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
});

test("recognizes nested reference links and images", () => {
  const inactiveOuter = currentContext();
  inactiveOuter.files["README.md"] += [
    "[outer [inner][home]](docs/not-real.md)",
    "",
    "[home]: README.md",
    "",
  ].join("\n");
  validateDocumentation(inactiveOuter, {
    expectedLicenseDigest: licenseDigest,
  });

  const activeOuter = currentContext();
  activeOuter.files["README.md"] +=
    "[outer ![image](README.md)](docs/not-real.md)\n";
  assert.throws(
    () =>
      validateDocumentation(activeOuter, {
        expectedLicenseDigest: licenseDigest,
      }),
    /broken local link/u,
  );

  const imageDescription = currentContext();
  imageDescription.files["README.md"] +=
    "![outer [inner](docs/not-real.md)](README.md)\n";
  validateDocumentation(imageDescription, {
    expectedLicenseDigest: licenseDigest,
  });

  const missingImage = currentContext();
  missingImage.files["README.md"] +=
    "![outer [inner](README.md)](docs/not-real.md)\n";
  assert.throws(
    () =>
      validateDocumentation(missingImage, {
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
