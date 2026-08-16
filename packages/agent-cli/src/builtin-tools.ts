import {
  type Dirent,
  lstat,
  opendir,
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  err,
  ok,
  type Result,
  StructuredList,
  StructuredObject,
} from "@agent/core";
import {
  IntegerSchema,
  ListSchema,
  type ListSchemaOptions,
  LiteralStringSchema,
  ObjectSchema,
  type ObjectSchemaField,
  type ObjectSchemaProjection,
  StringSchema,
  type StringSchemaOptions,
  type ToolApprovalField,
  ToolDescriptor,
  ToolEngine,
  type ToolHandler,
  type ToolHandlerError,
  ToolHandlerOutcome,
  TOOL_ENGINE_LIMITS,
  ToolRegistry,
  type ToolRisk,
  type ToolSchema,
  UnionSchema,
} from "@agent/tools";

import type { ProcessRunner } from "./process-runner.js";
import { PROCESS_RUNNER_LIMITS } from "./process-runner.js";
import {
  PROCESS_PROGRAM_TOKENS,
  ProcessProgramRegistry,
} from "./process-program-registry.js";
import { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";
import type {
  EvaluationReadName,
  EvaluationReceiptRecorder,
} from "./evaluation-receipt.js";
import type { WorkspaceMutationCommitter } from "./workspace-mutation-committer.js";
import type { WorkspaceNamespaceCommitter } from "./workspace-namespace-committer.js";
import { WorkspaceBoundary } from "./workspace-boundary.js";
import {
  insideWorkspace as inside,
  lexicalWorkspacePath as lexicalPath,
  mapWorkspaceIoError as mapIoError,
  relativeFromWorkspaceRoot as relativeFromRoot,
  resolveExistingWorkspacePath,
  workspacePolicyPath as policyPath,
} from "./workspace-path.js";
import { WorkspaceReadPolicy } from "./workspace-read-policy.js";
import { projectWorkspaceFileRead } from "./workspace-file-read.js";
import { applyPatchPlanner } from "./workspace-mutation-plans.js";
import { managePathPlanner } from "./workspace-namespace-plans.js";
import { WORKSPACE_NAMESPACE_LIMITS } from "./workspace-namespace-preview.js";
import { TEXT_PATCH_LIMITS } from "./workspace-text-patch.js";

export { BUILTIN_TOOL_LIMITS } from "./builtin-tool-limits.js";

export type BuiltinToolsErrorKind =
  | "invalidPlatform"
  | "invalidReadPolicy"
  | "invalidRoot"
  | "invariant";
export type BuiltinToolsError = Readonly<{ kind: BuiltinToolsErrorKind }>;

export type BuiltinToolsPlatform = Readonly<{
  mutationCommitter: WorkspaceMutationCommitter;
  namespaceCommitter: WorkspaceNamespaceCommitter;
  processPrograms: ProcessProgramRegistry;
  processRunner: ProcessRunner;
}>;

type ToolFailureKind = ToolHandlerError["kind"];

function toolFailure(kind: ToolFailureKind): Result<never, ToolHandlerError> {
  return err(Object.freeze({ kind }));
}

function toolSuccess(
  output: unknown,
): Result<ToolHandlerOutcome, ToolHandlerError> {
  return ok(ToolHandlerOutcome.success(output));
}

function permittedReadPath(
  root: string,
  policy: WorkspaceReadPolicy,
  relative: string,
): Result<string, ToolHandlerError> {
  const lexical = lexicalPath(root, relative);
  if (lexical === undefined) {
    return toolFailure("permission");
  }
  return permittedResolvedReadPath(root, policy, lexical);
}

function permittedResolvedReadPath(
  root: string,
  policy: WorkspaceReadPolicy,
  target: string,
): Result<string, ToolHandlerError> {
  if (!inside(root, target)) {
    return toolFailure("permission");
  }
  const normalized = policyPath(root, target);
  const denied = policy.denies(normalized);
  return denied.ok && !denied.value
    ? ok(normalized)
    : toolFailure("permission");
}

function permittedDiscoveredPath(
  policy: WorkspaceReadPolicy,
  relative: string,
): boolean {
  const denied = policy.denies(relative);
  return denied.ok && !denied.value;
}

async function existingPath(
  root: string,
  relative: string,
  kind: "directory" | "file",
): Promise<Result<string, ToolHandlerError>> {
  const resolved = await resolveExistingWorkspacePath(root, relative, kind);
  return resolved.ok ? ok(resolved.value.canonical) : resolved;
}

async function existingReadPath(
  root: string,
  policy: WorkspaceReadPolicy,
  relative: string,
  kind: "directory" | "file",
): Promise<Result<string, ToolHandlerError>> {
  const resolved = await existingPath(root, relative, kind);
  if (!resolved.ok) {
    return resolved;
  }
  const permitted = permittedResolvedReadPath(root, policy, resolved.value);
  return permitted.ok ? resolved : permitted;
}

function text(input: StructuredObject, name: string): string {
  const value = input.get(name);
  if (typeof value !== "string") {
    throw new Error("validated tool input invariant");
  }
  return value;
}

function textList(input: StructuredObject, name: string): readonly string[] {
  const value = input.get(name);
  if (
    !(value instanceof StructuredList) ||
    value.values.some((item) => typeof item !== "string")
  ) {
    throw new Error("validated tool input invariant");
  }
  return Object.freeze(value.values.map((item) => item as string));
}

function optionalInteger(
  input: StructuredObject,
  name: string,
): number | undefined {
  const value = input.get(name);
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isSafeInteger(value))
  ) {
    throw new Error("validated tool input invariant");
  }
  return value;
}

