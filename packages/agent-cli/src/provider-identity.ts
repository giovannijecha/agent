import { isOllamaCloudModelId } from "@agent/provider-ollama-cloud";

export type ProviderId = "ollamaCloud";

export const PROVIDER_IDS: readonly ProviderId[] = Object.freeze([
  "ollamaCloud",
]);

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === "string" &&
    PROVIDER_IDS.some((provider) => provider === value)
  );
}

/** Validates one provider-owned model identifier without duplicating its grammar. */
export function isProviderModelId(value: unknown): value is string {
  return isOllamaCloudModelId(value);
}
