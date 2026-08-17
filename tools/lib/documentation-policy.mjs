import path from "node:path";

const EXPECTED_STATUSES = Object.freeze(["accepted", "superseded"]);
const EXPECTED_DOMAINS = Object.freeze([
  "architecture",
  "documentation",
  "engineering",
  "evaluation",
  "foundation",
  "governance",
  "providers",
  "security",
  "terminal",
  "tools",
]);
const REQUIRED_MIGRATION_HEADINGS = Object.freeze([
  "## Guardrails",
  "## Current delivery",
  "## Content ledger",
  "## Delivery sequence",
  "## Completion conditions",
]);

export class DocumentationPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "DocumentationPolicyError";
  }
}

function fail(message) {
  throw new DocumentationPolicyError(message);
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

function same(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(label + " mismatch");
  }
}

function validateUniqueStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    fail(label + " must be a nonempty array");
  }
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      fail(label + " must contain unique nonempty strings");
    }
    seen.add(value);
  }
}

function textFor(context, file) {
  if (!isRecord(context.files) || typeof context.files[file] !== "string") {
    fail("documentation source is missing: " + file);
  }
  return context.files[file];
}

function assertRepositoryPath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== path.posix.normalize(value) ||
    value.startsWith("../") ||
    path.posix.isAbsolute(value) ||
    value.includes("\\")
  ) {
    fail(label + " must be a normalized repository-relative path");
  }
}

function relativeLink(from, target) {
  return path.posix.relative(path.posix.dirname(from), target);
}

function resolveLocalLink(source, link) {
  const target = link.split("#", 1).at(0);
  if (target === undefined || target.length === 0) {
    return undefined;
  }
  if (target.startsWith("https://")) {
    return undefined;
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || path.posix.isAbsolute(target)) {
    fail("documentation contains a forbidden link target: " + source);
  }
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(source), target),
  );
  if (resolved === ".." || resolved.startsWith("../")) {
    fail("documentation link escaped the repository: " + source);
  }
  return resolved;
}

function localLinkTargets(source, text, ownedPaths) {
  const targets = [];
  for (const match of text.matchAll(/\[[^\]\r\n]+\]\(([^)\r\n]+)\)/gu)) {
    const link = match.at(1);
    if (link === undefined) {
      fail("documentation link parsing failed: " + source);
    }
    const target = resolveLocalLink(source, link);
    if (target !== undefined) {
      if (!ownedPaths.has(target)) {
        fail("documentation link target is missing: " + source);
      }
      targets.push(target);
    }
  }
  return targets;
}

function validateLivingDocuments(policy, context, ownedPaths) {
  if (!Array.isArray(policy.livingDocuments) || policy.livingDocuments.length === 0) {
    fail("living document registry must be nonempty");
  }
  const paths = new Set();
  const authorities = new Set();
  for (const entry of policy.livingDocuments) {
    exactKeys(entry, ["path", "audience", "authority"], "living document");
    assertRepositoryPath(entry.path, "living document path");
    if (
      typeof entry.audience !== "string" ||
      entry.audience.length === 0 ||
      typeof entry.authority !== "string" ||
      entry.authority.length === 0
    ) {
      fail("living document audience and authority must be nonempty");
    }
    if (paths.has(entry.path) || authorities.has(entry.authority)) {
      fail("living document path or authority is duplicated");
    }
    paths.add(entry.path);
    authorities.add(entry.authority);
    if (!ownedPaths.has(entry.path)) {
      fail("living document is not owned: " + entry.path);
    }
    textFor(context, entry.path);
  }
}

