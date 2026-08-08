import {
  type Dirent,
  lstat,
  open,
  opendir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { err, ok, type Result, StructuredObject } from "@agent/core";
import {
  ObjectSchema,
  type ObjectSchemaField,
  StringSchema,
  type ToolApprovalField,
  ToolDescriptor,
  ToolEngine,
  type ToolHandler,
  type ToolHandlerError,
  ToolRegistry,
  type ToolRisk,
} from "@agent/tools";

export const BUILTIN_TOOL_LIMITS = Object.freeze({
  directoryEntries: 512,
  fileCodeUnits: 262_144,
  searchFiles: 2_048,
  searchDirectories: 512,
  searchEntries: 4_096,
  searchMatches: 256,
  searchTotalCodeUnits: 4_194_304,
});

export type BuiltinToolsErrorKind = "invalidRoot" | "invariant";
export type BuiltinToolsError = Readonly<{ kind: BuiltinToolsErrorKind }>;

type ToolFailureKind = ToolHandlerError["kind"];

function toolFailure(kind: ToolFailureKind): Result<never, ToolHandlerError> {
  return err(Object.freeze({ kind }));
}

function mapIoError(cause: unknown): ToolHandlerError {
  try {
    if (cause !== null && typeof cause === "object") {
      const code = (cause as Readonly<{ code?: unknown }>).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return Object.freeze({ kind: "notFound" as const });
      }
      if (code === "EACCES" || code === "EPERM") {
        return Object.freeze({ kind: "permission" as const });
      }
      if (code === "EEXIST") {
        return Object.freeze({ kind: "conflict" as const });
      }
    }
  } catch (_cause: unknown) {
    return Object.freeze({ kind: "io" as const });
  }
  return Object.freeze({ kind: "io" as const });
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(".." + path.sep))
  );
}

function lexicalPath(root: string, relative: string): string | undefined {
  if (
    relative.length === 0 ||
    relative.includes("\u0000") ||
    /\p{Cc}/u.test(relative) ||
    path.isAbsolute(relative)
  ) {
    return undefined;
  }
  const target = path.resolve(root, relative);
  return inside(root, target) ? target : undefined;
}

function relativeFromRoot(root: string, target: string): string {
  const relative = path.relative(root, target);
  return relative.length === 0 ? "." : relative;
}

async function rejectSymlinkTraversal(
  root: string,
  target: string,
): Promise<Result<void, ToolHandlerError>> {
  const relative = path.relative(root, target);
  let current = root;
  try {
    for (const component of relative.split(path.sep)) {
      if (component.length === 0) {
        continue;
      }
      current = path.join(current, component);
      if ((await lstat(current)).isSymbolicLink()) {
        return toolFailure("permission");
      }
    }
    return ok(undefined);
  } catch (cause: unknown) {
    return err(mapIoError(cause));
  }
}

async function existingPath(
  root: string,
  relative: string,
  kind: "directory" | "file",
): Promise<Result<string, ToolHandlerError>> {
  const lexical = lexicalPath(root, relative);
  if (lexical === undefined) {
    return toolFailure("permission");
  }
  try {
    const noSymlinks = await rejectSymlinkTraversal(root, lexical);
    if (!noSymlinks.ok) {
      return noSymlinks;
    }
    const canonicalRoot = await realpath(root);
    const status = await lstat(lexical);
    if (status.isSymbolicLink()) {
      return toolFailure("permission");
    }
    if (
      (kind === "file" && !status.isFile()) ||
      (kind === "directory" && !status.isDirectory())
    ) {
      return toolFailure("unsupported");
    }
    const canonical = await realpath(lexical);
    return inside(canonicalRoot, canonical)
      ? ok(canonical)
      : toolFailure("permission");
  } catch (cause: unknown) {
    return err(mapIoError(cause));
  }
}

async function creationPath(
  root: string,
  relative: string,
): Promise<Result<string, ToolHandlerError>> {
  const lexical = lexicalPath(root, relative);
  if (lexical === undefined) {
    return toolFailure("permission");
  }
  try {
    const noSymlinks = await rejectSymlinkTraversal(
      root,
      path.dirname(lexical),
    );
    if (!noSymlinks.ok) {
      return noSymlinks;
    }
    const canonicalRoot = await realpath(root);
    const canonicalParent = await realpath(path.dirname(lexical));
    return inside(canonicalRoot, canonicalParent)
      ? ok(path.join(canonicalParent, path.basename(lexical)))
      : toolFailure("permission");
  } catch (cause: unknown) {
    return err(mapIoError(cause));
  }
}