async function readDirectoryBounded(
  directory: string,
  limit: number,
  cancellation: Readonly<{ requested: boolean }>,
): Promise<Result<readonly Dirent[], ToolHandlerError>> {
  let handle: Awaited<ReturnType<typeof opendir>> | undefined;
  let operation: Result<readonly Dirent[], ToolHandlerError>;
  try {
    handle = await opendir(directory);
    const entries: Dirent[] = [];
    while (true) {
      if (cancellation.requested) {
        operation = toolFailure("cancelled");
        break;
      }
      const entry = await handle.read();
      if (entry === null) {
        operation = ok(Object.freeze(entries));
        break;
      }
      if (entries.length >= limit) {
        operation = toolFailure("limit");
        break;
      }
      entries.push(entry);
    }
  } catch (cause: unknown) {
    operation = err(mapIoError(cause));
  }
  if (handle !== undefined) {
    try {
      await handle.close();
    } catch (cause: unknown) {
      if (operation.ok) {
        operation = err(mapIoError(cause));
      }
    }
  }
  return operation;
}

function observeRead(
  observer: EvaluationReceiptRecorder | undefined,
  name: EvaluationReadName,
  target: string,
  query?: string,
): void {
  observer?.observeRead(name, target, query);
}

function readFileHandler(
  root: string,
  policy: WorkspaceReadPolicy,
  observer?: EvaluationReceiptRecorder,
): ToolHandler {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const relative = text(input, "path");
    const permitted = permittedReadPath(root, policy, relative);
    if (!permitted.ok) {
      return permitted;
    }
    const resolved = await existingReadPath(root, policy, relative, "file");
    if (!resolved.ok) {
      return resolved;
    }
    observeRead(
      observer,
      "read_file",
      relativeFromRoot(root, resolved.value),
    );
    try {
      const status = await lstat(resolved.value);
      if (status.size > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
        return toolFailure("limit");
      }
      const content = await readFile(resolved.value, { encoding: "utf8" });
      if (
        cancellation.requested ||
        content.length > BUILTIN_TOOL_LIMITS.fileCodeUnits
      ) {
        return toolFailure(
          cancellation.requested ? "cancelled" : "limit",
        );
      }
      const checked = await existingReadPath(root, policy, relative, "file");
      if (
        !checked.ok ||
        path.relative(checked.value, resolved.value) !== ""
      ) {
        return checked.ok ? toolFailure("permission") : checked;
      }
      const projection = projectWorkspaceFileRead(
        content,
        optionalInteger(input, "startLine"),
        optionalInteger(input, "lineCount"),
      );
      return projection.ok
        ? toolSuccess(projection.value)
        : toolFailure("limit");
    } catch (cause: unknown) {
      return err(mapIoError(cause));
    }
  };
}