function validateDocumentStructures(policy, context, ownedPaths) {
  if (
    !Array.isArray(policy.documentStructures) ||
    policy.documentStructures.length === 0
  ) {
    fail("document structure registry must be nonempty");
  }

  const livingPaths = new Set(
    policy.livingDocuments.map((entry) => entry.path),
  );
  const paths = new Set();

  for (const entry of policy.documentStructures) {
    exactKeys(entry, ["path", "headings"], "document structure");
    assertRepositoryPath(entry.path, "document structure path");
    validateUniqueStrings(entry.headings, "document structure headings");

    if (paths.has(entry.path) || !livingPaths.has(entry.path)) {
      fail(
        "document structure path must identify one registered living document",
      );
    }
    paths.add(entry.path);

    for (const heading of entry.headings) {
      if (!/^#{1,2} [^\r\n]+$/u.test(heading)) {
        fail("document structure heading must be level one or two");
      }
    }

    const text = textFor(context, entry.path);
    const headings = [...text.matchAll(/^#{1,2} [^\r\n]+$/gmu)].map(
      (match) => match.at(0),
    );
    same(
      headings,
      entry.headings,
      "document structure headings: " + entry.path,
    );
    localLinkTargets(entry.path, text, ownedPaths);
  }
}

function validateRepositoryInstructions(policy, context, ownedPaths) {
  const instructions = policy.repositoryInstructions;
  exactKeys(
    instructions,
    ["path", "requiredHeadings", "requiredRoutes"],
    "repository instructions",
  );
  assertRepositoryPath(instructions.path, "repository instructions path");
  validateUniqueStrings(
    instructions.requiredHeadings,
    "repository instruction headings",
  );
  validateUniqueStrings(
    instructions.requiredRoutes,
    "repository instruction routes",
  );
  if (
    !policy.livingDocuments.some((entry) => entry.path === instructions.path)
  ) {
    fail("repository instructions must be a registered living document");
  }
  const text = textFor(context, instructions.path);
  const headings = [...text.matchAll(/^#{1,2} [^\r\n]+$/gmu)].map(
    (match) => match.at(0),
  );
  same(headings, instructions.requiredHeadings, "repository instruction headings");
  const targets = new Set(
    localLinkTargets(instructions.path, text, ownedPaths),
  );
  for (const route of instructions.requiredRoutes) {
    assertRepositoryPath(route, "repository instruction route");
    if (!ownedPaths.has(route) || !targets.has(route)) {
      fail("repository instructions are missing a required route: " + route);
    }
  }
  same(
    [...targets].sort(),
    [...instructions.requiredRoutes].sort(),
    "repository instruction routes",
  );
}

function validateDocumentationMap(policy, context, ownedPaths) {
  const text = textFor(context, policy.index);
  if (!text.startsWith("# Agent documentation\n")) {
    fail("documentation map heading mismatch");
  }
  const targets = new Set(localLinkTargets(policy.index, text, ownedPaths));
  for (const entry of policy.livingDocuments) {
    const link = relativeLink(policy.index, entry.path);
    const rowTail = "](" + link + ") | " + entry.audience + " | " + entry.authority + " |";
    if (!text.includes(rowTail) || !targets.has(entry.path)) {
      fail("documentation map authority row mismatch: " + entry.path);
    }
  }
  for (const required of [policy.decisionIndex, policy.migrationLedger]) {
    if (!targets.has(required)) {
      fail("documentation map is missing a required route: " + required);
    }
  }
}

function parseDecisionRows(text) {
  const rows = [];
  const expression = /^\| \[([0-9]{4})\]\(([^)]+)\) \| ([a-z]+) \| ([a-z]+) \| ([^|\r\n]+) \|$/gmu;
  for (const match of text.matchAll(expression)) {
    const id = match.at(1);
    const link = match.at(2);
    const status = match.at(3);
    const domain = match.at(4);
    const relationship = match.at(5)?.trim();
    if (
      id === undefined ||
      link === undefined ||
      status === undefined ||
      domain === undefined ||
      relationship === undefined ||
      relationship.length === 0
    ) {
      fail("decision ledger row is malformed");
    }
    rows.push({ id, link, status, domain, relationship });
  }
  return rows;
}

function metadataValue(text, name, file) {
  const expression = new RegExp("^- " + name + ": ([^\\r\\n]+)$", "gmu");
  const values = [...text.matchAll(expression)].map((match) => match.at(1));
  if (values.length !== 1 || values.at(0) === undefined) {
    fail("prospective decision metadata mismatch: " + file);
  }
  return values.at(0);
}

function validateRelationshipMetadata(value, decisionIds, decisionId, file) {
  if (value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail("prospective decision relationship metadata is invalid: " + file);
  }
  if (value === "none") {
    return [];
  }
  if (
    !/^[0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?$/u.test(value)
  ) {
    fail("prospective decision relationship metadata is invalid: " + file);
  }
  const references = [...value.matchAll(/\b[0-9]{4}\b/gu)].map((match) => match.at(0));
  if (
    references.length === 0 ||
    new Set(references).size !== references.length ||
    references.some((id) => id === decisionId || !decisionIds.has(id))
  ) {
    fail("prospective decision relationship reference is invalid: " + file);
  }
  return references;
}

function validateProspectiveMetadata(policy, context, rows, relationships) {
  const decisionIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    if (Number(row.id) < policy.prospectiveDecisionMetadataFrom) {
      continue;
    }
    const file = resolveLocalLink(policy.decisionIndex, row.link);
    if (file === undefined) {
      fail("prospective decision path is not local");
    }
    const text = textFor(context, file);
    if (!text.startsWith("# " + row.id + ": ")) {
      fail("prospective decision heading mismatch: " + file);
    }
    const status = metadataValue(text, "Status", file);
    const date = metadataValue(text, "Date", file);
    const domain = metadataValue(text, "Domain", file);
    const supersedes = metadataValue(text, "Supersedes", file);
    const supersededBy = metadataValue(text, "Superseded by", file);
    if (
      status !== row.status ||
      domain !== row.domain ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    ) {
      fail("prospective decision metadata does not match its ledger: " + file);
    }
    const supersedesReferences = validateRelationshipMetadata(
      supersedes,
      decisionIds,
      row.id,
      file,
    );
    const supersededByReferences = validateRelationshipMetadata(
      supersededBy,
      decisionIds,
      row.id,
      file,
    );
    const relationship = relationships.get(row.id);
    if (relationship === undefined) {
      fail("prospective decision relationship is missing: " + file);
    }
    if (row.status === "accepted") {
      if (supersededByReferences.length !== 0) {
        fail("accepted decision has a superseding record: " + file);
      }
      const expectedDirection =
        supersedesReferences.length === 0 ? "current" : "supersedes";
      if (relationship.direction !== expectedDirection) {
        fail("prospective decision relationship does not match its ledger: " + file);
      }
      same(
        relationship.references,
        supersedesReferences,
        "prospective supersedes relationship: " + row.id,
      );
    } else {
      if (
        supersededByReferences.length === 0 ||
        relationship.direction !== "superseded by"
      ) {
        fail("prospective decision relationship does not match its ledger: " + file);
      }
      same(
        relationship.references,
        supersededByReferences,
        "prospective superseded-by relationship: " + row.id,
      );
    }
    for (const reference of supersedesReferences) {
      const referencedRelationship = relationships.get(reference);
      if (
        referencedRelationship === undefined ||
        referencedRelationship.direction !== "superseded by" ||
        !referencedRelationship.references.includes(row.id)
      ) {
        fail("superseded decision does not reference its replacement: " + reference);
      }
    }
    for (const reference of supersededByReferences) {
      const referencedRelationship = relationships.get(reference);
      if (
        referencedRelationship === undefined ||
        referencedRelationship.direction !== "supersedes" ||
        !referencedRelationship.references.includes(row.id)
      ) {
        fail("superseding decision does not reference its predecessor: " + reference);
      }
    }
  }
}

function validateDecisionRelationship(row, decisionIds) {
  if (row.relationship === "current") {
    if (row.status !== "accepted") {
      fail("decision relationship contradicts status: " + row.id);
    }
    return { direction: "current", references: [] };
  }
  const relationship = /^(supersedes|superseded by) ([0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?)$/u.exec(
    row.relationship,
  );
  if (
    relationship === null ||
    (relationship.at(1) === "supersedes" && row.status !== "accepted") ||
    (relationship.at(1) === "superseded by" && row.status !== "superseded")
  ) {
    fail("decision relationship contradicts status: " + row.id);
  }
  const direction = relationship.at(1);
  if (direction === undefined) {
    fail("decision relationship direction is missing: " + row.id);
  }
  const references = [
    ...row.relationship.matchAll(/\b[0-9]{4}\b/gu),
  ].map((match) => match.at(0));
  if (
    references.length === 0 ||
    new Set(references).size !== references.length ||
    references.some((id) => id === row.id || !decisionIds.has(id))
  ) {
    fail("decision relationship reference is invalid: " + row.id);
  }
  return { direction, references };
}

function validateDecisionRecords(policy, context, rows) {
  const decisionIds = new Set(rows.map((row) => row.id));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const relationships = new Map();
  if (!isRecord(policy.historicalDecisionStatusExceptions)) {
    fail("historical decision status exceptions must be an object");
  }
  for (const [id, status] of Object.entries(
    policy.historicalDecisionStatusExceptions,
  )) {
    const row = rowsById.get(id);
    if (
      !/^[0-9]{4}$/u.test(id) ||
      row === undefined ||
      Number(id) >= policy.prospectiveDecisionMetadataFrom ||
      status !== "accepted" ||
      row.status !== "superseded" ||
      !row.relationship.startsWith("superseded by ")
    ) {
      fail("historical decision status exception is invalid: " + id);
    }
  }
  for (const row of rows) {
    const file = resolveLocalLink(policy.decisionIndex, row.link);
    if (file === undefined) {
      fail("decision path is not local");
    }
    const text = textFor(context, file);
    if (
      !text.startsWith("# " + row.id + ": ") &&
      !text.startsWith("# " + row.id + " — ")
    ) {
      fail("decision heading mismatch: " + file);
    }
    for (const heading of ["## Context", "## Decision"]) {
      if (!text.includes("\n" + heading + "\n")) {
        fail("decision section is missing: " + file);
      }
    }
    const recordStatuses = [
      ...text.matchAll(/^- Status: ([^\r\n]+)$/gmu),
    ].map((match) => match.at(1));
    const recordStatus = recordStatuses
      .at(0)
      ?.toLowerCase()
      .split(" ", 1)
      .at(0);
    const expectedRecordStatus =
      policy.historicalDecisionStatusExceptions[row.id] ?? row.status;
    if (recordStatuses.length !== 1 || recordStatus !== expectedRecordStatus) {
      fail("decision status does not match its ledger: " + file);
    }

    relationships.set(row.id, validateDecisionRelationship(row, decisionIds));
  }
  return relationships;
}

function validateCurrentAuthorities(policy, text, rows) {
  const rowsByPath = new Map(
    rows.map((row) => [resolveLocalLink(policy.decisionIndex, row.link), row]),
  );
  const authorityRows = [];
  const marker = "\n## Current authority by domain\n";
  const start = text.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = text.indexOf("\n## ", bodyStart);
  if (start < 0 || end < 0) {
    fail("current decision authority section is missing");
  }
  const authorityText = text.slice(bodyStart, end);
  const expression = /^\| ([a-z]+) \| ([^|\r\n]+) \|$/gmu;
  for (const match of authorityText.matchAll(expression)) {
    const domain = match.at(1);
    const entryPoints = match.at(2);
    if (domain === undefined || entryPoints === undefined) {
      fail("current decision authority row is malformed");
    }
    authorityRows.push({ domain, entryPoints });
  }
  same(
    authorityRows.map((row) => row.domain),
    policy.decisionDomains,
    "current decision authority domains",
  );
  for (const authority of authorityRows) {
    const links = [
      ...authority.entryPoints.matchAll(/\[[^\]\r\n]+\]\(([^)\r\n]+)\)/gu),
    ].map((match) => match.at(1));
    if (links.length === 0 || new Set(links).size !== links.length) {
      fail("current decision authority entry points are invalid: " + authority.domain);
    }
    for (const link of links) {
      if (link === undefined) {
        fail("current decision authority link is missing");
      }
      const file = resolveLocalLink(policy.decisionIndex, link);
      const row = rowsByPath.get(file);
      if (
        file === undefined ||
        row === undefined ||
        row.status !== "accepted" ||
        row.domain !== authority.domain
      ) {
        fail("current decision authority route is invalid: " + authority.domain);
      }
    }
  }
}

