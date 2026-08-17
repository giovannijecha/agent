export type OllamaCloudModelId = string;

/** Recognizes bounded Ollama registry identifiers returned by the cloud catalog. */
export function isOllamaCloudModelId(
  value: unknown,
): value is OllamaCloudModelId {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    /^(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*(?::[a-z0-9][a-z0-9._-]*)?$/u.test(
      value,
    )
  );
}
