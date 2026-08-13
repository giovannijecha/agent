import { err, ok, type Result } from "@agent/core";

export const WORKSPACE_IGNORE_LIMITS = Object.freeze({
  codeUnits: 16_384,
  lineCodeUnits: 256,
  rules: 128,
  segments: 32,
  targetCodeUnits: 4_096,
  targetSegments: 512,
});

export type WorkspaceIgnoreCase = "asciiInsensitive" | "sensitive";
export type WorkspaceIgnoreErrorKind =
  | "invalidCase"
  | "invalidPattern"
  | "invalidSource"
  | "invalidTarget"
  | "limit";

/** Content-free failure from the owned workspace-ignore grammar. */
export class WorkspaceIgnoreError {
  readonly #kind: WorkspaceIgnoreErrorKind;

  constructor(kind: WorkspaceIgnoreErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): WorkspaceIgnoreErrorKind {
    return this.#kind;
  }
}

type CompiledRule = Readonly<{
  recursiveSegment: number;
  segments: readonly string[];
}>;

const workspaceIgnoreAuthority = Object.freeze({});

function failure(
  kind: WorkspaceIgnoreErrorKind,
): Result<never, WorkspaceIgnoreError> {
  return err(new WorkspaceIgnoreError(kind));
}

function foldAscii(value: string): string {
  let folded = "";
  for (let offset = 0; offset < value.length; offset += 1) {
    const code = value.charCodeAt(offset);
    folded += code >= 0x41 && code <= 0x5a
      ? String.fromCharCode(code + 0x20)
      : value.charAt(offset);
  }
  return folded;
}

function validScalar(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0);
    if (
      point === undefined ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      return false;
    }
  }
  return true;
}

function unsafePatternCharacter(value: string): boolean {
  return /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value);
}

function normalizePattern(
  line: string,
  matchCase: WorkspaceIgnoreCase,
): Result<CompiledRule, WorkspaceIgnoreError> {
  if (line.length > WORKSPACE_IGNORE_LIMITS.lineCodeUnits) {
    return failure("limit");
  }
  if (
    line.length === 0 ||
    line !== line.trim() ||
    line.startsWith("/") ||
    line.startsWith("!") ||
    line.includes("\\") ||
    line.includes("//") ||
    /^[A-Za-z]:\//u.test(line) ||
    unsafePatternCharacter(line) ||
    !validScalar(line)
  ) {
    return failure("invalidPattern");
  }
  const normalized = line.endsWith("/") ? line + "**" : line;
  const rawSegments = normalized.split("/");
  if (
    rawSegments.length === 0 ||
    rawSegments.length > WORKSPACE_IGNORE_LIMITS.segments
  ) {
    return failure("limit");
  }
  const segments: string[] = [];
  let recursiveSegment = -1;
  for (let index = 0; index < rawSegments.length; index += 1) {
    const raw = rawSegments.at(index);
    if (
      raw === undefined ||
      raw.length === 0 ||
      raw === "." ||
      raw === ".."
    ) {
      return failure("invalidPattern");
    }
    if (raw === "**") {
      if (recursiveSegment >= 0) {
        return failure("invalidPattern");
      }
      recursiveSegment = index;
    } else if (raw.includes("**")) {
      return failure("invalidPattern");
    }
    segments.push(matchCase === "asciiInsensitive" ? foldAscii(raw) : raw);
  }
  return ok(
    Object.freeze({
      recursiveSegment,
      segments: Object.freeze(segments),
    }),
  );
}

function targetSegments(
  relative: unknown,
  matchCase: WorkspaceIgnoreCase,
): Result<readonly string[], WorkspaceIgnoreError> {
  if (
    typeof relative !== "string" ||
    relative.length === 0 ||
    relative.length > WORKSPACE_IGNORE_LIMITS.targetCodeUnits ||
    relative.startsWith("/") ||
    relative.endsWith("/") ||
    relative.includes("\\") ||
    relative.includes("//") ||
    unsafePatternCharacter(relative) ||
    !validScalar(relative)
  ) {
    return failure("invalidTarget");
  }
  if (relative === ".") {
    return ok(Object.freeze([]));
  }
  const rawSegments = relative.split("/");
  if (
    rawSegments.length === 0 ||
    rawSegments.length > WORKSPACE_IGNORE_LIMITS.targetSegments
  ) {
    return failure("invalidTarget");
  }
  const segments: string[] = [];
  for (const raw of rawSegments) {
    if (raw.length === 0 || raw === "." || raw === "..") {
      return failure("invalidTarget");
    }
    segments.push(matchCase === "asciiInsensitive" ? foldAscii(raw) : raw);
  }
  return ok(Object.freeze(segments));
}

