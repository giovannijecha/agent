export type OllamaCloudFailureOperation = "close" | "open" | "read";
export type OllamaCloudFailureReason =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "contentType"
  | "encoding"
  | "finishReason"
  | "limit"
  | "protocol"
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

/** Stable content-free model failure exposed to the runtime. */
export type OllamaCloudError = Readonly<{
  cleanupFailed: boolean;
  kind: "ollamaCloud";
  operation: OllamaCloudFailureOperation;
  reason: OllamaCloudFailureReason;
}>;

export type OllamaCloudCreateErrorKind =
  | "invalidInstructions"
  | "invalidModel"
  | "invalidTransport";

/** Content-free construction failure for the provider adapter. */
export type OllamaCloudCreateError = Readonly<{
  kind: OllamaCloudCreateErrorKind;
}>;