function listDirectoryHandler(
  root: string,
  policy: WorkspaceReadPolicy,
  observer?: EvaluationReceiptRecorder,
): ToolHandler {
  return async (input, cancellation) => {
    const relative = text(input, "path");
    const permitted = permittedReadPath(root, policy, relative);
    if (!permitted.ok) {
      return permitted;
    }
    const resolved = await existingReadPath(
      root,
      policy,
      relative,
      "directory",
    );
    if (!resolved.ok) {
      return resolved;
    }
    observeRead(
      observer,
      "list_directory",
      relativeFromRoot(root, resolved.value),
    );
    const read = await readDirectoryBounded(
      resolved.value,
      BUILTIN_TOOL_LIMITS.directoryEntries,
      cancellation,
    );
    if (!read.ok) {
      return read;
    }
    const checked = await existingReadPath(
      root,
      policy,
      relative,
      "directory",
    );
    if (
      !checked.ok ||
      path.relative(checked.value, resolved.value) !== ""
    ) {
      return checked.ok ? toolFailure("permission") : checked;
    }
    const entries = [...read.value];
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    const output: Readonly<{ kind: string; name: string }>[] = [];
    const resolvedRelative = policyPath(root, resolved.value);
    for (const entry of entries) {
      const childRelative = resolvedRelative === "."
        ? entry.name
        : resolvedRelative + "/" + entry.name;
      if (!permittedDiscoveredPath(policy, childRelative)) {
        continue;
      }
      const kind = entry.isDirectory()
        ? "directory"
        : entry.isFile()
          ? "file"
          : entry.isSymbolicLink()
            ? "symlink"
            : "other";
      output.push(Object.freeze({ kind, name: entry.name }));
    }
    return toolSuccess({ entries: output });
  };
}

type SearchMatch = Readonly<{
  column: number;
  line: number;
  path: string;
  text: string;
}>;

function collectMatches(
  content: string,
  query: string,
  relative: string,
  matches: SearchMatch[],
): void {
  const lines = content.split(/\r\n|\n|\r/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines.at(index);
    if (line === undefined) {
      continue;
    }
    const column = line.indexOf(query);
    if (column >= 0) {
      matches.push(
        Object.freeze({
          column: column + 1,
          line: index + 1,
          path: relative,
          text: line.slice(0, 1_024),
        }),
      );
      if (matches.length >= BUILTIN_TOOL_LIMITS.searchMatches) {
        return;
      }
    }
  }
}

