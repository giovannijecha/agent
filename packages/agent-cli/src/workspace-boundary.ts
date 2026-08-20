import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@agent/core";

export const WORKSPACE_BOUNDARY_LIMITS = Object.freeze({
  rootCodeUnits: 4_096,
});

const workspaceBoundaryAuthority = Object.freeze({});

export type WorkspaceBoundaryErrorKind =
  | "inaccessible"
  | "invalidCandidate"
  | "invalidProtection"
  | "unsafeRoot"
  | "unsupported";

/** Content-free failure from canonical workspace selection. */
export class WorkspaceBoundaryError {
  readonly #kind: WorkspaceBoundaryErrorKind;

  constructor(kind: WorkspaceBoundaryErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): WorkspaceBoundaryErrorKind {
    return this.#kind;
  }
}

export type WorkspaceBoundaryProtection = Readonly<{
  homeDirectory: string;
  temporaryDirectory: string;
}>;

function validAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= WORKSPACE_BOUNDARY_LIMITS.rootCodeUnits &&
    !value.includes("\u0000") &&
    !/\p{Cc}/u.test(value) &&
    path.isAbsolute(value)
  );
}

function samePath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}

function containsPath(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative.length === 0 ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep));
}

function pathsOverlap(left: string, right: string): boolean {
  return containsPath(left, right) || containsPath(right, left);
}

function causeCode(cause: unknown): string | undefined {
  if (cause === null || typeof cause !== "object") {
    return undefined;
  }
  try {
    const code = (cause as Readonly<{ code?: unknown }>).code;
    return typeof code === "string" ? code : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

async function optionalOwnedDirectory(
  candidate: string,
): Promise<"absent" | "directory" | "invalid"> {
  try {
    const observed = await lstat(candidate);
    return observed.isDirectory() && !observed.isSymbolicLink()
      ? "directory"
      : "invalid";
  } catch (cause: unknown) {
    return causeCode(cause) === "ENOENT" ? "absent" : "invalid";
  }
}

function decodeProtection(
  value: unknown,
): Result<WorkspaceBoundaryProtection, WorkspaceBoundaryError> {
  try {
    if (value === null || typeof value !== "object") {
      return err(new WorkspaceBoundaryError("invalidProtection"));
    }
    const protection = value as Readonly<{
      homeDirectory?: unknown;
      temporaryDirectory?: unknown;
    }>;
    const homeDirectory = protection.homeDirectory;
    const temporaryDirectory = protection.temporaryDirectory;
    return validAbsolutePath(homeDirectory) &&
      validAbsolutePath(temporaryDirectory)
      ? ok(Object.freeze({ homeDirectory, temporaryDirectory }))
      : err(new WorkspaceBoundaryError("invalidProtection"));
  } catch (_cause: unknown) {
    return err(new WorkspaceBoundaryError("invalidProtection"));
  }
}

async function canonicalDirectory(
  candidate: string,
): Promise<Result<string, WorkspaceBoundaryError>> {
  try {
    const canonical = await realpath(candidate);
    if (!validAbsolutePath(canonical)) {
      return err(new WorkspaceBoundaryError("inaccessible"));
    }
    const status = await lstat(canonical);
    return status.isDirectory()
      ? ok(canonical)
      : err(new WorkspaceBoundaryError("unsupported"));
  } catch (_cause: unknown) {
    return err(new WorkspaceBoundaryError("inaccessible"));
  }
}

/** Immutable authority shared by workspace display and every built-in tool. */
export class WorkspaceBoundary {
  readonly #root: string;

  private constructor(root: string, authority: unknown) {
    if (authority !== workspaceBoundaryAuthority) {
      throw new WorkspaceBoundaryError("invalidCandidate");
    }
    this.#root = root;
    Object.freeze(this);
  }

  get root(): string {
    return this.#root;
  }

  /** Extracts the root only from an instance carrying this class's private brand. */
  static rootOf(
    value: unknown,
  ): Result<string, WorkspaceBoundaryError> {
    try {
      if (!(value instanceof WorkspaceBoundary)) {
        return err(new WorkspaceBoundaryError("invalidCandidate"));
      }
      const root = value.#root;
      return validAbsolutePath(root)
        ? ok(root)
        : err(new WorkspaceBoundaryError("invalidCandidate"));
    } catch (_cause: unknown) {
      return err(new WorkspaceBoundaryError("invalidCandidate"));
    }
  }

  /** Resolves one existing safe root and discards every non-canonical alias. */
  static async create(
    candidate: unknown,
    protection: unknown,
  ): Promise<Result<WorkspaceBoundary, WorkspaceBoundaryError>> {
    if (!validAbsolutePath(candidate)) {
      return err(new WorkspaceBoundaryError("invalidCandidate"));
    }
    const decodedProtection = decodeProtection(protection);
    if (!decodedProtection.ok) {
      return decodedProtection;
    }
    const canonicalCandidate = await canonicalDirectory(candidate);
    if (!canonicalCandidate.ok) {
      return canonicalCandidate;
    }
    const root = canonicalCandidate.value;
    if (path.dirname(root) === root) {
      return err(new WorkspaceBoundaryError("unsafeRoot"));
    }
    const canonicalHome = await canonicalDirectory(
      decodedProtection.value.homeDirectory,
    );
    if (!canonicalHome.ok) {
      return canonicalHome;
    }
    const canonicalTemporary = await canonicalDirectory(
      decodedProtection.value.temporaryDirectory,
    );
    if (!canonicalTemporary.ok) {
      return canonicalTemporary;
    }
    const userStateRoot = path.join(canonicalHome.value, ".agent");
    const userState = await optionalOwnedDirectory(userStateRoot);
    if (userState === "invalid") {
      return err(new WorkspaceBoundaryError("unsafeRoot"));
    }
    if (userState === "directory") {
      const sessions = await optionalOwnedDirectory(
        path.join(userStateRoot, "sessions"),
      );
      if (sessions === "invalid") {
        return err(new WorkspaceBoundaryError("unsafeRoot"));
      }
    }
    if (
      samePath(root, canonicalHome.value) ||
      samePath(root, canonicalTemporary.value) ||
      pathsOverlap(root, userStateRoot)
    ) {
      return err(new WorkspaceBoundaryError("unsafeRoot"));
    }
    return ok(new WorkspaceBoundary(root, workspaceBoundaryAuthority));
  }
}
