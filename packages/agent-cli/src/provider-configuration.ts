import { err, ok, type Result } from "@agent/core";

export const OLLAMA_API_KEY_VARIABLE = "AGENT_OLLAMA_API_KEY";

export type OllamaCloudConfiguration =
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ credential: string; kind: "enabled" }>;
export type OllamaCloudConfigurationError = Readonly<{
  kind: "invalidCredential";
}>;

function isValidProviderCredential(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 8_192 &&
    !/\s|\p{Cc}/u.test(value)
  );
}

export function isValidOllamaCloudCredential(value: unknown): value is string {
  return isValidProviderCredential(value);
}

/** Validates the optional memory-only Ollama credential without normalizing it. */
export function resolveOllamaCloudConfiguration(
  value: string | undefined,
): Result<OllamaCloudConfiguration, OllamaCloudConfigurationError> {
  if (value === undefined) {
    return ok(Object.freeze({ kind: "disabled" as const }));
  }
  if (!isValidOllamaCloudCredential(value)) {
    return err(Object.freeze({ kind: "invalidCredential" as const }));
  }
  return ok(Object.freeze({ credential: value, kind: "enabled" as const }));
}
