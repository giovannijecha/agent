import { RUNTIME_LIMITS } from "@agent/runtime";
import { TOOL_ENGINE_LIMITS, type ToolRisk } from "@agent/tools";
import { err, ok, type Result } from "@agent/tui";

const UNSAFE_PREVIEW = /[\p{C}\p{Zl}\p{Zp}]/u;
const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

export const TOOL_ACTIVITY_LIMITS = Object.freeze({
  entries: RUNTIME_LIMITS.toolSteps,
});

export type ToolActivityState =
  | "approval"
  | "cancelled"
  | "cancelling"
  | "denied"
  | "failed"
  | "queued"
  | "running"
  | "succeeded";

export type ToolActivitySnapshot = Readonly<{
  name: string;
  preview: string;
  risk: ToolRisk;
  state: ToolActivityState;
}>;

export type ToolActivityErrorKind =
  | "activeTurn"
  | "duplicateCall"
  | "entryLimit"
  | "invalidActivity"
  | "invalidTransition"
  | "invalidTurn"
  | "staleCall"
  | "staleTurn";

/** Content-free invariant failure from the CLI-owned activity log. */
export class ToolActivityError {
  readonly #kind: ToolActivityErrorKind;

  constructor(kind: ToolActivityErrorKind) {
    this.#kind = kind;
    Object.freeze(this);
  }

  get kind(): ToolActivityErrorKind {
    return this.#kind;
  }
}

type OwnedActivity = {
  readonly callId: string;
  denied: boolean;
  readonly name: string;
  readonly preview: string;
  readonly risk: ToolRisk;
  open: boolean;
  state: ToolActivityState;
};

function validTurnId(turnId: number): boolean {
  return Number.isSafeInteger(turnId) && turnId >= 1;
}

function validCallId(callId: string): boolean {
  return (
    typeof callId === "string" &&
    callId.length >= 1 &&
    callId.length <= 128
  );
}

function validRisk(risk: ToolRisk): boolean {
  return risk === "read" || risk === "write" || risk === "execute";
}

function validPreview(preview: string): boolean {
  return (
    typeof preview === "string" &&
    preview.length <= TOOL_ENGINE_LIMITS.approvalPreviewCodeUnits &&
    !UNSAFE_PREVIEW.test(preview)
  );
}

/** Bounded display-only lifecycle for the current or most recent tool sequence. */
export class ToolActivityLog {
  readonly #entries: OwnedActivity[] = [];
  #turnId: number | undefined;

  /** Starts a fresh display sequence after the preceding turn has settled. */
  beginTurn(turnId: number): Result<void, ToolActivityError> {
    if (!validTurnId(turnId)) {
      return err(new ToolActivityError("invalidTurn"));
    }
    if (this.#turnId !== undefined) {
      return err(new ToolActivityError("activeTurn"));
    }
    this.#entries.splice(0);
    this.#turnId = turnId;
    return ok(undefined);
  }

  /** Records one validated runtime request through the canonical state path. */
  request(
    turnId: number,
    callId: string,
    name: string,
    risk: ToolRisk,
    preview: string,
    approvalRequired: boolean,
  ): Result<void, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    if (
      !validCallId(callId) ||
      typeof name !== "string" ||
      !VALID_TOOL_NAME.test(name) ||
      !validRisk(risk) ||
      !validPreview(preview) ||
      typeof approvalRequired !== "boolean" ||
      approvalRequired !== (risk !== "read") ||
      (approvalRequired && preview.length === 0)
    ) {
      return err(new ToolActivityError("invalidActivity"));
    }
    if (this.#entries.length >= TOOL_ACTIVITY_LIMITS.entries) {
      return err(new ToolActivityError("entryLimit"));
    }
    if (this.#entries.some((entry) => entry.callId === callId)) {
      return err(new ToolActivityError("duplicateCall"));
    }
    if (this.#entries.some((entry) => entry.open)) {
      return err(new ToolActivityError("invalidTransition"));
    }
    this.#entries.push({
      callId,
      denied: false,
      name,
      open: true,
      preview,
      risk,
      state: approvalRequired ? "approval" : "queued",
    });
    return ok(undefined);
  }

  /** Records the one-shot operator decision without caching approval. */
  decide(
    turnId: number,
    callId: string,
    approved: boolean,
  ): Result<void, ToolActivityError> {
    const entry = this.#openEntry(turnId, callId);
    if (!entry.ok) {
      return entry;
    }
    if (entry.value.state !== "approval" || typeof approved !== "boolean") {
      return err(new ToolActivityError("invalidTransition"));
    }
    if (approved) {
      entry.value.state = "queued";
    } else {
      entry.value.denied = true;
      entry.value.state = "denied";
    }
    return ok(undefined);
  }

  /** Marks the exact approved request as executing. */
  start(turnId: number, callId: string): Result<void, ToolActivityError> {
    const entry = this.#openEntry(turnId, callId);
    if (!entry.ok) {
      return entry;
    }
    if (entry.value.state !== "queued") {
      return err(new ToolActivityError("invalidTransition"));
    }
    entry.value.state = "running";
    return ok(undefined);
  }

  /** Records the authoritative terminal result and closes the exact activity. */
  finish(
    turnId: number,
    callId: string,
    outcome: "denied" | "failed" | "succeeded",
  ): Result<void, ToolActivityError> {
    const entry = this.#openEntry(turnId, callId);
    if (!entry.ok) {
      return entry;
    }
    if (
      (outcome === "denied" && !entry.value.denied) ||
      (outcome !== "denied" && entry.value.denied) ||
      (entry.value.state !== "running" &&
        entry.value.state !== "cancelling" &&
        entry.value.state !== "denied")
    ) {
      return err(new ToolActivityError("invalidTransition"));
    }
    entry.value.state = outcome;
    entry.value.open = false;
    return ok(undefined);
  }

  /** Makes cancellation visible before the external runtime command settles. */
  requestCancel(turnId: number): Result<boolean, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    const entry = this.#entries.find((candidate) => candidate.open);
    if (entry === undefined) {
      return ok(false);
    }
    entry.state = "cancelling";
    return ok(true);
  }

  /** Closes the active request after the authoritative cancelled outcome. */
  cancelActive(turnId: number): Result<boolean, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    const entry = this.#entries.find((candidate) => candidate.open);
    if (entry === undefined) {
      return ok(false);
    }
    if (entry.state !== "cancelling") {
      return err(new ToolActivityError("invalidTransition"));
    }
    entry.state = "cancelled";
    entry.open = false;
    return ok(true);
  }

  /** Settles one turn while retaining its immutable display sequence. */
  finishTurn(turnId: number): Result<void, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    if (this.#entries.some((entry) => entry.open)) {
      return err(new ToolActivityError("invalidTransition"));
    }
    this.#turnId = undefined;
    return ok(undefined);
  }

  /** Returns fresh immutable view data with private call identities omitted. */
  snapshots(): readonly ToolActivitySnapshot[] {
    return Object.freeze(
      this.#entries.map((entry) =>
        Object.freeze({
          name: entry.name,
          preview: entry.preview,
          risk: entry.risk,
          state: entry.state,
        }),
      ),
    );
  }

  /** Releases every retained activity and private identity. */
  clear(): void {
    this.#entries.splice(0);
    this.#turnId = undefined;
  }

  #openEntry(
    turnId: number,
    callId: string,
  ): Result<OwnedActivity, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    const entry = this.#entries.find(
      (candidate) => candidate.open && candidate.callId === callId,
    );
    return entry === undefined
      ? err(new ToolActivityError("staleCall"))
      : ok(entry);
  }
}
