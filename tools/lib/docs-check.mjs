import { createHash } from "node:crypto";
import path from "node:path";

const CANONICAL_LICENSE_DIGEST =
  "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4";
const CANONICAL_GIT_ATTRIBUTES = "* text=auto eol=lf\n";

export const DOCUMENT_PATHS = Object.freeze([
  "AGENTS.md",
  "PRIVACY.md",
  "README.md",
  "SECURITY.md",
  "assets/brand/README.md",
  "docs/ARCHITECTURE.md",
  "docs/ENGINEERING.md",
  "docs/manual/01-running-agent.md",
  "docs/manual/02-turn-lifecycle.md",
  "docs/manual/03-terminal-interface.md",
  "docs/manual/04-tools-and-approval.md",
  "docs/manual/05-providers-and-authentication.md",
  "docs/manual/06-verification-and-diagnostics.md",
  "docs/manual/README.md",
  "evaluations/README.md",
]);

const FORBIDDEN_AUTHORSHIP_PATTERNS = Object.freeze([
  /^co-authored-by:\s*(?:codex|openai)\b/imu,
  /^generated[- ]by\b/imu,
  /^written[- ]by\s+(?:codex|openai)\b/imu,
  /^(?:ai|machine)[- ]generated\b/imu,
  /\b100% (?:human(?:-written)?|hand[- ]written)\b/iu,
  /\bentirely human(?:-written)?\b/iu,
  /\bmade without (?:ai|tools?)\b/iu,
  /\bno (?:ai|tools?) (?:(?:was|were) )?used\b/iu,
]);

