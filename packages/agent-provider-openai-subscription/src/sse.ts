import { err, ok, type Result } from "@agent/core";

import { OPENAI_PROVIDER_LIMITS } from "./limits.js";

export type SseError = Readonly<{ kind: "limit" | "protocol" }>;
export type SseEvent = Readonly<{ data: string; event: string | undefined }>;
export type SseRead =
  | Readonly<{ event: SseEvent; kind: "data" }>
  | Readonly<{ kind: "end" }>
  | Readonly<{ kind: "needMore" }>;

function failure(kind: SseError["kind"]): SseError {
  return Object.freeze({ kind });
}

/** Bounded strict SSE framer for the admitted Responses stream subset. */
export class SseDecoder {
  #buffer = "";
  #events = 0;
  #finished = false;
  #terminal = false;

  push(text: string): Result<void, SseError> {
    if (this.#finished || this.#terminal || typeof text !== "string") {
      return err(failure("protocol"));
    }
    if (this.#buffer.length + text.length > OPENAI_PROVIDER_LIMITS.eventBufferCodeUnits) {
      return err(failure("limit"));
    }
    this.#buffer += text;
    return ok(undefined);
  }

  finish(): void {
    this.#finished = true;
  }

  next(): Result<SseRead, SseError> {
    if (this.#terminal) return ok(Object.freeze({ kind: "end" as const }));
    const boundary = this.#boundary();
    if (boundary === undefined) {
      if (!this.#finished) return ok(Object.freeze({ kind: "needMore" as const }));
      if (this.#buffer.length !== 0) return err(failure("protocol"));
      this.#terminal = true;
      return ok(Object.freeze({ kind: "end" as const }));
    }
    const block = this.#buffer.slice(0, boundary.start);
    this.#buffer = this.#buffer.slice(boundary.end);
    if (block.length < 1 || block.length > OPENAI_PROVIDER_LIMITS.eventBufferCodeUnits) {
      return err(failure(block.length < 1 ? "protocol" : "limit"));
    }
    const normalized = block.replaceAll("\r\n", "\n");
    if (normalized.includes("\r")) return err(failure("protocol"));
    const lines = normalized.split("\n");
    let event: string | undefined;
    const data: string[] = [];
    for (const line of lines) {
      if (line.startsWith(":")) return err(failure("protocol"));
      if (line.startsWith("event:")) {
        if (event !== undefined || data.length > 0) return err(failure("protocol"));
        const raw = line.slice(6);
        const value = raw.startsWith(" ") ? raw.slice(1) : raw;
        if (value.length < 1 || /\p{Cc}/u.test(value)) return err(failure("protocol"));
        event = value;
        continue;
      }
      if (line.startsWith("data:")) {
        const raw = line.slice(5);
        data.push(raw.startsWith(" ") ? raw.slice(1) : raw);
        continue;
      }
      return err(failure("protocol"));
    }
    if (data.length === 0) return err(failure("protocol"));
    const joined = data.join("\n");
    if (joined.length < 1 || joined.length > OPENAI_PROVIDER_LIMITS.eventBufferCodeUnits) {
      return err(failure(joined.length < 1 ? "protocol" : "limit"));
    }
    this.#events += 1;
    if (this.#events > OPENAI_PROVIDER_LIMITS.wireEvents) return err(failure("limit"));
    return ok(Object.freeze({
      event: Object.freeze({ data: joined, event }),
      kind: "data" as const,
    }));
  }

  #boundary(): Readonly<{ end: number; start: number }> | undefined {
    const lf = this.#buffer.indexOf("\n\n");
    const crlf = this.#buffer.indexOf("\r\n\r\n");
    if (lf < 0 && crlf < 0) return undefined;
    if (crlf >= 0 && (lf < 0 || crlf < lf)) {
      return Object.freeze({ end: crlf + 4, start: crlf });
    }
    return Object.freeze({ end: lf + 2, start: lf });
  }
}
