import type { Result } from "@agent/core";
import type { CancellationSignal } from "@agent/runtime";

export type OpenCodeZenTransportErrorKind =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "connection"
  | "limit"
  | "protocol"
  | "timeout";

/** Content-free failure from the injected provider-specific byte transport. */
export type OpenCodeZenTransportError = Readonly<{
  kind: OpenCodeZenTransportErrorKind;
}>;

export type OpenCodeZenTransportRequest = Readonly<{
  body: string;
}>;

/** Pull-based HTTPS response owned by the CLI platform adapter. */
export interface OpenCodeZenTransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  read(): Promise<Result<Uint8Array | null, OpenCodeZenTransportError>>;
  close(): Promise<Result<void, OpenCodeZenTransportError>>;
}

/** Exact transport capability required by the Node-free provider adapter. */
export interface OpenCodeZenTransport {
  open(
    request: OpenCodeZenTransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenCodeZenTransportStream, OpenCodeZenTransportError>>;
}
