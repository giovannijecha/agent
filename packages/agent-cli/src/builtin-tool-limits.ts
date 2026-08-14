/** Shared fixed bounds for the initial CLI-owned workspace tools. */
export const BUILTIN_TOOL_LIMITS = Object.freeze({
  directoryEntries: 512,
  fileCodeUnits: 262_144,
  fileUtf8Bytes: 1_048_576,
  pathUtf8Bytes: 16_384,
  searchFiles: 2_048,
  searchDirectories: 512,
  searchEntries: 4_096,
  searchMatches: 256,
  searchTotalCodeUnits: 4_194_304,
});
