import {
  stdin,
  stdout,
  type ReadableStream,
} from "node:process";

import { err, ok, type Result } from "@agent/core";

import {
  readAuthChoice,
  readConcealedCredential,
  startAuthCancellationMonitor,
  type AuthCancellationMonitor,
  type AuthTerminalError,
} from "./auth-terminal.js";
import {
  openOllamaCredentialMutation,
  openOpenAICredentialMutation,
  type CredentialBoundaryError,
  type OllamaCredentialMutationAction,
  type OllamaCredentialMutationPort,
  type OpenAICredentialMutationPort,
} from "./credential-broker.js";
import {
  NodeOpenAIDeviceAuth,
  type OpenAIDeviceAuthErrorKind,
  type OpenAIDeviceAuthPort,
} from "./node-openai-device-auth.js";
import {
  writeProcessText,
  type ProcessTextOutput,
} from "./process-output.js";

export type AuthCommandError = Readonly<{
  kind:
    | CredentialBoundaryError["kind"]
    | Exclude<OpenAIDeviceAuthErrorKind, "cancelled">
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

export type OpenAIAuthCredentialOpener = (
  platform: string,
  architecture: string,
) => Promise<
  Result<OpenAICredentialMutationPort, CredentialBoundaryError>
>;

export type AuthCancellationStarter = (
  input: ReadableStream,
) => Result<AuthCancellationMonitor, AuthTerminalError>;

export type AuthCommandDependencies = Readonly<{
  openAIDeviceAuth: OpenAIDeviceAuthPort;
  openOllamaMutation: AuthCredentialOpener;
  openOpenAIMutation: OpenAIAuthCredentialOpener;
  startCancellation: AuthCancellationStarter;
}>;

const DEFAULT_DEPENDENCIES: AuthCommandDependencies = Object.freeze({
  openAIDeviceAuth: new NodeOpenAIDeviceAuth(),
  openOllamaMutation: openOllamaCredentialMutation,
  openOpenAIMutation: openOpenAICredentialMutation,
  startCancellation: startAuthCancellationMonitor,
});

type AuthMutationCancellationPort = Readonly<{
  cancel(): Promise<Result<AuthCommandResult, CredentialBoundaryError>>;
}>;

async function write(
  output: ProcessTextOutput,
  text: string,
): Promise<Result<void, AuthCommandError>> {
  const written = await writeProcessText(output, text);
  return written.ok ? ok(undefined) : err(failure("output"));
}

async function failAfterCancellation(
  mutation: AuthMutationCancellationPort,
  original: AuthCommandError,
): Promise<Result<AuthCommandResult, AuthCommandError>> {
  const cancelled = await mutation.cancel();
  return cancelled.ok
    ? err(original)
    : err(failure(cancelled.error.kind));
}

async function runOllamaAuthentication(
  platform: string,
  architecture: string,
  environmentValue: string | undefined,
  input: ReadableStream,
  output: ProcessTextOutput,
  openMutation: AuthCredentialOpener,
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
    return failAfterCancellation(mutation, heading.error);
  }
  const choice = await readAuthChoice(
    mutation.state === "absent" ? ["r", "c"] : ["r", "d", "c"],
    input,
  );
  if (!choice.ok) {
    return failAfterCancellation(mutation, failure("input"));
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
      return failAfterCancellation(mutation, prompt.error);
    }
    const entered = await readConcealedCredential(input);
    const line = await write(output, "\n");
    if (!line.ok) {
      return failAfterCancellation(mutation, line.error);
    }
    if (!entered.ok) {
      return failAfterCancellation(mutation, failure("input"));
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

async function cancelOpenAI(
  mutation: OpenAICredentialMutationPort,
): Promise<Result<"cancelled", AuthCommandError>> {
  const cancelled = await mutation.cancel();
  return cancelled.ok
    ? ok("cancelled")
    : err(failure(cancelled.error.kind));
}

async function runOpenAIAuthentication(
  platform: string,
  architecture: string,
  input: ReadableStream,
  output: ProcessTextOutput,
  dependencies: AuthCommandDependencies,
): Promise<Result<AuthCommandResult, AuthCommandError>> {
  const opened = await dependencies.openOpenAIMutation(platform, architecture);
  if (!opened.ok) return err(failure(opened.error.kind));
  const mutation = opened.value;
  const heading = await write(
    output,
    mutation.state === "absent"
      ? "OpenAI authentication\n[s] Sign in  [c] Cancel\n"
      : "OpenAI authentication\n[s] Sign in again  [d] Remove locally  [c] Cancel\n",
  );
  if (!heading.ok) {
    return failAfterCancellation(mutation, heading.error);
  }
  const choice = await readAuthChoice(
    mutation.state === "absent" ? ["s", "c"] : ["s", "d", "c"],
    input,
  );
  if (!choice.ok) {
    return failAfterCancellation(mutation, failure("input"));
  }
  if (choice.value.kind === "cancelled" || choice.value.value === "c") {
    return cancelOpenAI(mutation);
  }
  if (choice.value.value === "d") {
    const removed = await mutation.perform(Object.freeze({ kind: "remove" as const }));
    if (!removed.ok) return err(failure(removed.error.kind));
    const message = await write(
      output,
      "OpenAI credential removed locally. Provider authorization was not revoked.\n",
    );
    return message.ok ? ok(removed.value) : message;
  }

  const disclosure = await write(
    output,
    "This independent compatibility flow is not endorsed by OpenAI.\n" +
      "Enter the one-time code only at the exact OpenAI address shown below.\n",
  );
  if (!disclosure.ok) {
    return failAfterCancellation(mutation, disclosure.error);
  }
  const monitor = dependencies.startCancellation(input);
  if (!monitor.ok) {
    const cancelled = await cancelOpenAI(mutation);
    return cancelled.ok ? err(failure("input")) : cancelled;
  }

  let authenticated: Awaited<ReturnType<OpenAIDeviceAuthPort["authenticate"]>>;
  try {
    authenticated = await dependencies.openAIDeviceAuth.authenticate(
      monitor.value.cancellation,
      async (challenge) => {
        const shown = await write(
          output,
          "Open " + challenge.verificationUrl + "\n" +
            "One-time code: " + challenge.userCode + "\n" +
            "Press Ctrl+C, Escape, or Ctrl+D to cancel.\n",
        );
        return shown.ok;
      },
    );
  } catch (_cause: unknown) {
    authenticated = err(Object.freeze({ kind: "protocol" as const }));
  }
  const monitorClosed = monitor.value.close();
  if (!monitorClosed.ok || monitor.value.cancellation.cancelled()) {
    const cancelled = await cancelOpenAI(mutation);
    if (!cancelled.ok) return cancelled;
    return monitorClosed.ok ? ok("cancelled") : err(failure("input"));
  }
  if (!authenticated.ok) {
    const cancelled = await cancelOpenAI(mutation);
    if (!cancelled.ok) return cancelled;
    return authenticated.error.kind === "cancelled"
      ? ok("cancelled")
      : err(failure(authenticated.error.kind));
  }

  const settled = await mutation.perform(Object.freeze({
    credential: authenticated.value,
    kind: mutation.state === "absent" ? "register" as const : "replace" as const,
  }));
  if (!settled.ok) return err(failure(settled.error.kind));
  const message = await write(
    output,
    settled.value === "registered"
      ? "OpenAI credential registered. OpenAI remains unavailable until its provider transport is installed.\n"
      : "OpenAI credential replaced. OpenAI remains unavailable until its provider transport is installed.\n",
  );
  return message.ok ? ok(settled.value) : message;
}

/** Owns provider-specific local authentication interactions outside the TUI. */
export async function runAuthCommand(
  platform: string,
  architecture: string,
  environmentValue: string | undefined,
  input: ReadableStream = stdin,
  output: ProcessTextOutput = stdout,
  dependencies: AuthCommandDependencies = DEFAULT_DEPENDENCIES,
): Promise<Result<AuthCommandResult, AuthCommandError>> {
  const heading = await write(
    output,
    "Agent authentication\n[o] Ollama Cloud  [a] OpenAI  [c] Cancel\n",
  );
  if (!heading.ok) return heading;
  const provider = await readAuthChoice(["o", "a", "c"], input);
  if (!provider.ok) return err(failure("input"));
  if (provider.value.kind === "cancelled" || provider.value.value === "c") {
    return ok("cancelled");
  }
  return provider.value.value === "o"
    ? runOllamaAuthentication(
        platform,
        architecture,
        environmentValue,
        input,
        output,
        dependencies.openOllamaMutation,
      )
    : runOpenAIAuthentication(
        platform,
        architecture,
        input,
        output,
        dependencies,
      );
}