function searchTextHandler(
  root: string,
  policy: WorkspaceReadPolicy,
  observer?: EvaluationReceiptRecorder,
): ToolHandler {
  return async (input, cancellation) => {
    const query = text(input, "query");
    const requestedPath = text(input, "path");
    const permitted = permittedReadPath(root, policy, requestedPath);
    if (!permitted.ok) {
      return permitted;
    }
    const resolved = await existingReadPath(
      root,
      policy,
      requestedPath,
      "directory",
    );
    if (!resolved.ok) {
      return resolved;
    }
    observeRead(
      observer,
      "search_text",
      relativeFromRoot(root, resolved.value),
      query,
    );
    const directories = [resolved.value];
    const files: string[] = [];
    try {
      const canonicalRoot = root;
      let visitedDirectories = 0;
      let visitedEntries = 0;
      while (directories.length > 0) {
        if (cancellation.requested) {
          return toolFailure("cancelled");
        }
        const directory = directories.shift();
        if (directory === undefined) {
          break;
        }
        visitedDirectories += 1;
        if (visitedDirectories > BUILTIN_TOOL_LIMITS.searchDirectories) {
          return toolFailure("limit");
        }
        const checkedDirectory = await existingReadPath(
          root,
          policy,
          relativeFromRoot(canonicalRoot, directory),
          "directory",
        );
        if (
          !checkedDirectory.ok ||
          path.relative(checkedDirectory.value, directory) !== ""
        ) {
          return checkedDirectory.ok
            ? toolFailure("permission")
            : checkedDirectory;
        }
        const read = await readDirectoryBounded(
          directory,
          BUILTIN_TOOL_LIMITS.directoryEntries,
          cancellation,
        );
        if (!read.ok) {
          return read;
        }
        const entries = [...read.value];
        entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
        for (const entry of entries) {
          visitedEntries += 1;
          if (visitedEntries > BUILTIN_TOOL_LIMITS.searchEntries) {
            return toolFailure("limit");
          }
          if (entry.isSymbolicLink()) {
            continue;
          }
          const child = path.join(directory, entry.name);
          const childRelative = policyPath(canonicalRoot, child);
          if (!permittedDiscoveredPath(policy, childRelative)) {
            continue;
          }
          if (entry.isDirectory()) {
            const checked = await existingReadPath(
              root,
              policy,
              relativeFromRoot(canonicalRoot, child),
              "directory",
            );
            if (!checked.ok) {
              return checked;
            }
            directories.push(checked.value);
          } else if (entry.isFile()) {
            const checked = await existingReadPath(
              root,
              policy,
              relativeFromRoot(canonicalRoot, child),
              "file",
            );
            if (!checked.ok) {
              return checked;
            }
            files.push(checked.value);
            if (files.length > BUILTIN_TOOL_LIMITS.searchFiles) {
              return toolFailure("limit");
            }
          }
        }
      }
      const matches: SearchMatch[] = [];
      let scanned = 0;
      for (const file of files) {
        if (cancellation.requested) {
          return toolFailure("cancelled");
        }
        const relative = relativeFromRoot(canonicalRoot, file);
        const checkedBefore = await existingReadPath(
          root,
          policy,
          relative,
          "file",
        );
        if (
          !checkedBefore.ok ||
          path.relative(checkedBefore.value, file) !== ""
        ) {
          return checkedBefore.ok
            ? toolFailure("permission")
            : checkedBefore;
        }
        const status = await lstat(checkedBefore.value);
        scanned += status.size;
        if (scanned > BUILTIN_TOOL_LIMITS.searchTotalCodeUnits) {
          return toolFailure("limit");
        }
        if (status.size > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
          continue;
        }
        const content = await readFile(checkedBefore.value, { encoding: "utf8" });
        const checkedAfter = await existingReadPath(
          root,
          policy,
          relative,
          "file",
        );
        if (
          !checkedAfter.ok ||
          path.relative(checkedAfter.value, checkedBefore.value) !== ""
        ) {
          return checkedAfter.ok
            ? toolFailure("permission")
            : checkedAfter;
        }
        collectMatches(content, query, relative, matches);
        if (matches.length >= BUILTIN_TOOL_LIMITS.searchMatches) {
          break;
        }
      }
      return toolSuccess({ matches });
    } catch (cause: unknown) {
      return err(mapIoError(cause));
    }
  };
}

function stringSchema(
  minimum: number,
  maximum: number,
  options?: StringSchemaOptions,
): StringSchema {
  const schema = StringSchema.create(minimum, maximum, options);
  if (!schema.ok) {
    throw new Error("owned string schema invariant");
  }
  return schema.value;
}

function objectSchema(
  fields: readonly ObjectSchemaField[],
  projection?: ObjectSchemaProjection,
): ObjectSchema {
  const schema = ObjectSchema.create(fields, projection);
  if (!schema.ok) {
    throw new Error("owned object schema invariant");
  }
  return schema.value;
}

function integerSchema(minimum: number, maximum: number): IntegerSchema {
  const schema = IntegerSchema.create(minimum, maximum);
  if (!schema.ok) {
    throw new Error("owned integer schema invariant");
  }
  return schema.value;
}

function listSchema(
  item: ToolSchema,
  minimum: number,
  maximum: number,
  options: ListSchemaOptions = Object.freeze({}),
): ListSchema {
  const schema = ListSchema.create(item, minimum, maximum, options);
  if (!schema.ok) {
    throw new Error("owned list schema invariant");
  }
  return schema.value;
}

