import type { Result } from "@agent/core";
import type { CancellationSignal } from "@agent/runtime";

export type OllamaCloudTransportErrorKind =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "connection"
  | "limit"
  | "protocol"
  | "timeout";

/** Content-free failure from the injected provider-specific byte transport. */
export type OllamaCloudTransportError = Readonly<{
  kind: OllamaCloudTransportErrorKind;
}>;

export type OllamaCloudTransportRequest = Readonly<{
  body: string;
}>;

/** Pull-based HTTPS response owned by the CLI platform adapter. */
export interface OllamaCloudTransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  read(): Promise<Result<Uint8Array | null, OllamaCloudTransportError>>;
  close(): Promise<Result<void, OllamaCloudTransportError>>;
}

/** Exact transport capability required by the Node-free provider adapter. */
export interface OllamaCloudTransport {
  open(
    request: OllamaCloudTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OllamaCloudTransportStream, OllamaCloudTransportError>>;
}
