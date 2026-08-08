export type CommandResult =
  | Readonly<{ kind: "approve" }>
  | Readonly<{ kind: "deny" }>
  | Readonly<{ kind: "exit" }>
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "notice"; lines: readonly string[] }>
  | Readonly<{ kind: "submit"; text: string }>;

const EXIT = Object.freeze({ kind: "exit" as const });
const NONE = Object.freeze({ kind: "none" as const });

function notice(...lines: string[]): CommandResult {
  return Object.freeze({ kind: "notice" as const, lines: Object.freeze(lines) });
}

/** Classifies one submission as an exact command or transient model input. */
export function executeSubmission(input: string): CommandResult {
  const command = input.trim();
  if (command.length === 0) {
    return NONE;
  }
  if (command === "/exit") {
    return EXIT;
  }
  if (command === "/help") {
    return notice(
      "Commands",
      "/help       show this reference",
      "/providers  show integration availability",
      "/approve    allow the pending write or execute tool",
      "/deny       reject the pending write or execute tool",
      "/exit       close agent",
    );
  }
  if (command === "/providers") {
    return notice(
      "No providers are enabled.",
      "Subscription integrations require owned authorization.",
    );
  }
  if (command === "/approve") {
    return Object.freeze({ kind: "approve" as const });
  }
  if (command === "/deny") {
    return Object.freeze({ kind: "deny" as const });
  }
  if (command.startsWith("/")) {
    return notice("Unknown command. Use /help.");
  }
  return Object.freeze({ kind: "submit" as const, text: input });
}
