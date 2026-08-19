import { createHash } from "node:crypto";
import path from "node:path";

const INDEX_PATH = "docs/manual/README.md";
const COMMAND_SOURCE = "packages/agent-cli/src/commands.ts";
const TOOL_SOURCE = "packages/agent-cli/src/builtin-tools.ts";
const PRODUCT_SOURCE = /^packages\/[a-z0-9-]+\/src\/[a-z0-9-]+\.ts$/u;

export class ManualPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "ManualPolicyError";
  }
}

function fail(message) {
  throw new ManualPolicyError(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) {
    fail(label + " must be an object");
  }
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    fail(label + " keys mismatch");
  }
}

function unique(values, label) {
  if (new Set(values).size !== values.length) {
    fail(label + " must not contain duplicates");
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function same(left, right, label) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail(label + " mismatch");
  }
}

function ownedPath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value)
  ) {
    fail(label + " must be a repository-relative path");
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === ".." || normalized.startsWith("../")) {
    fail(label + " escapes or is not normalized");
  }
  return value;
}

function fileText(context, file) {
  if (!isRecord(context.files) || typeof context.files[file] !== "string") {
    fail("manual input is missing: " + file);
  }
  return context.files[file];
}

function stringList(value, label, pattern) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(label + " must be a non-empty array");
  }
  for (const entry of value) {
    if (typeof entry !== "string" || !pattern.test(entry)) {
      fail(label + " contains an invalid entry");
    }
  }
  unique(value, label);
  same(value, sorted(value), label + " order");
  return value;
}

function sectionList(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    fail("manual chapter sections must be a bounded non-empty array");
  }
  for (const section of value) {
    if (
      typeof section !== "string" ||
      section.length === 0 ||
      section.length > 80 ||
      /[\r\n\u0000-\u001f\u007f]/u.test(section)
    ) {
      fail("manual chapter section is invalid");
    }
  }
  unique(value, "manual chapter sections");
  return value;
}

function extractCommands(source) {
  const commands = [];
  const pattern = /"(\/[a-z][a-z0-9-]*)(?:\s[^"\r\n]*)?"/gu;
  for (const match of source.matchAll(pattern)) {
    const command = match.at(1);
    if (command !== undefined && !commands.includes(command)) {
      commands.push(command);
    }
  }
  return sorted(commands);
}

