import { createHash } from "node:crypto";
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
  const normalized = text.replaceAll("\r\n", "\n");
  const marker = "\n## Complete ledger\n";
  const start = normalized.indexOf(marker);
  if (
    start < 0 ||
    normalized.indexOf(marker, start + marker.length) >= 0 ||
    !normalized.endsWith("\n")
  ) {
    fail("complete decision ledger section is malformed");
  }
  const lines = normalized
    .slice(start + marker.length, -1)
    .split("\n");
  same(
    lines.slice(0, 3),
    [
      "",
      "| Decision | Status | Domain | Relationship |",
      "| --- | --- | --- | --- |",
    ],
    "complete decision ledger header",
  );
  const rowLines = lines.slice(3);
  if (rowLines.length === 0) {
    fail("complete decision ledger is empty");
  }
  const rows = [];
  const expression = /^\| \[([0-9]{4})\]\(([^)]+)\) \| ([a-z]+) \| ([a-z]+) \| ([^|\r\n]+) \|$/u;
  for (const line of rowLines) {
    const match = expression.exec(line);
    if (match === null) {
      fail("decision ledger row is malformed");
    }
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

function validateDecisionReferences(value, decisionIds, decisionId, label) {
  if (value.length > 160 || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail("decision relationship metadata is invalid: " + label);
  }
  if (value === "none") {
    return [];
  }
  if (
    !/^[0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?$/u.test(value)
  ) {
    fail("decision relationship metadata is invalid: " + label);
  }
  const references = [...value.matchAll(/\b[0-9]{4}\b/gu)].map((match) => match.at(0));
  if (
    references.length === 0 ||
    new Set(references).size !== references.length ||
    references.some((id) => id === decisionId || !decisionIds.has(id))
  ) {
    fail("decision relationship reference is invalid: " + label);
  }
  return references;
}

function validateProspectiveMetadata(policy, context, rows, relationships) {
  const decisionIds = new Set(rows.map((row) => row.id));
  const prospectiveRows = rows.filter(
    (row) => Number(row.id) >= policy.prospectiveDecisionMetadataFrom,
  );
  same(
    Object.keys(policy.prospectiveDecisionDates),
    prospectiveRows.map((row) => row.id),
    "prospective decision date inventory",
  );
  for (const row of prospectiveRows) {
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
      date !== policy.prospectiveDecisionDates[row.id]
    ) {
      fail("prospective decision metadata does not match its ledger: " + file);
    }
    const supersedesReferences = validateDecisionReferences(
      supersedes,
      decisionIds,
      row.id,
      file,
    );
    const supersededByReferences = validateDecisionReferences(
      supersededBy,
      decisionIds,
      row.id,
      file,
    );
    const relationship = relationships.get(row.id);
    if (relationship === undefined) {
      fail("prospective decision relationship is missing: " + file);
    }
    same(
      relationship.supersedes,
      supersedesReferences,
      "prospective supersedes relationship: " + row.id,
    );
    same(
      relationship.supersededBy,
      supersededByReferences,
      "prospective superseded-by relationship: " + row.id,
    );
  }
}

function validateDecisionRelationship(row, decisionIds) {
  if (row.relationship === "current") {
    if (row.status !== "accepted") {
      fail("decision relationship contradicts status: " + row.id);
    }
    return { supersedes: [], supersededBy: [] };
  }
  const relationship = /^(?:supersedes ([0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?)(?:; superseded by ([0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?))?|superseded by ([0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?))$/u.exec(
    row.relationship,
  );
  if (relationship === null) {
    fail("decision relationship contradicts status: " + row.id);
  }
  const supersedes = validateDecisionReferences(
    relationship.at(1) ?? "none",
    decisionIds,
    row.id,
    "ledger supersedes " + row.id,
  );
  const supersededBy = validateDecisionReferences(
    relationship.at(2) ?? relationship.at(3) ?? "none",
    decisionIds,
    row.id,
    "ledger superseded-by " + row.id,
  );
  if (
    (row.status === "accepted" && supersededBy.length !== 0) ||
    (row.status === "superseded" && supersededBy.length === 0)
  ) {
    fail("decision relationship contradicts status: " + row.id);
  }
  return { supersedes, supersededBy };
}

function historicalReplacementReferences(value, decisionIds, decisionId, file) {
  const match = /(?:^| by )decisions? ([0-9]{4}(?:, [0-9]{4})*(?:,? and [0-9]{4})?)$/u.exec(
    value,
  );
  const references = match?.at(1);
  if (references === undefined) {
    fail("historical decision replacement metadata is invalid: " + file);
  }
  return validateDecisionReferences(
    references,
    decisionIds,
    decisionId,
    "historical replacement " + decisionId,
  );
}

function decisionSectionBody(text, heading, file) {
  const normalized = text.replaceAll("\r\n", "\n");
  const marker = "\n## " + heading + "\n";
  const start = normalized.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = normalized.indexOf("\n## ", bodyStart);
  if (
    start < 0 ||
    normalized.indexOf(marker, bodyStart) >= 0
  ) {
    fail("decision section is missing or duplicated: " + file);
  }
  const body = normalized.slice(
    bodyStart,
    end < 0 ? normalized.length : end,
  );
  if (body.trim().length === 0) {
    fail("decision section body is empty: " + file);
  }
  return body;
}

function validateDecisionRecords(policy, context, rows) {
  const decisionIds = new Set(rows.map((row) => row.id));
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const relationships = new Map();
  const decisionRecords = [];
  const historicalSupersedesFields = new Map(
    Object.entries(policy.historicalDecisionRelationshipFields.supersedes),
  );
  const historicalSupersededByFields = new Set(
    policy.historicalDecisionRelationshipFields.supersededBy,
  );
  for (const id of new Set([
    ...historicalSupersedesFields.keys(),
    ...historicalSupersededByFields,
  ])) {
    if (!rowsById.has(id)) {
      fail("historical decision relationship field is unregistered: " + id);
    }
  }
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
      row.status !== "superseded"
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
    decisionRecords.push({
      id: row.id,
      record: text.replaceAll("\r\n", "\n"),
    });
    decisionSectionBody(text, "Context", file);
    decisionSectionBody(text, "Decision", file);
    const recordStatuses = [
      ...text.matchAll(/^- Status: ([^\r\n]+)$/gmu),
    ].map((match) => match.at(1));
    const recordStatusText = recordStatuses.at(0);
    const recordStatus = recordStatusText
      ?.toLowerCase()
      .split(" ", 1)
      .at(0);
    const expectedRecordStatus =
      policy.historicalDecisionStatusExceptions[row.id] ?? row.status;
    if (recordStatuses.length !== 1 || recordStatus !== expectedRecordStatus) {
      fail("decision status does not match its ledger: " + file);
    }

    const relationship = validateDecisionRelationship(row, decisionIds);
    if (
      Number(row.id) < policy.prospectiveDecisionMetadataFrom &&
      recordStatusText !== undefined
    ) {
      const statusHasReplacement = /^superseded by decisions? /u.test(
        recordStatusText,
      );
      const replacementMetadata = [];
      if (statusHasReplacement) {
        replacementMetadata.push(recordStatusText);
      }
      const supersessionFields = [
        ...text.matchAll(/^- Superseded(?: by)?: ([^\r\n]+)$/gmu),
      ].map((match) => match.at(1));
      if (supersessionFields.length > 1) {
        fail("historical decision replacement metadata is invalid: " + file);
      }
      const supersessionField = supersessionFields.at(0);
      if (supersessionField !== undefined) {
        replacementMetadata.push(supersessionField);
      }
      if (
        historicalSupersededByFields.has(row.id) !==
        (supersessionField !== undefined)
      ) {
        fail("historical superseded-by field inventory mismatch: " + file);
      }
      for (const metadata of replacementMetadata) {
        if (relationship.supersededBy.length === 0) {
          fail("historical decision replacement contradicts its ledger: " + file);
        }
        same(
          relationship.supersededBy,
          historicalReplacementReferences(
            metadata,
            decisionIds,
            row.id,
            file,
          ),
          "historical decision replacement: " + row.id,
        );
      }
      if (
        row.status === "superseded" &&
        policy.historicalDecisionStatusExceptions[row.id] === undefined &&
        !statusHasReplacement &&
        supersessionField === undefined
      ) {
        fail("historical decision replacement metadata is missing: " + file);
      }
      const supersedesFields = [
        ...text.matchAll(/^- Supersedes: ([^\r\n]+)$/gmu),
      ].map((match) => match.at(1));
      if (supersedesFields.length > 1) {
        fail("historical decision supersedes metadata is invalid: " + file);
      }
      const supersedesField = supersedesFields.at(0);
      const expectedSupersedesField = historicalSupersedesFields.get(row.id);
      if (
        (expectedSupersedesField !== undefined) !==
        (supersedesField !== undefined)
      ) {
        fail("historical supersedes field inventory mismatch: " + file);
      }
      if (
        supersedesField !== undefined &&
        supersedesField !== expectedSupersedesField
      ) {
        fail("historical supersedes field value mismatch: " + file);
      }
      if (
        supersedesField !== undefined &&
        relationship.supersedes.length !== 0
      ) {
        same(
          relationship.supersedes,
          historicalReplacementReferences(
            supersedesField,
            decisionIds,
            row.id,
            file,
          ),
          "historical supersedes relationship: " + row.id,
        );
      }
    }
    relationships.set(row.id, relationship);
  }
  const recordDigest = createHash("sha256")
    .update(JSON.stringify(decisionRecords), "utf8")
    .digest("hex");
  if (recordDigest !== policy.decisionRecordDigest.value) {
    fail("decision record digest mismatch");
  }
  for (const [id, relationship] of relationships) {
    for (const reference of relationship.supersedes) {
      const reciprocal = relationships.get(reference);
      if (
        reciprocal === undefined ||
        !reciprocal.supersededBy.includes(id)
      ) {
        fail("decision relationship is not reciprocal: " + id);
      }
    }
    for (const reference of relationship.supersededBy) {
      const reciprocal = relationships.get(reference);
      if (reciprocal === undefined || !reciprocal.supersedes.includes(id)) {
        fail("decision relationship is not reciprocal: " + id);
      }
    }
  }
  const relationshipEdges = [];
  for (const [superseder, relationship] of relationships) {
    for (const superseded of relationship.supersedes) {
      relationshipEdges.push({ superseder, superseded });
    }
  }
  same(
    relationshipEdges,
    policy.decisionRelationshipEdges,
    "decision relationship edges",
  );
  return relationships;
}

function validateCurrentAuthorities(policy, text, rows) {
  const rowsByPath = new Map(
    rows.map((row) => [resolveLocalLink(policy.decisionIndex, row.link), row]),
  );
  const expectedByDomain = new Map(
    Object.entries(policy.currentDecisionAuthorities),
  );
  const authorityRows = [];
  const normalized = text.replaceAll("\r\n", "\n");
  const marker = "\n## Current authority by domain\n";
  const start = normalized.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = normalized.indexOf("\n## ", bodyStart);
  if (
    start < 0 ||
    end < 0 ||
    normalized.indexOf(marker, bodyStart) >= 0
  ) {
    fail("current decision authority section is missing");
  }
  const lines = normalized.slice(bodyStart, end).split("\n");
  same(
    lines.slice(0, 3),
    ["", "| Domain | Entry points |", "| --- | --- |"],
    "current decision authority header",
  );
  if (lines.at(-1) !== "") {
    fail("current decision authority table is malformed");
  }
  const expression = /^\| ([a-z]+) \| ([^|\r\n]+) \|$/u;
  for (const line of lines.slice(3, -1)) {
    const match = expression.exec(line);
    if (match === null) {
      fail("current decision authority row is malformed");
    }
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
    const decisionIds = [];
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
      decisionIds.push(row.id);
    }
    same(
      decisionIds,
      expectedByDomain.get(authority.domain),
      "current decision authority entry points: " + authority.domain,
    );
  }
}

function expectedDecisionDomains(policy) {
  exactKeys(
    policy.decisionDomainMembers,
    policy.decisionDomains,
    "decision domain members",
  );
  const domainsById = new Map();
  for (const [domain, decisionIds] of Object.entries(
    policy.decisionDomainMembers,
  )) {
    validateUniqueStrings(decisionIds, "decision domain members: " + domain);
    for (const id of decisionIds) {
      if (!/^[0-9]{4}$/u.test(id) || domainsById.has(id)) {
        fail("decision domain member is invalid: " + domain);
      }
      domainsById.set(id, domain);
    }
  }
  return domainsById;
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
  const domainsById = expectedDecisionDomains(policy);
  for (const row of rows) {
    const resolved = resolveLocalLink(policy.decisionIndex, row.link);
    if (
      resolved === undefined ||
      row.id !== path.posix.basename(resolved).slice(0, 4) ||
      ids.has(row.id) ||
      !policy.decisionStatuses.includes(row.status) ||
      !policy.decisionDomains.includes(row.domain) ||
      domainsById.get(row.id) !== row.domain
    ) {
      fail("decision ledger classification or identity mismatch");
    }
    ids.add(row.id);
    actualPaths.push(resolved);
  }
  same(actualPaths, expected, "complete decision ledger");
  same(
    [...domainsById.keys()].sort(),
    [...ids].sort(),
    "complete decision domain membership",
  );
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
  const migrationRows = [];
  const normalized = text.replaceAll("\r\n", "\n");
  const marker = "\n## Content ledger\n";
  const start = normalized.indexOf(marker);
  const bodyStart = start + marker.length;
  const end = normalized.indexOf("\n## ", bodyStart);
  if (
    start < 0 ||
    end < 0 ||
    normalized.indexOf(marker, bodyStart) >= 0
  ) {
    fail("documentation migration content ledger section is missing");
  }
  const lines = normalized.slice(bodyStart, end).split("\n");
  same(
    lines.slice(0, 3),
    [
      "",
      "| Topic | Current sources | Canonical owner | Status |",
      "| --- | --- | --- | --- |",
    ],
    "documentation migration content ledger header",
  );
  if (lines.at(-1) !== "") {
    fail("documentation migration content ledger table is malformed");
  }
  const expression =
    /^\| ([^|\r\n]+) \| ([^|\r\n]+) \| ([^|\r\n]+) \| ([a-z]+) \|$/u;
  for (const line of lines.slice(3, -1)) {
    const row = expression.exec(line);
    if (row === null) {
      fail("documentation migration content ledger row is malformed");
    }
    const topic = row.at(1)?.trim();
    const currentSources = row.at(2)?.trim();
    const canonicalOwner = row.at(3)?.trim();
    const status = row.at(4);
    if (
      topic === undefined ||
      topic.length === 0 ||
      currentSources === undefined ||
      currentSources.length === 0 ||
      canonicalOwner === undefined ||
      canonicalOwner.length === 0 ||
      topics.has(topic) ||
      (status !== "active" && status !== "complete" && status !== "retained")
    ) {
      fail("documentation migration ledger row is incomplete");
    }
    topics.add(topic);
    migrationRows.push({ topic, currentSources, canonicalOwner, status });
  }
  same(migrationRows, policy.migrationRows, "documentation migration rows");
  const hasActiveRow = migrationRows.some((row) => row.status === "active");
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
      "prospectiveDecisionDates",
      "historicalDecisionStatusExceptions",
      "historicalDecisionRelationshipFields",
      "decisionRelationshipEdges",
      "decisionRecordDigest",
      "decisionDomainMembers",
      "currentDecisionAuthorities",
      "migrationRows",
      "decisionStatuses",
      "decisionDomains",
      "documentStructures",
      "livingDocuments",
    ],
    "documentation policy",
  );
  if (policy.schemaVersion !== 11 || !isRecord(context)) {
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
  if (
    !isRecord(policy.prospectiveDecisionDates) ||
    Object.keys(policy.prospectiveDecisionDates).length === 0
  ) {
    fail("prospective decision dates must be a nonempty object");
  }
  for (const [id, date] of Object.entries(policy.prospectiveDecisionDates)) {
    if (
      !/^[0-9]{4}$/u.test(id) ||
      Number(id) < policy.prospectiveDecisionMetadataFrom ||
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    ) {
      fail("prospective decision date is invalid");
    }
  }
  exactKeys(
    policy.historicalDecisionRelationshipFields,
    ["supersedes", "supersededBy"],
    "historical decision relationship fields",
  );
  const historicalSupersedes =
    policy.historicalDecisionRelationshipFields.supersedes;
  if (
    !isRecord(historicalSupersedes) ||
    Object.keys(historicalSupersedes).length === 0
  ) {
    fail("historical supersedes fields must be a nonempty object");
  }
  for (const [id, value] of Object.entries(historicalSupersedes)) {
    if (
      !/^[0-9]{4}$/u.test(id) ||
      Number(id) >= policy.prospectiveDecisionMetadataFrom ||
      typeof value !== "string" ||
      value.length === 0
    ) {
      fail("historical decision relationship field identifier is invalid");
    }
  }
  const historicalSupersededBy =
    policy.historicalDecisionRelationshipFields.supersededBy;
  validateUniqueStrings(
    historicalSupersededBy,
    "historical decision relationship fields: supersededBy",
  );
  if (
    historicalSupersededBy.some(
      (id) =>
        !/^[0-9]{4}$/u.test(id) ||
        Number(id) >= policy.prospectiveDecisionMetadataFrom,
    )
  ) {
    fail("historical decision relationship field identifier is invalid");
  }
  exactKeys(
    policy.decisionRecordDigest,
    ["algorithm", "value"],
    "decision record digest",
  );
  if (
    policy.decisionRecordDigest.algorithm !== "sha256" ||
    !/^[a-f0-9]{64}$/u.test(policy.decisionRecordDigest.value)
  ) {
    fail("decision record digest is invalid");
  }
  if (
    !Array.isArray(policy.decisionRelationshipEdges) ||
    policy.decisionRelationshipEdges.length === 0
  ) {
    fail("decision relationship edges must be a nonempty array");
  }
  const edgeKeys = new Set();
  for (const edge of policy.decisionRelationshipEdges) {
    exactKeys(
      edge,
      ["superseder", "superseded"],
      "decision relationship edge",
    );
    const edgeKey = edge.superseder + ":" + edge.superseded;
    if (
      !/^[0-9]{4}$/u.test(edge.superseder) ||
      !/^[0-9]{4}$/u.test(edge.superseded) ||
      edge.superseder === edge.superseded ||
      edgeKeys.has(edgeKey)
    ) {
      fail("decision relationship edge is invalid");
    }
    edgeKeys.add(edgeKey);
  }
  same(policy.decisionStatuses, EXPECTED_STATUSES, "decision statuses");
  same(policy.decisionDomains, EXPECTED_DOMAINS, "decision domains");
  exactKeys(
    policy.currentDecisionAuthorities,
    policy.decisionDomains,
    "current decision authorities",
  );
  for (const [domain, decisionIds] of Object.entries(
    policy.currentDecisionAuthorities,
  )) {
    validateUniqueStrings(decisionIds, "current decision authorities: " + domain);
    if (decisionIds.some((id) => !/^[0-9]{4}$/u.test(id))) {
      fail("current decision authority identifier is invalid: " + domain);
    }
  }
  if (!Array.isArray(policy.migrationRows) || policy.migrationRows.length === 0) {
    fail("documentation migration rows must be a nonempty array");
  }
  for (const row of policy.migrationRows) {
    exactKeys(
      row,
      ["topic", "currentSources", "canonicalOwner", "status"],
      "documentation migration row",
    );
    if (
      typeof row.topic !== "string" ||
      row.topic.length === 0 ||
      typeof row.currentSources !== "string" ||
      row.currentSources.length === 0 ||
      typeof row.canonicalOwner !== "string" ||
      row.canonicalOwner.length === 0 ||
      (row.status !== "active" &&
        row.status !== "complete" &&
        row.status !== "retained")
    ) {
      fail("documentation migration row is invalid");
    }
  }
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
