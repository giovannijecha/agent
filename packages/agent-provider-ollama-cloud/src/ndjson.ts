import { err, ok, type Result } from "@agent/core";

import { OLLAMA_CLOUD_LIMITS } from "./limits.js";

export type NdjsonError = Readonly<{ kind: "limit" | "protocol" }>;
export type NdjsonRead =
  | Readonly<{ kind: "data"; data: string }>
  | Readonly<{ kind: "end" }>
  | Readonly<{ kind: "needMore" }>;

function failure(kind: NdjsonError["kind"]): NdjsonError {
  return Object.freeze({ kind });
}

/** Bounded incremental newline-delimited JSON framer. */
export class NdjsonDecoder {
  #buffer = "";
  #finished = false;
  #firstText = true;
  #lines = 0;
  #terminal = false;

  push(text: string): Result<void, NdjsonError> {
    if (this.#finished || this.#terminal || typeof text !== "string") {
      return err(failure("protocol"));
    }
    const normalized =
      this.#firstText && text.startsWith("\uFEFF") ? text.slice(1) : text;
    this.#firstText = false;
    if (
      this.#buffer.length + normalized.length >
      OLLAMA_CLOUD_LIMITS.ndjsonBufferCodeUnits
    ) {
      return err(failure("limit"));
    }
    this.#buffer += normalized;
    return ok(undefined);
  }

  finish(): void {
    this.#finished = true;
  }

  next(): Result<NdjsonRead, NdjsonError> {
    if (this.#terminal) {
      return ok(Object.freeze({ kind: "end" as const }));
    }
    const newline = this.#buffer.indexOf("\n");
    if (newline < 0 && !this.#finished) {
      return ok(Object.freeze({ kind: "needMore" as const }));
    }
    if (newline < 0 && this.#buffer.length === 0) {
      this.#terminal = true;
      return ok(Object.freeze({ kind: "end" as const }));
    }
    const consumed = newline < 0 ? this.#buffer.length : newline + 1;
    let line = this.#buffer.slice(0, newline < 0 ? undefined : newline);
    this.#buffer = this.#buffer.slice(consumed);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (
      line.length < 1 ||
      line.length > OLLAMA_CLOUD_LIMITS.ndjsonLineCodeUnits ||
      line.includes("\r")
    ) {
      return err(
        failure(
          line.length > OLLAMA_CLOUD_LIMITS.ndjsonLineCodeUnits
            ? "limit"
            : "protocol",
        ),
      );
    }
    this.#lines += 1;
    if (this.#lines > OLLAMA_CLOUD_LIMITS.ndjsonLines) {
      return err(failure("limit"));
    }
    return ok(Object.freeze({ data: line, kind: "data" as const }));
  }
}
