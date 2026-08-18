import { RUNTIME_LIMITS } from "@agent/runtime";
import {
  isSafeApprovalPreview,
  TOOL_ENGINE_LIMITS,
  type ToolRisk,
} from "@agent/tools";
import { err, ok, type Result } from "@agent/tui";

const VALID_TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/u;

export const TOOL_ACTIVITY_LIMITS = Object.freeze({
  entries: RUNTIME_LIMITS.toolSteps,
});

export type ToolActivityState =
  | "permission"
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
    isSafeApprovalPreview(preview)
  );
}

/** Bounded display-only lifecycle for the current tool-call batch. */
export class ToolActivityLog {
  #acceptedEntries = 0;
  #entries: OwnedActivity[] = [];
  #turnId: number | undefined;

  /** Starts a fresh display sequence after the preceding turn has settled. */
  beginTurn(turnId: number): Result<void, ToolActivityError> {
    if (!validTurnId(turnId)) {
      return err(new ToolActivityError("invalidTurn"));
    }
    if (this.#turnId !== undefined) {
      return err(new ToolActivityError("activeTurn"));
    }
    this.#acceptedEntries = 0;
    this.#entries = [];
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
    effectApprovalRequired: boolean,
    decisionRequired: boolean,
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
      typeof effectApprovalRequired !== "boolean" ||
      effectApprovalRequired !== (risk !== "read" && preview.length > 0) ||
      typeof decisionRequired !== "boolean" ||
      (risk === "read" && preview.length !== 0)
    ) {
      return err(new ToolActivityError("invalidActivity"));
    }
    if (this.#acceptedEntries >= TOOL_ACTIVITY_LIMITS.entries) {
      return err(new ToolActivityError("entryLimit"));
    }
    const openEntries = this.#entries.filter((entry) => entry.open);
    if (openEntries.some((entry) => entry.callId === callId)) {
      return err(new ToolActivityError("staleCall"));
    }
    if (
      openEntries.length > 0 &&
      (openEntries.length >= RUNTIME_LIMITS.parallelReads ||
        risk !== "read" ||
        openEntries.some(
          (entry) =>
            entry.risk !== "read" ||
            (entry.state !== "queued" && entry.state !== "denied"),
        ))
    ) {
      return err(new ToolActivityError("invalidTransition"));
    }
    this.#acceptedEntries += 1;
    const entry: OwnedActivity = {
      callId,
      denied: false,
      name,
      open: true,
      preview,
      risk,
      state: decisionRequired ? "permission" : "queued",
    };
    this.#entries = openEntries.length === 0 ? [entry] : [...this.#entries, entry];
    return ok(undefined);
  }

  /** Records the one-shot permission decision without retaining session policy. */
  decide(
    turnId: number,
    callId: string,
    allowed: boolean,
  ): Result<void, ToolActivityError> {
    const entry = this.#openEntry(turnId, callId);
    if (!entry.ok) {
      return entry;
    }
    if (entry.value.state !== "permission" || typeof allowed !== "boolean") {
      return err(new ToolActivityError("invalidTransition"));
    }
    if (allowed) {
      entry.value.state = "queued";
    } else {
      entry.value.denied = true;
      entry.value.state = "denied";
    }
    return ok(undefined);
  }

  /** Marks the exact permitted request as executing. */
  start(turnId: number, callId: string): Result<void, ToolActivityError> {
    const entry = this.#openEntry(turnId, callId);
    if (!entry.ok) {
      return entry;
    }
    const entryIndex = this.#entries.findIndex(
      (candidate) => candidate === entry.value,
    );
    const earlier = this.#entries.slice(0, entryIndex);
    if (
      entry.value.state !== "queued" ||
      this.#entries.some(
        (candidate) => candidate.open && candidate.state === "permission",
      ) ||
      earlier.some(
        (candidate) => candidate.open && candidate.state === "queued",
      )
    ) {
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
    const firstOpen = this.#entries.find((candidate) => candidate.open);
    if (
      firstOpen !== entry.value ||
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
    const openEntries = this.#entries.filter((entry) => entry.open);
    if (openEntries.length === 0) {
      return ok(false);
    }
    for (const entry of openEntries) {
      entry.state = "cancelling";
    }
    return ok(true);
  }

  /** Closes the active request after the authoritative cancelled outcome. */
  cancelActive(turnId: number): Result<boolean, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    const openEntries = this.#entries.filter((entry) => entry.open);
    if (openEntries.length === 0) {
      return ok(false);
    }
    if (openEntries.some((entry) => entry.state !== "cancelling")) {
      return err(new ToolActivityError("invalidTransition"));
    }
    for (const entry of openEntries) {
      entry.state = "cancelled";
      entry.open = false;
    }
    return ok(true);
  }

  /** Settles one turn and releases its contextual display state. */
  finishTurn(turnId: number): Result<void, ToolActivityError> {
    if (turnId !== this.#turnId) {
      return err(new ToolActivityError("staleTurn"));
    }
    if (this.#entries.some((entry) => entry.open)) {
      return err(new ToolActivityError("invalidTransition"));
    }
    this.#acceptedEntries = 0;
    this.#entries = [];
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
    this.#acceptedEntries = 0;
    this.#entries = [];
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
