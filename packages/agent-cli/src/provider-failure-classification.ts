import type {
  OllamaCloudError,
  OllamaCloudFailureReason,
} from "@agent/provider-ollama-cloud";

export type ProviderFailureFamily =
  | "cancelled"
  | "connectivity"
  | "lifecycle"
  | "limit"
  | "protocol"
  | "rejected"
  | "request"
  | "timeout";

export type ProviderModelFailure = OllamaCloudError;

type ProviderFailureOperation = ProviderModelFailure["operation"];
type ProviderFailureReason = OllamaCloudFailureReason;

function classifyReason(
  reason: ProviderFailureReason,
): ProviderFailureFamily {
  if (reason === "status") return "rejected";
  if (reason === "transportConnection") return "connectivity";
  if (reason === "transportTimeout") return "timeout";
  if (reason === "request") return "request";
  if (reason === "limit" || reason === "transportLimit") return "limit";
  if (reason === "cancelled" || reason === "transportCancelled") {
    return "cancelled";
  }
  if (
    reason === "closed" ||
    reason === "concurrentRead" ||
    reason === "transportClosed" ||
    reason === "transportConcurrentRead"
  ) {
    return "lifecycle";
  }
  return "protocol";
}

function isProviderFailureReason(
  reason: unknown,
): reason is ProviderFailureReason {
  return (
    reason === "cancelled" ||
    reason === "closed" ||
    reason === "concurrentRead" ||
    reason === "contentType" ||
    reason === "encoding" ||
    reason === "finishReason" ||
    reason === "limit" ||
    reason === "protocol" ||
    reason === "request" ||
    reason === "status" ||
    reason === "transportCancelled" ||
    reason === "transportClosed" ||
    reason === "transportConcurrentRead" ||
    reason === "transportConnection" ||
    reason === "transportLimit" ||
    reason === "transportProtocol" ||
    reason === "transportTimeout"
  );
}

/** Maps admitted provider errors into one shared content-free vocabulary. */
export function classifyProviderFailure(
  value: unknown,
  operation: ProviderFailureOperation,
): ProviderFailureFamily | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const candidate = value as Readonly<{
    cleanupFailed?: unknown;
    kind?: unknown;
    operation?: unknown;
    reason?: unknown;
  }>;
  if (
    candidate.kind !== "ollamaCloud" ||
    typeof candidate.cleanupFailed !== "boolean" ||
    candidate.operation !== operation ||
    !isProviderFailureReason(candidate.reason)
  ) {
    return undefined;
  }
  return classifyReason(candidate.reason);
}