function extractToolContracts(source) {
  const tools = [];
  const pattern =
    /\bdescriptor\(\s*"([a-z][a-z0-9_]{0,63})"\s*,\s*"[^"\r\n]+"\s*,\s*"(read|write|execute)"/gu;
  for (const match of source.matchAll(pattern)) {
    const name = match.at(1);
    const risk = match.at(2);
    if (name !== undefined && risk !== undefined) {
      tools.push({ name, risk });
    }
  }
  const descriptorTokens = [...source.matchAll(/\bdescriptor\s*\(/gu)].length;
  const descriptorDeclarations = [
    ...source.matchAll(/\bfunction\s+descriptor\s*\(/gu),
  ].length;
  if (
    descriptorDeclarations !== 1 ||
    descriptorTokens - descriptorDeclarations !== tools.length
  ) {
    fail("tool descriptor source contains unsupported syntax");
  }
  return tools.sort((left, right) => left.name.localeCompare(right.name, "en"));
}

function validateToolSurface(surface) {
  exactKeys(surface, ["tools"], "manual tool surface");
  if (
    !Array.isArray(surface.tools) ||
    surface.tools.length === 0 ||
    surface.tools.length > 32
  ) {
    fail("manual tool surface contract is invalid");
  }

  const names = [];
  const capabilities = [];
  const necessities = [];
  for (const tool of surface.tools) {
    exactKeys(
      tool,
      ["capability", "name", "necessity", "risk"],
      "manual tool",
    );
    if (
      typeof tool.name !== "string" ||
      !/^[a-z][a-z0-9_]{0,63}$/u.test(tool.name) ||
      typeof tool.capability !== "string" ||
      !/^[a-z][a-z0-9-]{0,63}$/u.test(tool.capability) ||
      (tool.risk !== "read" && tool.risk !== "write" && tool.risk !== "execute") ||
      typeof tool.necessity !== "string" ||
      tool.necessity !== tool.necessity.trim() ||
      tool.necessity.length < 20 ||
      tool.necessity.length > 240 ||
      /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(tool.necessity)
    ) {
      fail("manual tool contract is invalid");
    }
    names.push(tool.name);
    capabilities.push(tool.capability);
    necessities.push(tool.necessity);
  }
  unique(names, "manual tool names");
  unique(capabilities, "manual tool capabilities");
  unique(necessities, "manual tool necessities");
  same(names, sorted(names), "manual tool order");
  return surface.tools;
}

function verifyDescriptorConstruction(context) {
  const productSources = context.ownedPaths.filter((file) =>
    PRODUCT_SOURCE.test(file),
  );
  if (productSources.length === 0) {
    fail("product source inventory is empty");
  }
  let creationReferences = 0;
  for (const file of productSources) {
    const source = fileText(context, file);
    const references = [
      ...source.matchAll(/\bToolDescriptor\s*\.\s*create\b/gu),
    ].length;
    if (references > 0 && file !== TOOL_SOURCE) {
      fail("tool descriptor construction escapes the registered source");
    }
    creationReferences += references;
  }
  if (creationReferences !== 1) {
    fail("tool descriptor construction count is invalid");
  }
}

function normalizedProse(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function verifyToolConvergence(tools, context) {
  const filesystemTools = tools.filter((tool) => tool.risk !== "execute");
  const privacy = normalizedProse(fileText(context, "PRIVACY.md"));
  const maintenance = normalizedProse(
    fileText(context, "docs/MAINTENANCE.md"),
  );
  if (
    filesystemTools.length !== 5 ||
    !privacy.includes(
      "The five filesystem tools share the one canonical workspace selected at startup",
    ) ||
    !maintenance.includes(
      "restore both previous descriptors and their planners before removing `apply_patch`",
    ) ||
    !maintenance.includes(
      "Never advertise either old tool beside `apply_patch`",
    ) ||
    !maintenance.includes("To remove all mutation authority instead") ||
    !maintenance.includes(
      "remove `manage_path` advertisement and manual inventory",
    )
  ) {
    fail("manual tool convergence contract is incomplete");
  }
}

function verifyRemovalSchemaGuidance(policy, context) {
  const maintenance = normalizedProse(
    fileText(context, "docs/MAINTENANCE.md"),
  );
  if (
    !maintenance.includes(
      "replace manual-policy schema " + String(policy.schemaVersion) +
        " with a schema that removes the advertised tool inventory",
    )
  ) {
    fail("manual removal schema guidance is stale");
  }
}

function verifySelectorDismissal(contract, context) {
  exactKeys(
    contract,
    ["algorithm", "path", "sha256"],
    "manual selector dismissal contract",
  );
  if (
    contract.algorithm !== "sha256" ||
    contract.path !== "docs/manual/03-terminal-interface.md" ||
    typeof contract.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(contract.sha256)
  ) {
    fail("manual selector dismissal contract is invalid");
  }
  ownedPath(contract.path, "manual selector dismissal path");
  const terminal = normalizedProse(
    fileText(context, contract.path),
  );
  const digest = createHash("sha256")
    .update(
      fileText(context, contract.path).replaceAll("\r\n", "\n"),
      "utf8",
    )
    .digest("hex");
  if (
    digest !== contract.sha256 ||
    terminal.includes(
      "An ordinary editor input closes a dismissible selector and is consumed",
    ) ||
    !terminal.includes(
      "Printable and editing input is inert while a dismissible selector owns focus",
    ) ||
    !terminal.includes(
      "Escape or Ctrl+C cancels the menu and restores the unchanged draft",
    )
  ) {
    fail("manual selector dismissal contract is inconsistent");
  }
}

function verifyChapter(chapter, index, context) {
  exactKeys(chapter, ["path", "sections", "title"], "manual chapter");
  const expectedPrefix = String(index).padStart(2, "0");
  if (
    typeof chapter.path !== "string" ||
    !chapter.path.startsWith("docs/manual/" + expectedPrefix + "-") ||
    !chapter.path.endsWith(".md")
  ) {
    fail("manual chapter path is not sequential");
  }
  ownedPath(chapter.path, "manual chapter path");
  if (
    typeof chapter.title !== "string" ||
    !chapter.title.startsWith(expectedPrefix + " - ") ||
    chapter.title.includes("\n")
  ) {
    fail("manual chapter title is invalid");
  }

  const text = fileText(context, chapter.path);
  if (!text.startsWith("# " + chapter.title + "\n")) {
    fail("manual chapter title does not match its registry");
  }
  const headings = [...text.matchAll(/^## ([^\r\n]+)$/gmu)].map(
    (match) => match.at(1),
  );
  same(headings, sectionList(chapter.sections), "manual chapter section order");
  return text;
}

function verifyIndex(policy, context) {
  const indexText = fileText(context, policy.index);
  if (!indexText.startsWith("# Agent operator manual\n")) {
    fail("manual index title is invalid");
  }
  let previous = -1;
  for (const chapter of policy.chapters) {
    const target = path.posix.relative(
      path.posix.dirname(policy.index),
      chapter.path,
    );
    const token = "](" + target + ")";
    const position = indexText.indexOf(token);
    if (position < 0 || position <= previous || indexText.indexOf(token, position + 1) >= 0) {
      fail("manual index chapter links are missing, duplicated, or out of order");
    }
    previous = position;
  }
}

function verifyLinks(policy, context) {
  const owned = new Set(context.ownedPaths);
  const documents = [policy.index, ...policy.chapters.map((chapter) => chapter.path)];
  const linkPattern = /\[[^\]\r\n]*\]\(([^)\r\n]+)\)/gu;
  for (const document of documents) {
    const text = fileText(context, document);
    for (const match of text.matchAll(linkPattern)) {
      const raw = match.at(1);
      if (raw === undefined || raw.length === 0) {
        fail("manual contains an empty link");
      }
      if (raw.startsWith("https://") || raw.startsWith("#")) {
        continue;
      }
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(raw) || raw.startsWith("/")) {
        fail("manual contains an unsupported link scheme");
      }
      const targetPart = raw.split("#", 1).at(0);
      if (targetPart === undefined || targetPart.length === 0) {
        continue;
      }
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(document), targetPart),
      );
      if (resolved === ".." || resolved.startsWith("../") || !owned.has(resolved)) {
        fail("manual contains a broken or escaping local link");
      }
    }
  }
}

