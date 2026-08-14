import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import path from "node:path";

export function repositorySourceOpenFlags(fileSystemConstants) {
  return fileSystemConstants.O_RDONLY |
    (fileSystemConstants.O_NOFOLLOW ?? 0) |
    (fileSystemConstants.O_NONBLOCK ?? 0);
}

const REGULAR_SOURCE_OPEN_FLAGS = repositorySourceOpenFlags(constants);

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

export function hasStableRegularSourceState(left, right) {
  return sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs;
}

function observeDirectory(directory) {
  const observed = lstatSync(directory, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (
    observed === undefined ||
    !observed.isDirectory() ||
    observed.isSymbolicLink()
  ) {
    fail("invalidFile");
  }
  return observed;
}

function observeRegularFile(file, maximumBytes) {
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
  return observed;
}

function observeRepositoryPath(repositoryRoot, relativeFile) {
  if (
    typeof repositoryRoot !== "string" ||
    repositoryRoot.length === 0 ||
    !path.isAbsolute(repositoryRoot) ||
    path.resolve(repositoryRoot) !== repositoryRoot ||
    typeof relativeFile !== "string" ||
    relativeFile.length === 0 ||
    relativeFile.includes("\\")
  ) {
    fail("invalidFile");
  }
  const segments = relativeFile.split("/");
  if (
    segments.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    fail("invalidFile");
  }
  const directories = [];
  let current = repositoryRoot;
  directories.push(Object.freeze({
    path: current,
    state: observeDirectory(current),
  }));
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    directories.push(Object.freeze({
      path: current,
      state: observeDirectory(current),
    }));
  }
  return Object.freeze({
    directories: Object.freeze(directories),
    file: path.join(current, segments.at(-1)),
  });
}

function verifyDirectoryChain(directories) {
  for (const directory of directories) {
    const current = observeDirectory(directory.path);
    if (!sameIdentity(directory.state, current)) {
      fail("invalidFile");
    }
  }
}

function verifyOpenedFile(file, expected, opened, maximumBytes) {
  const current = observeRegularFile(file, maximumBytes);
  if (
    !hasStableRegularSourceState(expected, current) ||
    !hasStableRegularSourceState(opened, current)
  ) {
    fail("invalidFile");
  }
}

/** Reads one repository-relative regular source through a bounded descriptor. */
export function readBoundedRegularSourceFile(
  repositoryRoot,
  relativeFile,
  maximumBytes,
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1
  ) {
    fail("invalidFile");
  }
  let descriptor;
  try {
    const observedPath = observeRepositoryPath(repositoryRoot, relativeFile);
    const observed = observeRegularFile(observedPath.file, maximumBytes);
    descriptor = openSync(observedPath.file, REGULAR_SOURCE_OPEN_FLAGS);
    const opened = fstatSync(descriptor, { bigint: true });
    if (
      !opened.isFile() ||
      !hasStableRegularSourceState(observed, opened)
    ) {
      fail("invalidFile");
    }
    verifyDirectoryChain(observedPath.directories);
    verifyOpenedFile(observedPath.file, observed, opened, maximumBytes);
    verifyDirectoryChain(observedPath.directories);
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
    verifyDirectoryChain(observedPath.directories);
    verifyOpenedFile(observedPath.file, observed, completed, maximumBytes);
    verifyDirectoryChain(observedPath.directories);
    if (
      offset < 1 ||
      offset > maximumBytes ||
      !completed.isFile() ||
      !hasStableRegularSourceState(opened, completed) ||
      completed.size !== BigInt(offset)
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
