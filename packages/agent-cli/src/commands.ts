import type { NoticeLevel } from "./notice.js";

export type CommandResult =
  | Readonly<{ kind: "exit" }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "permissions" }>
  | Readonly<{
      kind: "notice";
      level: NoticeLevel;
      lines: readonly string[];
    }>
  | Readonly<{ kind: "submit"; text: string }>;

export type ProviderPresentation = Readonly<{
  authentication: string;
  displayName: string;
  model: string;
}>;

export type CommandName = "/exit" | "/permissions" | "/providers";

export type CommandDefinition = Readonly<{
  command: CommandName;
  description: string;
}>;

/** Exact, immutable command surface shared by dispatch and completion. */
export const COMMANDS: readonly CommandDefinition[] = Object.freeze([
  Object.freeze({
    command: "/providers" as const,
    description: "show integration availability",
  }),
  Object.freeze({
    command: "/permissions" as const,
    description: "set session tool permissions",
  }),
  Object.freeze({ command: "/exit" as const, description: "close agent" }),
]);

const EXIT = Object.freeze({ kind: "exit" as const });
const NONE = Object.freeze({ kind: "none" as const });

function notice(level: NoticeLevel, ...lines: string[]): CommandResult {
  return Object.freeze({
    kind: "notice" as const,
    level,
    lines: Object.freeze(lines),
  });
}

/** Returns bounded exact-prefix matches without accepting aliases or arguments. */
export function commandCompletions(
  draft: string,
): readonly CommandDefinition[] {
  if (
    draft.length === 0 ||
    !draft.startsWith("/") ||
    /\s/u.test(draft)
  ) {
    return Object.freeze([]);
  }
  if (COMMANDS.some((definition) => definition.command === draft)) {
    return Object.freeze([]);
  }
  return Object.freeze(
    COMMANDS.filter((definition) => definition.command.startsWith(draft)),
  );
}

/** Classifies one submission as an exact command or transient model input. */
export function executeSubmission(
  input: string,
  provider?: ProviderPresentation,
): CommandResult {
  const command = input.trim();
  if (command.length === 0) {
    return NONE;
  }
  const exact = COMMANDS.find(
    (definition) => definition.command === command,
  )?.command;
  if (exact === "/exit") {
    return EXIT;
  }
  if (exact === "/providers") {
    if (provider !== undefined) {
      return notice(
        "info",
        provider.displayName +
          " \u00b7 " +
          provider.model +
          " \u00b7 " +
          provider.authentication,
      );
    }
    return notice("info", "No provider configured");
  }
  if (exact === "/permissions") {
    return Object.freeze({ kind: "permissions" as const });
  }
  if (command.startsWith("/")) {
    return notice("warning", "Unknown command");
  }
  return Object.freeze({ kind: "submit" as const, text: input });
}
