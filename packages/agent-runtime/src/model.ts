import type { Conversation, Result, StructuredObject } from "@agent/core";
import type { ToolDescriptor } from "@agent/tools";

import type { CancellationSignal } from "./cancellation.js";

export type ModelToolCall = Readonly<{
  callId: string;
  name: string;
  input: StructuredObject;
}>;

/** One ordered item produced by a model stream. */
export type ModelStreamEvent =
  | Readonly<{ kind: "delta"; text: string }>
  | Readonly<{
      kind: "toolCalls";
      calls: readonly ModelToolCall[];
    }>
  | Readonly<{ kind: "done" }>;

/** Pull-based model response with explicit completion and cleanup. */
export interface ModelStream<E> {
  /**
   * Resolves the next delta, completion marker, or content-free adapter failure.
   * Exactly one read may be pending. Cancellation must make it settle promptly,
   * including when close is called concurrently.
   */
  read(): Promise<Result<ModelStreamEvent, E>>;
  /**
   * Releases resources idempotently, including during a pending read.
   * It must not retain the candidate conversation or partial response.
   */
  close(): Promise<Result<void, E>>;
}

/** Adapter-neutral port implemented by a future eligible model integration. */
export interface StreamingModel<E> {
  /**
   * Opens one response stream for an immutable candidate conversation.
   * It must observe cancellation promptly, never retain or log conversation
   * content, and return only immutable content-free failures. Every adapter
   * requires cancellation, concurrency, cleanup, and privacy conformance tests.
   */
  open(
    conversation: Conversation,
    cancellation: CancellationSignal,
    tools: readonly ToolDescriptor[],
  ): Promise<Result<ModelStream<E>, E>>;
}