function literalStringSchema(value: string): LiteralStringSchema {
  const schema = LiteralStringSchema.create(value);
  if (!schema.ok) {
    throw new Error("owned literal string schema invariant");
  }
  return schema.value;
}

function unionSchema(variants: readonly ToolSchema[]): UnionSchema {
  const schema = UnionSchema.create(variants);
  if (!schema.ok) {
    throw new Error("owned union schema invariant");
  }
  return schema.value;
}

function descriptor(
  name: string,
  description: string,
  risk: ToolRisk,
  input: ObjectSchema,
  approvalFields: readonly ToolApprovalField[] = Object.freeze([]),
): ToolDescriptor {
  const created = ToolDescriptor.create(
    name,
    description,
    risk,
    input,
    approvalFields,
  );
  if (!created.ok) {
    throw new Error("owned descriptor invariant");
  }
  return created.value;
}

function runProcessHandler(
  root: string,
  platform: BuiltinToolsPlatform,
): ToolHandler {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const program = text(input, "program");
    const registration = platform.processPrograms.resolve(program);
    if (registration === undefined) {
      return toolFailure("unsupported");
    }
    const workingDirectory = await existingPath(
      root,
      text(input, "workingDirectory"),
      "directory",
    );
    if (!workingDirectory.ok) {
      return workingDirectory;
    }
    const result = await platform.processRunner.run(
      Object.freeze({
        arguments: textList(input, "arguments"),
        executable: registration.executable,
        processLimit: PROCESS_RUNNER_LIMITS.processCount,
        stderrBytes: PROCESS_RUNNER_LIMITS.stderrBytes,
        stdoutBytes: PROCESS_RUNNER_LIMITS.stdoutBytes,
        timeoutMilliseconds: PROCESS_RUNNER_LIMITS.timeoutMilliseconds,
        workingDirectory: workingDirectory.value,
      }),
      cancellation,
    );
    if (!result.ok) {
      return result;
    }
    return ok(
      result.value.exitCode === 0
        ? ToolHandlerOutcome.success(result.value)
        : ToolHandlerOutcome.failure(result.value),
    );
  };
}

const RUN_PROCESS_APPROVAL_FIELDS: readonly ToolApprovalField[] =
  Object.freeze([
    Object.freeze({ mode: "exact" as const, name: "program" }),
    Object.freeze({ mode: "exact" as const, name: "arguments" }),
    Object.freeze({ mode: "exact" as const, name: "workingDirectory" }),
  ]);

const MANAGE_PATH_APPROVAL_FIELDS: readonly ToolApprovalField[] =
  Object.freeze([
    Object.freeze({ mode: "exact" as const, name: "request" }),
  ]);

const PROCESS_TEXT_SCHEMA_OPTIONS: StringSchemaOptions = Object.freeze({
  maximumUtf8Bytes: PROCESS_RUNNER_LIMITS.textUtf8Bytes,
  rejectNul: true,
});

