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
  readonly #boundaries: Readonly<{ end: number; start: number }>[] = [];
  #boundaryIndex = 0;
  #buffer = "";
  #bufferOffset = 0;
  #events = 0;
  #finished = false;
  #scanTail = "";
  #terminal = false;

  push(text: string): Result<void, SseError> {
    if (this.#finished || this.#terminal || typeof text !== "string") {
      return err(failure("protocol"));
    }
    if (this.#buffer.length + text.length > OPENAI_PROVIDER_LIMITS.eventBufferCodeUnits) {
      return err(failure("limit"));
    }
    const previousLength = this.#bufferOffset + this.#buffer.length;
    const scan = this.#scanTail + text;
    const discovered = this.#discoverBoundaries(
      scan,
      previousLength - this.#scanTail.length,
      previousLength,
    );
    if (this.#events + this.#boundaries.length - this.#boundaryIndex +
      discovered.length >
      OPENAI_PROVIDER_LIMITS.wireEvents) {
      return err(failure("limit"));
    }
    this.#buffer += text;
    this.#boundaries.push(...discovered);
    this.#scanTail = scan.slice(Math.max(0, scan.length - 3));
    return ok(undefined);
  }

  finish(): void {
    this.#finished = true;
  }

  release(): void {
    this.#boundaries.length = 0;
    this.#boundaryIndex = 0;
    this.#buffer = "";
    this.#bufferOffset = 0;
    this.#events = 0;
    this.#finished = false;
    this.#scanTail = "";
    this.#terminal = false;
  }

  next(): Result<SseRead, SseError> {
    if (this.#terminal) return ok(Object.freeze({ kind: "end" as const }));
    const boundary = this.#boundaries.at(this.#boundaryIndex);
    if (boundary === undefined) {
      if (!this.#finished) return ok(Object.freeze({ kind: "needMore" as const }));
      if (this.#buffer.length !== 0) return err(failure("protocol"));
      this.#terminal = true;
      return ok(Object.freeze({ kind: "end" as const }));
    }
    this.#boundaryIndex += 1;
    const start = boundary.start - this.#bufferOffset;
    const end = boundary.end - this.#bufferOffset;
    const block = this.#buffer.slice(0, start);
    this.#buffer = this.#buffer.slice(end);
    this.#bufferOffset = boundary.end;
    this.#scanTail = this.#buffer.slice(Math.max(0, this.#buffer.length - 3));
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

  #discoverBoundaries(
    scan: string,
    base: number,
    previousLength: number,
  ): Readonly<{ end: number; start: number }>[] {
    const boundaries: Readonly<{ end: number; start: number }>[] = [];
    let offset = 0;
    while (offset < scan.length) {
      const lf = scan.indexOf("\n\n", offset);
      const crlf = scan.indexOf("\r\n\r\n", offset);
      if (lf < 0 && crlf < 0) break;
      const start = crlf >= 0 && (lf < 0 || crlf < lf) ? crlf : lf;
      const end = start + (start === crlf ? 4 : 2);
      const absoluteEnd = base + end;
      if (absoluteEnd > previousLength) {
        boundaries.push(Object.freeze({
          end: absoluteEnd,
          start: base + start,
        }));
      }
      offset = end;
    }
    return boundaries;
  }
}
