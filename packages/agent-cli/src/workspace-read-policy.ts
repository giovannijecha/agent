import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result } from "@agent/core";

import { decodeUtf8Text } from "./utf8-text.js";
import { WorkspaceBoundary } from "./workspace-boundary.js";
import {
  WorkspaceIgnore,
  type WorkspaceIgnoreCase,
} from "./workspace-ignore.js";

export const WORKSPACE_READ_POLICY_LIMITS = Object.freeze({
  fileBytes: 16_384,
});

export type WorkspaceReadPolicyErrorKind =
  | "inaccessible"
  | "invalidBoundary"
  | "invalidPlatform"
  | "invalidPolicy"
  | "limit";

/** Content-free failure from workspace read-policy construction or matching. */
export class WorkspaceReadPolicyError {
  readonly #kind: WorkspaceReadPolicyErrorKind;

  constructor(kind: WorkspaceReadPolicyErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): WorkspaceReadPolicyErrorKind {
    return this.#kind;
  }
}

const BUILTIN_POLICY = [
  "**/.agentignore",
  "**/.git",
  "**/.env",
  "**/.env.*",
  "**/.ssh",
  "**/.aws",
  "**/.azure",
  "**/.config/gcloud",
  "**/.kube",
  "**/.docker/config.json",
  "**/.npmrc",
  "**/.pypirc",
  "**/.netrc",
  "**/.git-credentials",
  "**/id_rsa",
  "**/id_dsa",
  "**/id_ecdsa",
  "**/id_ed25519",
  "**/*.key",
  "**/*.pem",
  "**/*.p12",
  "**/*.pfx",
  "**/*.jks",
  "**/*.keystore",
].join("\n");

const workspaceReadPolicyAuthority = Object.freeze({});
const WINDOWS_DOS_ALIAS = /~[0-9]+(?:\.|$)/u;

function failure(
  kind: WorkspaceReadPolicyErrorKind,
): Result<never, WorkspaceReadPolicyError> {
  return err(new WorkspaceReadPolicyError(kind));
}

function errorCode(cause: unknown): string | undefined {
  try {
    if (cause === null || typeof cause !== "object") {
      return undefined;
    }
    const code = (cause as Readonly<{ code?: unknown }>).code;
    return typeof code === "string" ? code : undefined;
  } catch (_cause: unknown) {
    return undefined;
  }
}

function samePath(left: string, right: string): boolean {
  return path.relative(left, right) === "";
}

function caseForPlatform(
  platform: unknown,
): Result<WorkspaceIgnoreCase, WorkspaceReadPolicyError> {
  return platform === "linux"
    ? ok("sensitive")
    : platform === "win32"
      ? ok("asciiInsensitive")
      : failure("invalidPlatform");
}

function containsWindowsDosAlias(relative: unknown): boolean {
  return (
    typeof relative === "string" &&
    relative.split("/").some((component) => WINDOWS_DOS_ALIAS.test(component))
  );
}

async function readWorkspaceRules(
  root: string,
): Promise<Result<string, WorkspaceReadPolicyError>> {
  const policyPath = path.join(root, ".agentignore");
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(policyPath);
  } catch (cause: unknown) {
    return errorCode(cause) === "ENOENT" ? ok("") : failure("inaccessible");
  }
  if (before.isSymbolicLink() || !before.isFile()) {
    return failure("invalidPolicy");
  }
  if (before.size > WORKSPACE_READ_POLICY_LIMITS.fileBytes) {
    return failure("limit");
  }
  try {
    const canonicalBefore = await realpath(policyPath);
    if (!samePath(canonicalBefore, policyPath)) {
      return failure("invalidPolicy");
    }
    const bytes = await readFile(policyPath);
    if (bytes.length > WORKSPACE_READ_POLICY_LIMITS.fileBytes) {
      return failure("limit");
    }
    const decoded = decodeUtf8Text(bytes, true);
    if (!decoded.ok) {
      return failure("invalidPolicy");
    }
    const after = await lstat(policyPath);
    const canonicalAfter = await realpath(policyPath);
    if (
      after.isSymbolicLink() ||
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      after.size !== before.size ||
      after.size !== bytes.length ||
      !samePath(canonicalAfter, policyPath) ||
      !samePath(canonicalAfter, canonicalBefore)
    ) {
      return failure("invalidPolicy");
    }
    return ok(decoded.value);
  } catch (_cause: unknown) {
    return failure("inaccessible");
  }
}

/** Immutable built-in plus workspace-local disclosure boundary. */
export class WorkspaceReadPolicy {
  readonly #builtins: WorkspaceIgnore;
  readonly #rejectWindowsDosAliases: boolean;
  readonly #root: string;
  readonly #workspace: WorkspaceIgnore;

  private constructor(
    root: string,
    builtins: WorkspaceIgnore,
    workspace: WorkspaceIgnore,
    rejectWindowsDosAliases: boolean,
    authority: unknown,
  ) {
    if (authority !== workspaceReadPolicyAuthority) {
      throw new WorkspaceReadPolicyError("invalidPolicy");
    }
    this.#builtins = builtins;
    this.#rejectWindowsDosAliases = rejectWindowsDosAliases;
    this.#root = root;
    this.#workspace = workspace;
    Object.freeze(this);
  }

  static async load(
    boundary: unknown,
    platform: unknown,
  ): Promise<Result<WorkspaceReadPolicy, WorkspaceReadPolicyError>> {
    const acceptedRoot = WorkspaceBoundary.rootOf(boundary);
    if (!acceptedRoot.ok) {
      return failure("invalidBoundary");
    }
    const matchCase = caseForPlatform(platform);
    if (!matchCase.ok) {
      return matchCase;
    }
    const source = await readWorkspaceRules(acceptedRoot.value);
    if (!source.ok) {
      return source;
    }
    const builtins = WorkspaceIgnore.create(BUILTIN_POLICY, matchCase.value);
    const workspace = WorkspaceIgnore.create(source.value, matchCase.value);
    if (!builtins.ok || !workspace.ok) {
      return failure(
        (!builtins.ok && builtins.error.kind === "limit") ||
          (!workspace.ok && workspace.error.kind === "limit")
          ? "limit"
          : "invalidPolicy",
      );
    }
    return ok(
      new WorkspaceReadPolicy(
        acceptedRoot.value,
        builtins.value,
        workspace.value,
        platform === "win32",
        workspaceReadPolicyAuthority,
      ),
    );
  }

  static forRoot(
    value: unknown,
    root: string,
  ): Result<WorkspaceReadPolicy, WorkspaceReadPolicyError> {
    try {
      if (!(value instanceof WorkspaceReadPolicy) || !samePath(value.#root, root)) {
        return failure("invalidBoundary");
      }
      return ok(value);
    } catch (_cause: unknown) {
      return failure("invalidBoundary");
    }
  }

  denies(relative: unknown): Result<boolean, WorkspaceReadPolicyError> {
    try {
      const builtIn = this.#builtins.denies(relative);
      if (!builtIn.ok) {
        return failure("invalidPolicy");
      }
      if (builtIn.value) {
        return ok(true);
      }
      if (
        this.#rejectWindowsDosAliases &&
        containsWindowsDosAlias(relative)
      ) {
        return ok(true);
      }
      const workspace = this.#workspace.denies(relative);
      return workspace.ok ? workspace : failure("invalidPolicy");
    } catch (_cause: unknown) {
      return failure("invalidPolicy");
    }
  }
}