function segmentMatches(pattern: string, target: string): boolean {
  let patternOffset = 0;
  let targetOffset = 0;
  let wildcardOffset = -1;
  let wildcardTargetOffset = -1;
  while (targetOffset < target.length) {
    if (
      patternOffset < pattern.length &&
      pattern.charAt(patternOffset) === target.charAt(targetOffset)
    ) {
      patternOffset += 1;
      targetOffset += 1;
    } else if (
      patternOffset < pattern.length &&
      pattern.charAt(patternOffset) === "*"
    ) {
      wildcardOffset = patternOffset;
      patternOffset += 1;
      wildcardTargetOffset = targetOffset;
    } else if (wildcardOffset >= 0) {
      wildcardTargetOffset += 1;
      targetOffset = wildcardTargetOffset;
      patternOffset = wildcardOffset + 1;
    } else {
      return false;
    }
  }
  while (
    patternOffset < pattern.length &&
    pattern.charAt(patternOffset) === "*"
  ) {
    patternOffset += 1;
  }
  return patternOffset === pattern.length;
}

function fixedSegmentsMatch(
  patterns: readonly string[],
  patternStart: number,
  patternEnd: number,
  targets: readonly string[],
  targetStart: number,
): boolean {
  for (let index = patternStart; index < patternEnd; index += 1) {
    const pattern = patterns.at(index);
    const target = targets.at(targetStart + index - patternStart);
    if (
      pattern === undefined ||
      target === undefined ||
      !segmentMatches(pattern, target)
    ) {
      return false;
    }
  }
  return true;
}

function ruleMatches(rule: CompiledRule, targets: readonly string[]): boolean {
  if (rule.recursiveSegment < 0) {
    return (
      targets.length >= rule.segments.length &&
      fixedSegmentsMatch(
        rule.segments,
        0,
        rule.segments.length,
        targets,
        0,
      )
    );
  }
  const prefixLength = rule.recursiveSegment;
  const suffixStart = rule.recursiveSegment + 1;
  const suffixLength = rule.segments.length - suffixStart;
  if (
    targets.length < prefixLength + suffixLength ||
    !fixedSegmentsMatch(rule.segments, 0, prefixLength, targets, 0)
  ) {
    return false;
  }
  if (suffixLength === 0) {
    return true;
  }
  const lastStart = targets.length - suffixLength;
  for (let start = prefixLength; start <= lastStart; start += 1) {
    if (
      fixedSegmentsMatch(
        rule.segments,
        suffixStart,
        rule.segments.length,
        targets,
        start,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** Immutable matcher for the closed, deny-only `.agentignore` grammar. */
export class WorkspaceIgnore {
  readonly #matchCase: WorkspaceIgnoreCase;
  readonly #rules: readonly CompiledRule[];

  private constructor(
    matchCase: WorkspaceIgnoreCase,
    rules: readonly CompiledRule[],
    authority: unknown,
  ) {
    if (authority !== workspaceIgnoreAuthority) {
      throw new WorkspaceIgnoreError("invalidSource");
    }
    this.#matchCase = matchCase;
    this.#rules = rules;
    Object.freeze(this);
  }

  static create(
    source: unknown,
    matchCase: unknown,
  ): Result<WorkspaceIgnore, WorkspaceIgnoreError> {
    if (matchCase !== "asciiInsensitive" && matchCase !== "sensitive") {
      return failure("invalidCase");
    }
    if (
      typeof source !== "string" ||
      source.length > WORKSPACE_IGNORE_LIMITS.codeUnits ||
      !validScalar(source)
    ) {
      return failure(
        typeof source === "string" &&
          source.length > WORKSPACE_IGNORE_LIMITS.codeUnits
          ? "limit"
          : "invalidSource",
      );
    }
    try {
      const rules: CompiledRule[] = [];
      const seen = new Set<string>();
      for (const line of source.split(/\r\n|\n|\r/u)) {
        if (line.length > WORKSPACE_IGNORE_LIMITS.lineCodeUnits) {
          return failure("limit");
        }
        if (line.length === 0 || line.startsWith("#")) {
          continue;
        }
        if (rules.length >= WORKSPACE_IGNORE_LIMITS.rules) {
          return failure("limit");
        }
        const compiled = normalizePattern(line, matchCase);
        if (!compiled.ok) {
          return compiled;
        }
        const identity = compiled.value.segments.join("/");
        if (seen.has(identity)) {
          return failure("invalidPattern");
        }
        seen.add(identity);
        rules.push(compiled.value);
      }
      return ok(
        new WorkspaceIgnore(
          matchCase,
          Object.freeze(rules),
          workspaceIgnoreAuthority,
        ),
      );
    } catch (_cause: unknown) {
      return failure("invalidSource");
    }
  }

  denies(relative: unknown): Result<boolean, WorkspaceIgnoreError> {
    try {
      const targets = targetSegments(relative, this.#matchCase);
      if (!targets.ok) {
        return targets;
      }
      return ok(this.#rules.some((rule) => ruleMatches(rule, targets.value)));
    } catch (_cause: unknown) {
      return failure("invalidTarget");
    }
  }
}
