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

export type ProviderProtocolPhase =
  | "envelope"
  | "finish"
  | "framing"
  | "message"
  | "terminal"
  | "tool-call"
  | "transport";

export type ProviderFailureClassification = Readonly<{
  family: ProviderFailureFamily;
  protocolPhase?: ProviderProtocolPhase;
}>;

export type ProviderModelFailure = OllamaCloudError;

type ProviderFailureOperation = ProviderModelFailure["operation"];
type ProviderFailureReason = OllamaCloudFailureReason;

function classifyReason(
  reason: ProviderFailureReason,
  operation: ProviderFailureOperation,
): ProviderFailureClassification {
  if (reason === "statusConnectivity") return classification("connectivity");
  if (reason === "statusLimit") return classification("limit");
  if (reason === "statusProtocol") return classification("protocol");
  if (reason === "statusRejected") return classification("rejected");
  if (reason === "statusRequest") return classification("request");
  if (reason === "statusTimeout") return classification("timeout");
  if (reason === "transportConnection") return classification("connectivity");
  if (reason === "transportTimeout") return classification("timeout");
  if (reason === "request") return classification("request");
  if (reason === "limit" || reason === "transportLimit") {
    return classification("limit");
  }
  if (reason === "cancelled" || reason === "transportCancelled") {
    return classification("cancelled");
  }
  if (
    reason === "closed" ||
    reason === "concurrentRead" ||
    reason === "transportClosed" ||
    reason === "transportConcurrentRead"
  ) {
    return classification("lifecycle");
  }
  if (
    reason === "contentType" ||
    reason === "transportProtocol"
  ) {
    return protocolClassificationFor(operation, "transport");
  }
  if (reason === "encoding" || reason === "protocolFraming") {
    return protocolClassificationFor(operation, "framing");
  }
  if (reason === "protocolEnvelope") {
    return protocolClassificationFor(operation, "envelope");
  }
  if (reason === "protocolMessage") {
    return protocolClassificationFor(operation, "message");
  }
  if (reason === "protocolToolCall") {
    return protocolClassificationFor(operation, "tool-call");
  }
  if (reason === "finishReason") {
    return protocolClassificationFor(operation, "finish");
  }
  if (reason === "protocolTerminal") {
    return protocolClassificationFor(operation, "terminal");
  }
  return classification("protocol");
}

function classification(
  family: ProviderFailureFamily,
): ProviderFailureClassification {
  return Object.freeze({ family });
}

function protocolClassification(
  protocolPhase: ProviderProtocolPhase,
): ProviderFailureClassification {
  return Object.freeze({ family: "protocol" as const, protocolPhase });
}

function protocolClassificationFor(
  operation: ProviderFailureOperation,
  protocolPhase: ProviderProtocolPhase,
): ProviderFailureClassification {
  return operation === "read"
    ? protocolClassification(protocolPhase)
    : classification("protocol");
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
    reason === "protocolEnvelope" ||
    reason === "protocolFraming" ||
    reason === "protocolMessage" ||
    reason === "protocolTerminal" ||
    reason === "protocolToolCall" ||
    reason === "request" ||
    reason === "statusConnectivity" ||
    reason === "statusLimit" ||
    reason === "statusProtocol" ||
    reason === "statusRejected" ||
    reason === "statusRequest" ||
    reason === "statusTimeout" ||
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
): ProviderFailureClassification | undefined {
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
  return classifyReason(candidate.reason, operation);
}