function validateDecisionIndex(policy, context, ownedPaths) {
  const text = textFor(context, policy.decisionIndex);
  if (!text.startsWith("# Architecture decision records\n")) {
    fail("decision index heading mismatch");
  }
  localLinkTargets(policy.decisionIndex, text, ownedPaths);
  const rows = parseDecisionRows(text);
  const expected = context.decisionPaths;
  if (!Array.isArray(expected)) {
    fail("decision path inventory is missing");
  }
  const actualPaths = [];
  const ids = new Set();
  for (const row of rows) {
    const resolved = resolveLocalLink(policy.decisionIndex, row.link);
    if (
      resolved === undefined ||
      row.id !== path.posix.basename(resolved).slice(0, 4) ||
      ids.has(row.id) ||
      !policy.decisionStatuses.includes(row.status) ||
      !policy.decisionDomains.includes(row.domain)
    ) {
      fail("decision ledger classification or identity mismatch");
    }
    ids.add(row.id);
    actualPaths.push(resolved);
  }
  same(actualPaths, expected, "complete decision ledger");
  const relationships = validateDecisionRecords(policy, context, rows);
  validateCurrentAuthorities(policy, text, rows);
  validateProspectiveMetadata(policy, context, rows, relationships);
}

function validateMigrationLedger(policy, context, ownedPaths) {
  const text = textFor(context, policy.migrationLedger);
  if (!text.startsWith("# Documentation migration ledger\n")) {
    fail("documentation migration heading mismatch");
  }
  for (const heading of REQUIRED_MIGRATION_HEADINGS) {
    if (!text.includes("\n" + heading + "\n")) {
      fail("documentation migration section is missing");
    }
  }
  const statuses = [...text.matchAll(/^- Status: ([a-z]+)$/gmu)].map(
    (match) => match.at(1),
  );
  const migrationStatus = statuses.at(0);
  if (
    statuses.length !== 1 ||
    (migrationStatus !== "active" && migrationStatus !== "complete")
  ) {
    fail("documentation migration status is invalid");
  }
  const topics = new Set();
  const rows = [
    ...text.matchAll(
      /^\| ([^|\r\n]+) \| ([^|\r\n]+) \| ([^|\r\n]+) \| ([a-z]+) \|$/gmu,
    ),
  ];
  if (rows.length === 0) {
    fail("documentation migration ledger is empty");
  }
  for (const row of rows) {
    const topic = row.at(1)?.trim();
    const status = row.at(4);
    if (
      topic === undefined ||
      topic.length === 0 ||
      topics.has(topic) ||
      (status !== "active" && status !== "complete" && status !== "retained")
    ) {
      fail("documentation migration ledger row is incomplete");
    }
    topics.add(topic);
  }
  const hasActiveRow = rows.some((row) => row.at(4) === "active");
  if (
    (migrationStatus === "complete" && hasActiveRow) ||
    (migrationStatus === "active" && !hasActiveRow)
  ) {
    fail("documentation migration status contradicts its ledger rows");
  }
  const targets = new Set(
    localLinkTargets(policy.migrationLedger, text, ownedPaths),
  );
  for (const entry of policy.livingDocuments) {
    if (!targets.has(entry.path)) {
      fail("documentation migration omits a living document: " + entry.path);
    }
  }
}

