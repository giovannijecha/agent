import type { Result } from "@agent/core";
import type { CancellationSignal } from "@agent/runtime";

export type OpenAITransportErrorKind =
  | "cancelled"
  | "closed"
  | "concurrentRead"
  | "connection"
  | "limit"
  | "protocol"
  | "timeout";

export type OpenAITransportError = Readonly<{ kind: OpenAITransportErrorKind }>;
export type OpenAITransportRequest = Readonly<{ body: string }>;

export type OpenAICatalogCapture = Readonly<{
  body: Uint8Array;
  contentType: string | undefined;
  statusCode: number;
}>;

export interface OpenAITransportStream {
  readonly contentType: string | undefined;
  readonly statusCode: number;
  read(): Promise<Result<Uint8Array | null, OpenAITransportError>>;
  close(): Promise<Result<void, OpenAITransportError>>;
}

/** Exact byte capabilities supplied only by the CLI platform boundary. */
export interface OpenAIProviderTransport {
  catalog(
    cancellation: CancellationSignal,
  ): Promise<Result<OpenAICatalogCapture, OpenAITransportError>>;
  open(
    request: OpenAITransportRequest,
    cancellation: CancellationSignal,
  ): Promise<Result<OpenAITransportStream, OpenAITransportError>>;
}
