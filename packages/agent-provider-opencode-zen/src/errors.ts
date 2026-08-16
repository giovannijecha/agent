export type OpenCodeZenFailureOperation = "close" | "open" | "read";
export type OpenCodeZenFailureReason =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "contentType"
  | "encoding"
  | "finishReason"
  | "limit"
  | "protocol"
  | "request"
  | "status"
  | "transportCancelled"
  | "transportClosed"
  | "transportConcurrentRead"
  | "transportConnection"
  | "transportLimit"
  | "transportProtocol"
  | "transportTimeout";

/** Stable content-free model failure exposed to the runtime. */
export type OpenCodeZenError = Readonly<{
  cleanupFailed: boolean;
  kind: "openCodeZen";
  operation: OpenCodeZenFailureOperation;
  reason: OpenCodeZenFailureReason;
}>;

export type OpenCodeZenCreateErrorKind =
  | "invalidInstructions"
  | "invalidTransport";

/** Content-free construction failure for a provider adapter. */
export type OpenCodeZenCreateError = Readonly<{
  kind: OpenCodeZenCreateErrorKind;
}>;
