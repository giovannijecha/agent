import type { Result } from "@agent/core";
import type { CancellationSignal } from "@agent/runtime";

export type OpenCodeGoTransportErrorKind =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "connection"
  | "limit"
  | "protocol"
  | "timeout";

/** Content-free failure from the injected provider-specific byte transport. */
export type OpenCodeGoTransportError = Readonly<{
  kind: OpenCodeGoTransportErrorKind;
}>;

export type OpenCodeGoTransportRequest = Readonly<{
  body: string;
}>;

/** Pull-based HTTPS response owned by the CLI platform adapter. */
export interface OpenCodeGoTransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  read(): Promise<Result<Uint8Array | null, OpenCodeGoTransportError>>;
  close(): Promise<Result<void, OpenCodeGoTransportError>>;
}

/** Exact transport capability required by the Node-free provider adapter. */
export interface OpenCodeGoTransport {
  open(
    request: OpenCodeGoTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenCodeGoTransportStream, OpenCodeGoTransportError>>;
}