/** Validates the complete offline contract of the owned operator manual. */
export function validateManualPolicy(policy, context) {
  exactKeys(
    policy,
    [
      "schemaVersion",
      "index",
      "chapters",
      "commands",
      "selectorDismissal",
      "toolSurface",
      "referencePaths",
    ],
    "manual policy",
  );
  if (policy.schemaVersion !== 11 || policy.index !== INDEX_PATH) {
    fail("unsupported manual policy schema or index");
  }
  if (!isRecord(context) || !Array.isArray(context.manualPaths) || !Array.isArray(context.ownedPaths)) {
    fail("manual validation context is invalid");
  }
  if (!Array.isArray(policy.chapters) || policy.chapters.length === 0 || policy.chapters.length > 32) {
    fail("manual chapter registry size is invalid");
  }

  const chapterTexts = policy.chapters.map((chapter, index) =>
    verifyChapter(chapter, index, context),
  );
  const chapterPaths = policy.chapters.map((chapter) => chapter.path);
  unique(chapterPaths, "manual chapter paths");
  unique(policy.chapters.map((chapter) => chapter.title), "manual chapter titles");
  same(
    sorted(context.manualPaths),
    sorted([policy.index, ...chapterPaths]),
    "manual Markdown file set",
  );

  const commands = stringList(policy.commands, "manual commands", /^\/[a-z][a-z0-9-]*$/u);
  const tools = validateToolSurface(policy.toolSurface);
  verifyDescriptorConstruction(context);
  verifyRemovalSchemaGuidance(policy, context);
  verifySelectorDismissal(policy.selectorDismissal, context);
  same(commands, extractCommands(fileText(context, COMMAND_SOURCE)), "manual command source inventory");
  same(
    tools.map((tool) => ({ name: tool.name, risk: tool.risk })),
    extractToolContracts(fileText(context, TOOL_SOURCE)),
    "manual tool source inventory",
  );
  verifyToolConvergence(tools, context);

  if (!Array.isArray(policy.referencePaths) || policy.referencePaths.length === 0) {
    fail("manual reference paths must be a non-empty array");
  }
  for (const referencePath of policy.referencePaths) {
    ownedPath(referencePath, "manual reference path");
  }
  unique(policy.referencePaths, "manual reference paths");
  const owned = new Set(context.ownedPaths);
  for (const referencePath of policy.referencePaths) {
    if (!owned.has(referencePath)) {
      fail("manual reference path does not exist");
    }
  }

  const allManualText = [fileText(context, policy.index), ...chapterTexts].join("\n");
  for (const capability of commands) {
    if (!allManualText.includes("`" + capability + "`")) {
      fail("manual capability inventory is incomplete");
    }
  }
  for (const tool of tools) {
    const row =
      "| `" + tool.name + "` | `" + tool.capability + "` | `" +
      tool.risk + "` | " + tool.necessity + " |";
    if (
      !allManualText.includes(row) ||
      allManualText.indexOf(row) !== allManualText.lastIndexOf(row)
    ) {
      fail("manual tool inventory is incomplete");
    }
  }
  if (!fileText(context, "README.md").includes("(docs/manual/README.md)")) {
    fail("README does not link the operator manual");
  }

  verifyIndex(policy, context);
  verifyLinks(policy, context);
}
