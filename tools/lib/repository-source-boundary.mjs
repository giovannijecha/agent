import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";

const IGNORED_ROOT_DIRECTORIES = Object.freeze([
  ".git",
  "node_modules",
  "state",
]);

export class RepositorySourceBoundaryError extends Error {
  constructor(code) {
    super("repository source " + code);
    this.name = "RepositorySourceBoundaryError";
    this.code = code;
  }
}

function fail(code) {
  throw new RepositorySourceBoundaryError(code);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

/** Reads one regular repository source through a bounded stable descriptor. */
export function readBoundedRegularSourceFile(file, maximumBytes) {
  if (
    typeof file !== "string" ||
    file.length === 0 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1
  ) {
    fail("invalidFile");
  }
  let descriptor;
  try {
    const observed = lstatSync(file, {
      bigint: true,
      throwIfNoEntry: false,
    });
    if (
      observed === undefined ||
      !observed.isFile() ||
      observed.isSymbolicLink() ||
      observed.size < 1n ||
      observed.size > BigInt(maximumBytes)
    ) {
      fail("invalidFile");
    }
    descriptor = openSync(file, "r");
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      !sameIdentity(observed, opened) ||
      opened.size !== observed.size
    ) {
      fail("invalidFile");
    }
    const bounded = new Uint8Array(maximumBytes + 1);
    let offset = 0;
    while (offset < bounded.length) {
      const count = readSync(
        descriptor,
        bounded,
        offset,
        bounded.length - offset,
        null,
      );
      if (count === 0) {
        break;
      }
      offset += count;
    }
    const completed = fstatSync(descriptor, { bigint: true });
    if (
      offset < 1 ||
      offset > maximumBytes ||
      !completed.isFile() ||
      !sameIdentity(opened, completed) ||
      completed.size !== opened.size ||
      completed.size !== BigInt(offset) ||
      completed.mtimeNs !== opened.mtimeNs
    ) {
      fail("invalidFile");
    }
    return bounded.slice(0, offset);
  } catch (error) {
    if (error instanceof RepositorySourceBoundaryError) {
      throw error;
    }
    fail("invalidFile");
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        fail("invalidFile");
      }
    }
  }
}

/** Excludes exact repository-root metadata, dependencies, and local state. */
export function isIgnoredRepositorySourceDirectory(relativePath) {
  return typeof relativePath === "string" &&
    IGNORED_ROOT_DIRECTORIES.includes(relativePath);
}