function text(input: StructuredObject, name: string): string {
  const value = input.get(name);
  if (typeof value !== "string") {
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

async function writeFileHandleComplete(
  handle: Awaited<ReturnType<typeof open>>,
  content: string,
): Promise<Result<void, ToolHandlerError>> {
  const bytes = encodeUtf8(content);
  let offset = 0;
  while (offset < bytes.length) {
    const written = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      offset,
    );
    if (
      !Number.isSafeInteger(written.bytesWritten) ||
      written.bytesWritten < 1 ||
      written.bytesWritten > bytes.length - offset
    ) {
      return toolFailure("io");
    }
    offset += written.bytesWritten;
  }
  await handle.truncate(bytes.length);
  return ok(undefined);
}

function encodeUtf8(content: string): Uint8Array {
  const bytes = new Uint8Array(content.length * 3);
  let offset = 0;
  for (const character of content) {
    let point = character.codePointAt(0) ?? 0xfffd;
    if (point >= 0xd800 && point <= 0xdfff) {
      point = 0xfffd;
    }
    if (point <= 0x7f) {
      bytes.set([point], offset);
      offset += 1;
    } else if (point <= 0x7ff) {
      bytes.set([0xc0 | (point >> 6), 0x80 | (point & 0x3f)], offset);
      offset += 2;
    } else if (point <= 0xffff) {
      bytes.set(
        [
          0xe0 | (point >> 12),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        ],
        offset,
      );
      offset += 3;
    } else {
      bytes.set(
        [
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f),
        ],
        offset,
      );
      offset += 4;
    }
  }
  return bytes.slice(0, offset);
}

function readFileHandler(root: string): ToolHandler {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const relative = text(input, "path");
    const resolved = await existingPath(root, relative, "file");
    if (!resolved.ok) {
      return resolved;
    }
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
      const checked = await existingPath(root, relative, "file");
      if (
        !checked.ok ||
        path.relative(checked.value, resolved.value) !== ""
      ) {
        return checked.ok ? toolFailure("permission") : checked;
      }
      return ok({ text: content });
    } catch (cause: unknown) {
      return err(mapIoError(cause));
    }
  };
}

