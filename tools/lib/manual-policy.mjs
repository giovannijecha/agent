import path from "node:path";

const INDEX_PATH = "docs/manual/README.md";
const COMMAND_SOURCE = "packages/agent-cli/src/commands.ts";
const TOOL_SOURCE = "packages/agent-cli/src/builtin-tools.ts";
const CHAPTER_SECTIONS = Object.freeze([
  "Purpose",
  "Operator workflow",
  "Guarantees and limits",
  "Failure behavior",
  "Maintenance and removal",
  "Evidence",
]);

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

function extractTools(source) {
  const tools = [];
  const pattern = /\bdescriptor\(\s*"([a-z][a-z0-9_]{0,63})"/gu;
  for (const match of source.matchAll(pattern)) {
    const tool = match.at(1);
    if (tool !== undefined && !tools.includes(tool)) {
      tools.push(tool);
    }
  }
  return sorted(tools);
}

function verifyChapter(chapter, index, context) {
  exactKeys(chapter, ["path", "title"], "manual chapter");
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
  same(headings, CHAPTER_SECTIONS, "manual chapter section order");
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
    ["schemaVersion", "index", "chapters", "commands", "tools", "requiredPaths"],
    "manual policy",
  );
  if (policy.schemaVersion !== 1 || policy.index !== INDEX_PATH) {
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
  const tools = stringList(policy.tools, "manual tools", /^[a-z][a-z0-9_]{0,63}$/u);
  same(commands, extractCommands(fileText(context, COMMAND_SOURCE)), "manual command source inventory");
  same(tools, extractTools(fileText(context, TOOL_SOURCE)), "manual tool source inventory");

  if (!Array.isArray(policy.requiredPaths) || policy.requiredPaths.length === 0) {
    fail("manual evidence paths must be a non-empty array");
  }
  for (const requiredPath of policy.requiredPaths) {
    ownedPath(requiredPath, "manual evidence path");
  }
  unique(policy.requiredPaths, "manual evidence paths");
  const owned = new Set(context.ownedPaths);
  const evidence = chapterTexts
    .map((text) => text.slice(text.indexOf("## Evidence\n")))
    .join("\n");
  for (const requiredPath of policy.requiredPaths) {
    if (!owned.has(requiredPath)) {
      fail("manual evidence path does not exist");
    }
    if (!evidence.includes("`" + requiredPath + "`")) {
      fail("manual evidence path is not cited");
    }
  }

  const allManualText = [fileText(context, policy.index), ...chapterTexts].join("\n");
  for (const capability of [...commands, ...tools]) {
    if (!allManualText.includes("`" + capability + "`")) {
      fail("manual capability inventory is incomplete");
    }
  }
  if (!fileText(context, "README.md").includes("(docs/manual/README.md)")) {
    fail("README does not link the operator manual");
  }

  verifyIndex(policy, context);
  verifyLinks(policy, context);
}
