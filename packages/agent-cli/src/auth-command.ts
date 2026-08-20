import {
  stdin,
  stdout,
  type ReadableStream,
} from "node:process";

import { err, ok, type Result } from "@agent/core";

import {
  readAuthChoice,
  readConcealedCredential,
} from "./auth-terminal.js";
import {
  openOllamaCredentialMutation,
  type CredentialBoundaryError,
  type OllamaCredentialMutationAction,
  type OllamaCredentialMutationPort,
} from "./credential-broker.js";
import {
  writeProcessText,
  type ProcessTextOutput,
} from "./process-output.js";

export type AuthCommandError = Readonly<{
  kind:
    | CredentialBoundaryError["kind"]
    | "environmentAuthority"
    | "input"
    | "output";
}>;
export type AuthCommandResult =
  "cancelled" | "registered" | "removed" | "replaced";

function failure(kind: AuthCommandError["kind"]): AuthCommandError {
  return Object.freeze({ kind });
}

export type AuthCredentialOpener = (
  platform: string,
  architecture: string,
  environmentPresent: boolean,
) => Promise<
  Result<OllamaCredentialMutationPort, CredentialBoundaryError>
>;

async function write(
  output: ProcessTextOutput,
  text: string,
): Promise<Result<void, AuthCommandError>> {
  const written = await writeProcessText(output, text);
  return written.ok ? ok(undefined) : err(failure("output"));
}

/** Owns the exact local Ollama authentication interaction outside the TUI. */
export async function runAuthCommand(
  platform: string,
  architecture: string,
  environmentValue: string | undefined,
  input: ReadableStream = stdin,
  output: ProcessTextOutput = stdout,
  openMutation: AuthCredentialOpener = openOllamaCredentialMutation,
): Promise<Result<AuthCommandResult, AuthCommandError>> {
  const opened = await openMutation(
    platform,
    architecture,
    environmentValue !== undefined,
  );
  if (!opened.ok) return err(failure(opened.error.kind));
  const mutation = opened.value;
  if (environmentValue !== undefined && mutation.state === "absent") {
    const cancelled = await mutation.cancel();
    if (!cancelled.ok) return err(failure(cancelled.error.kind));
    return err(failure("environmentAuthority"));
  }

  const heading = await write(
    output,
    mutation.state === "absent"
      ? "Ollama Cloud authentication\n[r] Register  [c] Cancel\n"
      : "Ollama Cloud authentication\n[r] Replace  [d] Remove  [c] Cancel\n",
  );
  if (!heading.ok) {
    await mutation.cancel();
    return heading;
  }
  const choice = await readAuthChoice(
    mutation.state === "absent" ? ["r", "c"] : ["r", "d", "c"],
    input,
  );
  if (!choice.ok) {
    await mutation.cancel();
    return err(failure("input"));
  }
  if (choice.value.kind === "cancelled" || choice.value.value === "c") {
    const cancelled = await mutation.cancel();
    return cancelled.ok
      ? ok("cancelled")
      : err(failure(cancelled.error.kind));
  }

  let action: OllamaCredentialMutationAction;
  if (choice.value.value === "d") {
    action = Object.freeze({ kind: "remove" as const });
  } else {
    const prompt = await write(output, "API key: ");
    if (!prompt.ok) {
      await mutation.cancel();
      return prompt;
    }
    const entered = await readConcealedCredential(input);
    const line = await write(output, "\n");
    if (!line.ok) {
      await mutation.cancel();
      return line;
    }
    if (!entered.ok) {
      await mutation.cancel();
      return err(failure("input"));
    }
    if (entered.value.kind === "cancelled") {
      const cancelled = await mutation.cancel();
      return cancelled.ok
        ? ok("cancelled")
        : err(failure(cancelled.error.kind));
    }
    action = Object.freeze({
      key: entered.value.value,
      kind: mutation.state === "absent" ? "register" as const : "replace" as const,
    });
  }

  const settled = await mutation.perform(action);
  if (!settled.ok) return err(failure(settled.error.kind));
  const message = settled.value === "registered"
    ? "Ollama Cloud credential registered.\n"
    : settled.value === "replaced"
      ? "Ollama Cloud credential replaced.\n"
      : settled.value === "removed"
        ? "Ollama Cloud credential removed locally.\n"
        : "Authentication cancelled.\n";
  const written = await write(output, message);
  return written.ok ? ok(settled.value) : written;
}
