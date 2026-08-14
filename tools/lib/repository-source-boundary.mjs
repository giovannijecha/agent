const IGNORED_ROOT_DIRECTORIES = Object.freeze([
  ".git",
  "node_modules",
  "state",
]);

/** Excludes exact repository-root metadata, dependencies, and local state. */
export function isIgnoredRepositorySourceDirectory(relativePath) {
  return typeof relativePath === "string" &&
    IGNORED_ROOT_DIRECTORIES.includes(relativePath);
}