/** Validates the owned documentation map and stable decision history offline. */
export function validateDocumentationPolicy(policy, context) {
  exactKeys(
    policy,
    [
      "schemaVersion",
      "index",
      "decisionIndex",
      "migrationLedger",
      "repositoryInstructions",
      "prospectiveDecisionMetadataFrom",
      "historicalDecisionStatusExceptions",
      "decisionStatuses",
      "decisionDomains",
      "documentStructures",
      "livingDocuments",
    ],
    "documentation policy",
  );
  if (policy.schemaVersion !== 3 || !isRecord(context)) {
    fail("unsupported documentation policy schema or context");
  }
  for (const [label, file] of [
    ["documentation index", policy.index],
    ["decision index", policy.decisionIndex],
    ["migration ledger", policy.migrationLedger],
  ]) {
    assertRepositoryPath(file, label);
  }
  if (
    !Number.isSafeInteger(policy.prospectiveDecisionMetadataFrom) ||
    policy.prospectiveDecisionMetadataFrom < 1 ||
    policy.prospectiveDecisionMetadataFrom > 9999
  ) {
    fail("prospective decision metadata boundary is invalid");
  }
  same(policy.decisionStatuses, EXPECTED_STATUSES, "decision statuses");
  same(policy.decisionDomains, EXPECTED_DOMAINS, "decision domains");
  if (!Array.isArray(context.ownedPaths)) {
    fail("owned path inventory is missing");
  }
  const ownedPaths = new Set(context.ownedPaths);
  validateLivingDocuments(policy, context, ownedPaths);
  validateDocumentStructures(policy, context, ownedPaths);
  validateRepositoryInstructions(policy, context, ownedPaths);
  validateDocumentationMap(policy, context, ownedPaths);
  validateDecisionIndex(policy, context, ownedPaths);
  validateMigrationLedger(policy, context, ownedPaths);
}
