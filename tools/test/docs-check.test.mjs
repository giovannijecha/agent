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

test("ignores Markdown-like text inside HTML attributes", () => {
  const context = currentContext();
  context.files["README.md"] +=
    '<div title="[sample](docs/not-real.md)"></div>\n';
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
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
});

test("ignores apparent HTML tags inside raw-text elements", () => {
  const context = currentContext();
  context.files["README.md"] += [
    "<script>",
    'const sample = \'<img src="docs/not-real.md">\';',
    "</script>",
    "",
  ].join("\n");
  validateDocumentation(context, {
    expectedLicenseDigest: licenseDigest,
  });
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