function registrations(
  root: string,
  policy: WorkspaceReadPolicy,
  platform: BuiltinToolsPlatform,
  observer?: EvaluationReceiptRecorder,
) {
  const pathField = {
    description: 'Workspace-relative path. Use "." for the workspace root.',
    name: "path",
    required: true,
    schema: stringSchema(1, 4_096, {
      maximumUtf8Bytes: BUILTIN_TOOL_LIMITS.pathUtf8Bytes,
      rejectNul: true,
    }),
  } as const;
  const patchPathField = {
    description: "Workspace-relative mutation target path.",
    name: "path",
    required: true,
    schema: stringSchema(1, TEXT_PATCH_LIMITS.pathCodeUnits, {
      maximumProjectionCodeUnits:
        TEXT_PATCH_LIMITS.pathProjectionCodeUnits,
      maximumUtf8Bytes: BUILTIN_TOOL_LIMITS.pathUtf8Bytes,
      rejectNul: true,
    }),
  } as const;
  const patchTextSchema = stringSchema(
    0,
    BUILTIN_TOOL_LIMITS.fileCodeUnits,
    {
      maximumUtf8Bytes: BUILTIN_TOOL_LIMITS.fileUtf8Bytes,
      rejectNul: true,
    },
  );
  const namespacePathSchema = stringSchema(
    1,
    WORKSPACE_NAMESPACE_LIMITS.pathCodeUnits,
    {
      maximumUtf8Bytes: WORKSPACE_NAMESPACE_LIMITS.pathUtf8Bytes,
      rejectNul: true,
    },
  );
  const namespacePathField = {
    description: "Workspace-relative namespace path.",
    name: "path",
    required: true,
    schema: namespacePathSchema,
  } as const;
  return Object.freeze([
    Object.freeze({
      descriptor: descriptor(
        "read_file",
        "Read one permitted bounded UTF-8 workspace file with optional exact logical-line projection.",
        "read",
        objectSchema([
          pathField,
          {
            description: "Optional one-based first logical line. Defaults to 1.",
            name: "startLine",
            required: false,
            schema: integerSchema(1, BUILTIN_TOOL_LIMITS.fileLineNumber),
          },
          {
            description: "Optional maximum logical lines to return. Omit for every remaining line.",
            name: "lineCount",
            required: false,
            schema: integerSchema(1, BUILTIN_TOOL_LIMITS.fileRangeLines),
          },
        ]),
      ),
      handler: readFileHandler(root, policy, observer),
    }),
    Object.freeze({
      descriptor: descriptor(
        "list_directory",
        "List permitted entries in one bounded workspace directory without following symlinks.",
        "read",
        objectSchema([pathField]),
      ),
      handler: listDirectoryHandler(root, policy, observer),
    }),
    Object.freeze({
      descriptor: descriptor(
        "search_text",
        "Search exact text in permitted bounded workspace files.",
        "read",
        objectSchema([
          pathField,
          {
            description: "Exact non-empty text to find.",
            name: "query",
            required: true,
            schema: stringSchema(1, 256),
          },
        ]),
      ),
      handler: searchTextHandler(root, policy, observer),
    }),
    Object.freeze({
      descriptor: descriptor(
        "apply_patch",
        "Create or update one bounded UTF-8 workspace file through ordered exact-text hunks.",
        "write",
        objectSchema([
          patchPathField,
          {
            description: "Ordered exact-text hunks applied to one observed source snapshot.",
            name: "hunks",
            required: true,
            schema: listSchema(
              objectSchema([
                {
                  description: "Exact source anchor, or empty only for absent-target creation.",
                  name: "oldText",
                  required: true,
                  schema: patchTextSchema,
                },
                {
                  description: "Replacement text, or complete new-file content for creation.",
                  name: "newText",
                  required: true,
                  schema: patchTextSchema,
                },
              ]),
              1,
              TEXT_PATCH_LIMITS.hunks,
              Object.freeze({
                maximumTextCodeUnits: TEXT_PATCH_LIMITS.aggregateCodeUnits,
                maximumTextUtf8Bytes: TEXT_PATCH_LIMITS.aggregateUtf8Bytes,
              }),
            ),
          },
        ]),
        Object.freeze([
          Object.freeze({ mode: "exact" as const, name: "path" }),
          Object.freeze({ mode: "size" as const, name: "hunks" }),
        ]),
      ),
      planner: applyPatchPlanner(root, platform.mutationCommitter),
    }),
    Object.freeze({
      descriptor: descriptor(
        "manage_path",
        "Create one directory, move one file or directory, or remove one file or empty directory within the workspace.",
        "write",
        objectSchema([
          {
            description: "One exact non-recursive namespace operation.",
            name: "request",
            required: true,
            schema: unionSchema([
              objectSchema([
                {
                  description: "Create exactly one absent directory.",
                  name: "operation",
                  required: true,
                  schema: literalStringSchema("create_directory"),
                },
                namespacePathField,
              ]),
              objectSchema([
                {
                  description: "Move one existing file or directory without replacement.",
                  name: "operation",
                  required: true,
                  schema: literalStringSchema("move"),
                },
                namespacePathField,
                {
                  description: "Absent workspace-relative destination path.",
                  name: "destination",
                  required: true,
                  schema: namespacePathSchema,
                },
              ]),
              objectSchema([
                {
                  description: "Remove one regular file or empty directory.",
                  name: "operation",
                  required: true,
                  schema: literalStringSchema("remove"),
                },
                namespacePathField,
              ]),
            ]),
          },
        ], {
          fields: MANAGE_PATH_APPROVAL_FIELDS,
          maximumCodeUnits: TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits,
        }),
        MANAGE_PATH_APPROVAL_FIELDS,
      ),
      planner: managePathPlanner(root, platform.namespaceCommitter),
    }),
    Object.freeze({
      descriptor: descriptor(
        "run_process",
        "Run one approved terminating program with bounded arguments in a workspace directory. Persistent services are unsupported.",
        "execute",
        objectSchema([
          {
            description: "Registered program token. The initial value is node.",
            name: "program",
            required: true,
            schema: literalStringSchema(PROCESS_PROGRAM_TOKENS.node),
          },
          {
            description: "Ordered program arguments without shell parsing.",
            name: "arguments",
            required: true,
            schema: listSchema(
              stringSchema(
                0,
                PROCESS_RUNNER_LIMITS.argumentCodeUnits,
                PROCESS_TEXT_SCHEMA_OPTIONS,
              ),
              0,
              PROCESS_RUNNER_LIMITS.arguments,
            ),
          },
          {
            description: "Existing workspace-relative working directory.",
            name: "workingDirectory",
            required: true,
            schema: stringSchema(
              1,
              PROCESS_RUNNER_LIMITS.workingDirectoryCodeUnits,
              PROCESS_TEXT_SCHEMA_OPTIONS,
            ),
          },
        ], {
          fields: RUN_PROCESS_APPROVAL_FIELDS,
          maximumCodeUnits: TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits,
        }),
        RUN_PROCESS_APPROVAL_FIELDS,
      ),
      handler: runProcessHandler(root, platform),
    }),
  ]);
}

