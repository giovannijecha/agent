export type OpenCodeGoFailureOperation = "close" | "open" | "read";
export type OpenCodeGoFailureReason =
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
export type OpenCodeGoError = Readonly<{
  cleanupFailed: boolean;
  kind: "openCodeGo";
  operation: OpenCodeGoFailureOperation;
  reason: OpenCodeGoFailureReason;
}>;

export type OpenCodeGoCreateErrorKind =
  | "invalidInstructions"
  | "invalidModel"
  | "invalidTransport";

/** Content-free construction failure for a provider adapter. */
export type OpenCodeGoCreateError = Readonly<{
  kind: OpenCodeGoCreateErrorKind;
}>;
