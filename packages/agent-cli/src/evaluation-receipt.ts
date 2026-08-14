import { createHash } from "node:crypto";

import { err, ok, type Result } from "@agent/core";

export const EVALUATION_RECEIPT_LIMITS = Object.freeze({
  count: 10_000,
  elapsedMilliseconds: 86_400_000,
  readIdentities: 10_000,
  readTargetCodeUnits: 4_096,
  searchQueryCodeUnits: 256,
});

export type EvaluationReadName =
  | "list_directory"
  | "read_file"
  | "search_text";

export type EvaluationReceiptErrorKind =
  | "closed"
  | "invalidClock"
  | "invalidObservation"
  | "limit"
  | "notStarted";

export type EvaluationReceiptError = Readonly<{
  kind: EvaluationReceiptErrorKind;
}>;

export type EvaluationReceipt = Readonly<{
  approvals: number;
  elapsedMilliseconds: number;
  repeatedReads: number;
  schemaVersion: 1;
  toolCalls: number;
  turns: number;
}>;

export type EvaluationReceiptSettlementFailure = "complete" | "write";

export type EvaluationExitDiagnostic =
  | "product"
  | "receiptComplete"
  | "receiptWrite";

function failure(kind: EvaluationReceiptErrorKind): EvaluationReceiptError {
  return Object.freeze({ kind });
}

function validClock(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validRead(
  name: EvaluationReadName,
  target: string,
  query: string | undefined,
): boolean {
  if (
    (name !== "list_directory" &&
      name !== "read_file" &&
      name !== "search_text") ||
    typeof target !== "string" ||
    target.length === 0 ||
    target.length > EVALUATION_RECEIPT_LIMITS.readTargetCodeUnits
  ) {
    return false;
  }
  return name === "search_text"
    ? typeof query === "string" &&
        query.length > 0 &&
        query.length <= EVALUATION_RECEIPT_LIMITS.searchQueryCodeUnits
    : query === undefined;
}

function readDigest(
  name: EvaluationReadName,
  target: string,
  query: string | undefined,
): string {
  const hash = createHash("sha256");
  for (const value of query === undefined
    ? [name, target]
    : [name, target, query]) {
    hash.update(String(value.length), "utf8");
    hash.update(":", "utf8");
    hash.update(value, "utf8");
  }
  return hash.digest("hex");
}

/** Memory-only observer for one explicitly opted-in evaluation session. */
export class EvaluationReceiptRecorder {
  #approvals = 0;
  #closed = false;
  #failure: EvaluationReceiptErrorKind | undefined;
  readonly #readDigests = new Set<string>();
  #repeatedReads = 0;
  #startMilliseconds: number | undefined;
  #toolCalls = 0;
  #turns = 0;

  start(monotonicMilliseconds: number): Result<void, EvaluationReceiptError> {
    if (this.#closed) {
      return err(failure("closed"));
    }
    if (
      this.#startMilliseconds !== undefined ||
      !validClock(monotonicMilliseconds)
    ) {
      return err(failure("invalidClock"));
    }
    this.#startMilliseconds = monotonicMilliseconds;
    return ok(undefined);
  }

  acceptedTurn(): void {
    this.#turns = this.#increment(this.#turns);
  }

  requestedTool(): void {
    this.#toolCalls = this.#increment(this.#toolCalls);
  }

  approvedTool(): void {
    this.#approvals = this.#increment(this.#approvals);
  }

  observeRead(
    name: EvaluationReadName,
    target: string,
    query?: string,
  ): void {
    if (
      this.#closed ||
      this.#startMilliseconds === undefined ||
      !validRead(name, target, query)
    ) {
      this.#failure ??= this.#closed
        ? "closed"
        : this.#startMilliseconds === undefined
          ? "notStarted"
          : "invalidObservation";
      return;
    }
    try {
      const digest = readDigest(name, target, query);
      if (this.#readDigests.has(digest)) {
        this.#repeatedReads = this.#increment(this.#repeatedReads);
        return;
      }
      if (
        this.#readDigests.size >= EVALUATION_RECEIPT_LIMITS.readIdentities
      ) {
        this.#failure ??= "limit";
        return;
      }
      this.#readDigests.add(digest);
    } catch (_cause: unknown) {
      this.#failure ??= "invalidObservation";
    }
  }

  finish(
    monotonicMilliseconds: number,
  ): Result<EvaluationReceipt, EvaluationReceiptError> {
    if (this.#closed) {
      return err(failure("closed"));
    }
    this.#closed = true;
    const started = this.#startMilliseconds;
    this.#startMilliseconds = undefined;
    this.#readDigests.clear();
    if (this.#failure !== undefined) {
      return err(failure(this.#failure));
    }
    if (started === undefined) {
      return err(failure("notStarted"));
    }
    if (!validClock(monotonicMilliseconds) || monotonicMilliseconds < started) {
      return err(failure("invalidClock"));
    }
    const elapsedMilliseconds = monotonicMilliseconds - started;
    if (
      elapsedMilliseconds > EVALUATION_RECEIPT_LIMITS.elapsedMilliseconds
    ) {
      return err(failure("limit"));
    }
    return ok(
      Object.freeze({
        approvals: this.#approvals,
        elapsedMilliseconds,
        repeatedReads: this.#repeatedReads,
        schemaVersion: 1 as const,
        toolCalls: this.#toolCalls,
        turns: this.#turns,
      }),
    );
  }

  #increment(value: number): number {
    if (this.#closed) {
      this.#failure ??= "closed";
      return value;
    }
    if (this.#startMilliseconds === undefined) {
      this.#failure ??= "notStarted";
      return value;
    }
    if (value >= EVALUATION_RECEIPT_LIMITS.count) {
      this.#failure ??= "limit";
      return value;
    }
    return value + 1;
  }
}

/** Formats the one closed ASCII receipt line emitted after terminal cleanup. */
export function formatEvaluationReceipt(receipt: EvaluationReceipt): string {
  return JSON.stringify(receipt) + "\n";
}

/** Orders product and optional receipt failures without changing product priority. */
export function planEvaluationExit(
  productFailed: boolean,
  receiptFailure: EvaluationReceiptSettlementFailure | undefined,
): readonly EvaluationExitDiagnostic[] {
  const diagnostics: EvaluationExitDiagnostic[] = [];
  if (productFailed) {
    diagnostics.push("product");
  }
  if (receiptFailure === "complete") {
    diagnostics.push("receiptComplete");
  } else if (receiptFailure === "write") {
    diagnostics.push("receiptWrite");
  }
  return Object.freeze(diagnostics);
}
