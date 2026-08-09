import { err, ok, type Result } from "@agent/core";

import { OPENCODE_GO_LIMITS } from "./limits.js";

export type SseError = Readonly<{ kind: "limit" | "protocol" }>;
export type SseRead =
  | Readonly<{ kind: "data"; data: string }>
  | Readonly<{ kind: "end" }>
  | Readonly<{ kind: "needMore" }>;

function failure(kind: SseError["kind"]): SseError {
  return Object.freeze({ kind });
}

type Line = Readonly<{ consumed: number; text: string }>;

function nextLine(buffer: string, final: boolean): Line | undefined {
  const carriage = buffer.indexOf("\r");
  const newline = buffer.indexOf("\n");
  let boundary = -1;
  if (carriage >= 0 && newline >= 0) {
    boundary = Math.min(carriage, newline);
  } else {
    boundary = Math.max(carriage, newline);
  }
  if (boundary < 0) {
    return final && buffer.length > 0
      ? Object.freeze({ consumed: buffer.length, text: buffer })
      : undefined;
  }
  if (buffer.at(boundary) === "\r" && boundary + 1 === buffer.length && !final) {
    return undefined;
  }
  const width =
    buffer.at(boundary) === "\r" && buffer.at(boundary + 1) === "\n"
      ? 2
      : 1;
  return Object.freeze({
    consumed: boundary + width,
    text: buffer.slice(0, boundary),
  });
}

/** Bounded incremental server-sent event data framer. */
export class SseDecoder {
  #buffer = "";
  #dataCodeUnits = 0;
  #dataLines: string[] = [];
  #eventLines = 0;
  #finished = false;
  #firstText = true;
  #terminal = false;
  #totalLines = 0;

  push(text: string): Result<void, SseError> {
    if (this.#finished || this.#terminal || typeof text !== "string") {
      return err(failure("protocol"));
    }
    const normalized =
      this.#firstText && text.startsWith("\uFEFF") ? text.slice(1) : text;
    this.#firstText = false;
    if (
      this.#buffer.length + normalized.length >
      OPENCODE_GO_LIMITS.sseBufferCodeUnits
    ) {
      return err(failure("limit"));
    }
    this.#buffer += normalized;
    return ok(undefined);
  }

  finish(): void {
    this.#finished = true;
  }

  next(): Result<SseRead, SseError> {
    if (this.#terminal) {
      return ok(Object.freeze({ kind: "end" as const }));
    }
    while (true) {
      const line = nextLine(this.#buffer, this.#finished);
      if (line === undefined) {
        if (!this.#finished) {
          return ok(Object.freeze({ kind: "needMore" as const }));
        }
        if (this.#dataLines.length > 0) {
          return this.#dispatch();
        }
        this.#terminal = true;
        return ok(Object.freeze({ kind: "end" as const }));
      }
      this.#buffer = this.#buffer.slice(line.consumed);
      this.#totalLines += 1;
      this.#eventLines += 1;
      if (
        this.#totalLines > OPENCODE_GO_LIMITS.sseTotalLines ||
        this.#eventLines > OPENCODE_GO_LIMITS.sseLinesPerEvent
      ) {
        return err(failure("limit"));
      }
      if (line.text.length === 0) {
        if (this.#dataLines.length > 0) {
          return this.#dispatch();
        }
        this.#eventLines = 0;
        continue;
      }
      if (line.text.startsWith(":")) {
        continue;
      }
      const colon = line.text.indexOf(":");
      const field = colon < 0 ? line.text : line.text.slice(0, colon);
      let value = colon < 0 ? "" : line.text.slice(colon + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
      if (field === "data") {
        this.#dataCodeUnits += value.length;
        if (this.#dataCodeUnits > OPENCODE_GO_LIMITS.sseDataCodeUnits) {
          return err(failure("limit"));
        }
        this.#dataLines.push(value);
      }
    }
  }

  #dispatch(): Result<SseRead, SseError> {
    const data = this.#dataLines.join("\n");
    this.#dataLines = [];
    this.#dataCodeUnits = 0;
    this.#eventLines = 0;
    return ok(Object.freeze({ data, kind: "data" as const }));
  }
}
