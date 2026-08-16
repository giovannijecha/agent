import type { Result } from "@agent/core";

import type {
  HiddenCredentialPromptError,
  HiddenCredentialPromptOutcome,
} from "./hidden-credential-prompt.js";

export type CredentialPrompt = () => Promise<
  Result<HiddenCredentialPromptOutcome, HiddenCredentialPromptError>
>;

export type StartupTermination = (
  diagnostic: string,
  code: number,
) => Promise<never>;

const PROMPT_FAILURE = "agent could not read the provider credential\n";

/** Resolves one optional startup credential and makes prompt failure terminal. */
export async function acquireProviderCredential(
  configured: string | undefined,
  interactive: boolean,
  prompt: CredentialPrompt,
  terminate: StartupTermination,
): Promise<string | undefined> {
  if (configured !== undefined || !interactive) return configured;

  let prompted: Awaited<ReturnType<CredentialPrompt>>;
  try {
    prompted = await prompt();
  } catch (_cause: unknown) {
    return terminate(PROMPT_FAILURE, 1);
  }

  if (!prompted.ok) return terminate(PROMPT_FAILURE, 1);
  if (prompted.value.kind === "cancelled") return terminate("", 130);
  if (prompted.value.kind === "provided") return prompted.value.credential;
  return undefined;
}