function listDirectoryHandler(root: string): ToolHandler {
  return async (input, cancellation) => {
    const relative = text(input, "path");
    const resolved = await existingPath(
      root,
      relative,
      "directory",
    );
    if (!resolved.ok) {
      return resolved;
    }
    const read = await readDirectoryBounded(
      resolved.value,
      BUILTIN_TOOL_LIMITS.directoryEntries,
      cancellation,
    );
    if (!read.ok) {
      return read;
    }
    const checked = await existingPath(root, relative, "directory");
    if (
      !checked.ok ||
      path.relative(checked.value, resolved.value) !== ""
    ) {
      return checked.ok ? toolFailure("permission") : checked;
    }
    const entries = [...read.value];
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    const output: Readonly<{ kind: string; name: string }>[] = [];
    for (const entry of entries) {
      const kind = entry.isDirectory()
        ? "directory"
        : entry.isFile()
          ? "file"
          : entry.isSymbolicLink()
            ? "symlink"
            : "other";
      output.push(Object.freeze({ kind, name: entry.name }));
    }
    return ok({ entries: output });
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

function searchTextHandler(root: string): ToolHandler {
  return async (input, cancellation) => {
    const query = text(input, "query");
    const resolved = await existingPath(
      root,
      text(input, "path"),
      "directory",
    );
    if (!resolved.ok) {
      return resolved;
    }
    const directories = [resolved.value];
    const files: string[] = [];
    try {
      const canonicalRoot = await realpath(root);
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
        const checkedDirectory = await existingPath(
          root,
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
          if (entry.isDirectory()) {
            const checked = await existingPath(
              root,
              relativeFromRoot(canonicalRoot, child),
              "directory",
            );
            if (!checked.ok) {
              return checked;
            }
            directories.push(checked.value);
          } else if (entry.isFile()) {
            const checked = await existingPath(
              root,
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
        const checkedBefore = await existingPath(root, relative, "file");
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
        const checkedAfter = await existingPath(root, relative, "file");
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
      return ok({ matches });
    } catch (cause: unknown) {
      return err(mapIoError(cause));
    }
  };
}

function createFileHandler(root: string): ToolHandler {
  return async (input, cancellation) => {
    if (cancellation.requested) {
      return toolFailure("cancelled");
    }
    const content = text(input, "content");
    const resolved = await creationPath(root, text(input, "path"));
    if (!resolved.ok) {
      return resolved;
    }
    try {
      await writeFile(resolved.value, content, {
        encoding: "utf8",
        flag: "wx",
      });
      return ok({ created: true });
    } catch (cause: unknown) {
      return err(mapIoError(cause));
    }
  };
}

function replaceTextHandler(root: string): ToolHandler {
  return async (input, cancellation) => {
    const oldText = text(input, "oldText");
    const newText = text(input, "newText");
    const resolved = await existingPath(root, text(input, "path"), "file");
    if (!resolved.ok) {
      return resolved;
    }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let operation: Result<unknown, ToolHandlerError>;
    try {
      handle = await open(resolved.value, "r+");
      const status = await handle.stat();
      if (status.size > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
        operation = toolFailure("limit");
      } else {
        const content = await handle.readFile({ encoding: "utf8" });
        const first = content.indexOf(oldText);
        const second =
          first < 0 ? -1 : content.indexOf(oldText, first + oldText.length);
        if (first < 0 || second >= 0) {
          operation = toolFailure("conflict");
        } else {
          const replacement =
            content.slice(0, first) +
            newText +
            content.slice(first + oldText.length);
          if (replacement.length > BUILTIN_TOOL_LIMITS.fileCodeUnits) {
            operation = toolFailure("limit");
          } else if (cancellation.requested) {
            operation = toolFailure("cancelled");
          } else {
            const written = await writeFileHandleComplete(handle, replacement);
            operation = written.ok
              ? ok({ replacements: 1 })
              : written;
          }
        }
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
  };
}

function stringSchema(minimum: number, maximum: number): StringSchema {
  const schema = StringSchema.create(minimum, maximum);
  if (!schema.ok) {
    throw new Error("owned string schema invariant");
  }
  return schema.value;
}

function objectSchema(
  fields: readonly ObjectSchemaField[],
): ObjectSchema {
  const schema = ObjectSchema.create(fields);
  if (!schema.ok) {
    throw new Error("owned object schema invariant");
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

function registrations(root: string) {
  const pathField = {
    description: "Workspace-relative path.",
    name: "path",
    required: true,
    schema: stringSchema(1, 4_096),
  } as const;
  const contentField = {
    description: "Complete UTF-8 text content.",
    name: "content",
    required: true,
    schema: stringSchema(0, BUILTIN_TOOL_LIMITS.fileCodeUnits),
  } as const;
  return Object.freeze([
    Object.freeze({
      descriptor: descriptor(
        "read_file",
        "Read one bounded UTF-8 workspace file.",
        "read",
        objectSchema([pathField]),
      ),
      handler: readFileHandler(root),
    }),
    Object.freeze({
      descriptor: descriptor(
        "list_directory",
        "List one bounded workspace directory without following symlinks.",
        "read",
        objectSchema([pathField]),
      ),
      handler: listDirectoryHandler(root),
    }),
    Object.freeze({
      descriptor: descriptor(
        "search_text",
        "Search exact text in bounded workspace files.",
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
      handler: searchTextHandler(root),
    }),
    Object.freeze({
      descriptor: descriptor(
        "create_file",
        "Create one new workspace file without overwriting an existing path.",
        "write",
        objectSchema([pathField, contentField]),
        Object.freeze([
          Object.freeze({ mode: "exact" as const, name: "path" }),
          Object.freeze({ mode: "size" as const, name: "content" }),
        ]),
      ),
      handler: createFileHandler(root),
    }),
    Object.freeze({
      descriptor: descriptor(
        "replace_text",
        "Replace exactly one occurrence in one bounded workspace file.",
        "write",
        objectSchema([
          pathField,
          {
            description: "Exact text that must occur once.",
            name: "oldText",
            required: true,
            schema: stringSchema(1, BUILTIN_TOOL_LIMITS.fileCodeUnits),
          },
          {
            description: "Replacement text.",
            name: "newText",
            required: true,
            schema: stringSchema(0, BUILTIN_TOOL_LIMITS.fileCodeUnits),
          },
        ]),
        Object.freeze([
          Object.freeze({ mode: "exact" as const, name: "path" }),
          Object.freeze({ mode: "size" as const, name: "oldText" }),
          Object.freeze({ mode: "size" as const, name: "newText" }),
        ]),
      ),
      handler: replaceTextHandler(root),
    }),
  ]);
}

/** Creates the complete initial tool engine for one explicit absolute root. */
export function createBuiltinToolEngine(
  root: string,
): Result<ToolEngine, BuiltinToolsError> {
  if (typeof root !== "string" || !path.isAbsolute(root) || root.includes("\u0000")) {
    return err(Object.freeze({ kind: "invalidRoot" as const }));
  }
  try {
    const registry = ToolRegistry.create(registrations(path.resolve(root)));
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