/** Creates the complete initial tool engine for one accepted workspace. */
export function createBuiltinToolEngine(
  boundary: unknown,
  readPolicy: unknown,
  platform: BuiltinToolsPlatform,
  observer?: EvaluationReceiptRecorder,
): Result<ToolEngine, BuiltinToolsError> {
  const acceptedRoot = WorkspaceBoundary.rootOf(boundary);
  if (!acceptedRoot.ok) {
    return err(Object.freeze({ kind: "invalidRoot" as const }));
  }
  const root = acceptedRoot.value;
  const acceptedPolicy = WorkspaceReadPolicy.forRoot(readPolicy, root);
  if (!acceptedPolicy.ok) {
    return err(Object.freeze({ kind: "invalidReadPolicy" as const }));
  }
  if (
    platform === null ||
    typeof platform !== "object" ||
    platform.mutationCommitter === null ||
    typeof platform.mutationCommitter !== "object" ||
    typeof platform.mutationCommitter.commit !== "function" ||
    platform.namespaceCommitter === null ||
    typeof platform.namespaceCommitter !== "object" ||
    typeof platform.namespaceCommitter.supportsOperation !== "function" ||
    typeof platform.namespaceCommitter.commit !== "function" ||
    !(platform.processPrograms instanceof ProcessProgramRegistry) ||
    platform.processRunner === null ||
    typeof platform.processRunner !== "object" ||
    typeof platform.processRunner.run !== "function"
  ) {
    return err(Object.freeze({ kind: "invalidPlatform" as const }));
  }
  try {
    const registry = ToolRegistry.create(
      registrations(root, acceptedPolicy.value, platform, observer),
    );
    if (!registry.ok) {
      return err(Object.freeze({ kind: "invariant" as const }));
    }
    const engine = ToolEngine.create(registry.value);
    return engine.ok
      ? ok(engine.value)
      : err(Object.freeze({ kind: "invariant" as const }));
  } catch (_cause: unknown) {
    return err(Object.freeze({ kind: "invariant" as const }));
  }
}
