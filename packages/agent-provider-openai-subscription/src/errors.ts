export type OpenAIFailureOperation = "catalog" | "close" | "open" | "read";
export type OpenAIFailureReason =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "contentType"
  | "encoding"
  | "limit"
  | "protocol"
  | "protocolCatalog"
  | "protocolFraming"
  | "protocolMessage"
  | "protocolTerminal"
  | "protocolToolCall"
  | "request"
  | "statusConnectivity"
  | "statusLimit"
  | "statusProtocol"
  | "statusRejected"
  | "statusRequest"
  | "statusTimeout"
  | "transportCancelled"
  | "transportClosed"
  | "transportConcurrentRead"
  | "transportConnection"
  | "transportLimit"
  | "transportProtocol"
  | "transportTimeout";

/** Stable content-free OpenAI provider failure. */
export type OpenAIError = Readonly<{
  cleanupFailed: boolean;
  kind: "openaiSubscription";
  operation: OpenAIFailureOperation;
  reason: OpenAIFailureReason;
}>;

export type OpenAICreateErrorKind =
  | "invalidInstructions"
  | "invalidModel"
  | "invalidTransport";

/** Content-free construction failure for the inactive provider adapter. */
export type OpenAICreateError = Readonly<{ kind: OpenAICreateErrorKind }>;