function fail(message) {
  throw new Error(message);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function isAuthorityDocument(file) {
  return (
    /^[A-Z][A-Z-]*\.md$/u.test(file) ||
    file === "assets/brand/README.md" ||
    /^docs\/.+\.md$/u.test(file) ||
    file === "evaluations/README.md"
  );
}

function normalizeTarget(source, rawTarget) {
  const separator = rawTarget.indexOf("#");
  const beforeFragment = separator === -1
    ? rawTarget
    : rawTarget.slice(0, separator);
  const withoutQuery = beforeFragment.split("?", 1)[0];
  if (/^https:\/\//iu.test(withoutQuery)) {
    return undefined;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(withoutQuery)) {
    fail("forbidden link target in " + source);
  }
  let decodedPath;
  let fragment;
  try {
    decodedPath = decodeURIComponent(withoutQuery);
    fragment = separator === -1
      ? undefined
      : decodeURIComponent(rawTarget.slice(separator + 1));
  } catch {
    fail("invalid local link in " + source);
  }
  const portableTarget = decodedPath.replaceAll("\\", "/");
  if (path.posix.isAbsolute(portableTarget)) {
    fail("forbidden link target in " + source);
  }
  const normalized = portableTarget.length === 0
    ? source
    : path.posix.normalize(
      path.posix.join(path.posix.dirname(source), portableTarget),
    );
  if (normalized === ".." || normalized.startsWith("../")) {
    fail("local link escaped the repository in " + source);
  }
  return Object.freeze({ fragment, path: normalized });
}

function headingSlug(text) {
  return text
    .toLowerCase()
    .replaceAll(/<[^>]*>/gu, "")
    .replaceAll(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim()
    .replaceAll(/\s/gu, "-");
}

function headingAnchors(text) {
  const anchors = new Set();
  const occurrences = new Map();
  for (const match of text.matchAll(
    /^[ \t]{0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/gmu,
  )) {
    const heading = (match[1] ?? "").replace(/[ \t]+#+[ \t]*$/u, "");
    const base = headingSlug(heading);
    if (base.length === 0) {
      continue;
    }
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : base + "-" + occurrence);
  }
  const identifiers =
    /(?:^|[\s<])(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s"'=<>`]+))/gimu;
  for (const match of text.matchAll(identifiers)) {
    anchors.add(match[1] ?? match[2] ?? match[3]);
  }
  return anchors;
}

function localTargets(text) {
  const targets = [];
  const markdownImages =
    /!\[(?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
  for (const match of text.matchAll(markdownImages)) {
    targets.push(match[1] ?? match[2]);
  }
  const markdownLinks =
    /(?<!!)\[(?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*\]\(\s*(?:<([^>\r\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/gu;
  for (const match of text.matchAll(markdownLinks)) {
    targets.push(match[1] ?? match[2]);
  }
  const referenceDefinitions =
    /^[ \t]{0,3}\[(?:\\.|[^\]\\\r\n])+\]:[ \t]*(?:<([^>\r\n]+)>|([^\s]+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gmu;
  for (const match of text.matchAll(referenceDefinitions)) {
    targets.push(match[1] ?? match[2]);
  }
  const attributes =
    /(?:^|[\s<])(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gimu;
  for (const match of text.matchAll(attributes)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4];
    if (name !== "srcset") {
      targets.push(value);
      continue;
    }
    for (const candidate of value.split(",")) {
      const target = candidate.trim().split(/\s+/u).at(0);
      if (target !== undefined && target.length > 0) {
        targets.push(target);
      }
    }
  }
  return targets;
}

export function validateDocumentation(context, options = {}) {
  if (
    context === null ||
    typeof context !== "object" ||
    context.files === null ||
    typeof context.files !== "object" ||
    typeof context.gitAttributesText !== "string" ||
    !Array.isArray(context.ownedPaths) ||
    typeof context.licenseText !== "string"
  ) {
    fail("documentation context is invalid");
  }

  if (context.gitAttributesText !== CANONICAL_GIT_ATTRIBUTES) {
    fail("Git text policy mismatch");
  }

  if (context.ownedPaths.some((file) => file.startsWith("docs/decisions/"))) {
    fail("decision ledger is forbidden");
  }

  const actualDocuments = sorted(context.ownedPaths.filter(isAuthorityDocument));
  const expectedDocuments = sorted(DOCUMENT_PATHS);
  if (JSON.stringify(actualDocuments) !== JSON.stringify(expectedDocuments)) {
    fail("documentation inventory mismatch");
  }

  const owned = new Set(context.ownedPaths);
  const anchorSets = new Map();
  for (const file of DOCUMENT_PATHS) {
    const text = context.files[file];
    if (typeof text !== "string" || text.length === 0) {
      fail("documentation input is missing: " + file);
    }
    if (text.charCodeAt(0) === 0xfeff) {
      fail("documentation contains a byte-order mark: " + file);
    }
    if (/docs\/decisions\/|\bdecisions?[\s-]+[0-9]{4}\b/iu.test(text)) {
      fail("decision ledger reference is forbidden: " + file);
    }
    if (FORBIDDEN_AUTHORSHIP_PATTERNS.some((pattern) => pattern.test(text))) {
      fail("authorship claim is forbidden: " + file);
    }
    for (const rawTarget of localTargets(text)) {
      const target = normalizeTarget(file, rawTarget);
      if (target === undefined) {
        continue;
      }
      if (!owned.has(target.path)) {
        fail("broken local link in " + file + ": " + rawTarget);
      }
      if (target.fragment !== undefined && target.fragment.length > 0) {
        let anchors = anchorSets.get(target.path);
        if (anchors === undefined) {
          const targetText = context.files[target.path];
          anchors = typeof targetText === "string"
            ? headingAnchors(targetText)
            : new Set();
          anchorSets.set(target.path, anchors);
        }
        if (!anchors.has(target.fragment)) {
          fail("broken local link fragment in " + file + ": " + rawTarget);
        }
      }
    }
  }

  if (!context.files["README.md"].includes(
    "An owned, zero-dependency personal coding agent.",
  )) {
    fail("public product description mismatch");
  }
  if (!context.files["AGENTS.md"].includes("`giovannijecha/agent`")) {
    fail("canonical repository identity mismatch");
  }

  const expectedLicenseDigest =
    options.expectedLicenseDigest ?? CANONICAL_LICENSE_DIGEST;
  const actualLicenseDigest = createHash("sha256")
    .update(context.licenseText)
    .digest("hex");
  if (actualLicenseDigest !== expectedLicenseDigest) {
    fail("license digest mismatch");
  }
}
