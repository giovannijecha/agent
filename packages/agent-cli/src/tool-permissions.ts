import { err, ok, type Result } from "@agent/core";
import type { ToolRisk } from "@agent/tools";

export type ToolPermissionMode = "allow" | "ask" | "deny";

export type ToolPermissionDefinition = Readonly<{
  defaultMode: ToolPermissionMode;
  name: string;
  risk: ToolRisk;
}>;

export type ToolPermissionSnapshot = Readonly<{
  mode: ToolPermissionMode;
  name: string;
  risk: ToolRisk;
}>;

export type ToolPermissionErrorKind =
  | "invalidIndex"
  | "invalidMode"
  | "riskMismatch"
  | "unknownTool";

export type ToolPermissionError = Readonly<{
  kind: ToolPermissionErrorKind;
}>;

export type ToolPermissionDirection = "less" | "more";

export type ToolDecisionAction = "allowOnce" | "allowSession" | "deny";

export const TOOL_DECISION_ACTIONS: readonly ToolDecisionAction[] =
  Object.freeze(["allowOnce", "allowSession", "deny"]);

export type PermissionMenuProjection = Readonly<{
  items: readonly ToolPermissionSnapshot[];
  selectedIndex: number;
}>;

export type ToolDecisionProjection = Readonly<{
  actions: readonly ToolDecisionAction[];
  selectedIndex: number;
}>;

export const TOOL_PERMISSION_DEFINITIONS: readonly ToolPermissionDefinition[] =
  Object.freeze([
    Object.freeze({
      defaultMode: "allow" as const,
      name: "read_file",
      risk: "read" as const,
    }),
    Object.freeze({
      defaultMode: "allow" as const,
      name: "list_directory",
      risk: "read" as const,
    }),
    Object.freeze({
      defaultMode: "allow" as const,
      name: "search_text",
      risk: "read" as const,
    }),
    Object.freeze({
      defaultMode: "ask" as const,
      name: "apply_patch",
      risk: "write" as const,
    }),
    Object.freeze({
      defaultMode: "ask" as const,
      name: "manage_path",
      risk: "write" as const,
    }),
    Object.freeze({
      defaultMode: "ask" as const,
      name: "run_process",
      risk: "execute" as const,
    }),
  ]);

type OwnedPermission = {
  readonly defaultMode: ToolPermissionMode;
  mode: ToolPermissionMode;
  readonly name: string;
  readonly risk: ToolRisk;
};

function permissionError(kind: ToolPermissionErrorKind): ToolPermissionError {
  return Object.freeze({ kind });
}

function validMode(mode: unknown): mode is ToolPermissionMode {
  return mode === "allow" || mode === "ask" || mode === "deny";
}

function changedMode(
  mode: ToolPermissionMode,
  direction: ToolPermissionDirection,
): ToolPermissionMode {
  if (direction === "less") {
    return mode === "allow" ? "ask" : mode === "ask" ? "deny" : "deny";
  }
  return mode === "deny" ? "ask" : mode === "ask" ? "allow" : "allow";
}

function snapshot(entry: OwnedPermission): ToolPermissionSnapshot {
  return Object.freeze({
    mode: entry.mode,
    name: entry.name,
    risk: entry.risk,
  });
}

/** Session-only closed permission policy for the exact built-in tool surface. */
export class ToolPermissionPolicy {
  readonly #entries: OwnedPermission[];

  constructor() {
    this.#entries = TOOL_PERMISSION_DEFINITIONS.map((definition) => ({
      defaultMode: definition.defaultMode,
      mode: definition.defaultMode,
      name: definition.name,
      risk: definition.risk,
    }));
  }

  get length(): number {
    return this.#entries.length;
  }

  /** Returns an immutable projection without exposing mutable policy state. */
  snapshots(): readonly ToolPermissionSnapshot[] {
    return Object.freeze(this.#entries.map((entry) => snapshot(entry)));
  }

  /** Resolves one exact tool and verifies that runtime risk did not drift. */
  modeFor(
    name: string,
    risk: ToolRisk,
  ): Result<ToolPermissionMode, ToolPermissionError> {
    const entry = this.#entries.find((candidate) => candidate.name === name);
    if (entry === undefined) {
      return err(permissionError("unknownTool"));
    }
    return entry.risk === risk
      ? ok(entry.mode)
      : err(permissionError("riskMismatch"));
  }

  /** Changes one exact tool entry after validating its name and risk. */
  set(
    name: string,
    risk: ToolRisk,
    mode: ToolPermissionMode,
  ): Result<ToolPermissionSnapshot, ToolPermissionError> {
    if (!validMode(mode)) {
      return err(permissionError("invalidMode"));
    }
    const entry = this.#entries.find((candidate) => candidate.name === name);
    if (entry === undefined) {
      return err(permissionError("unknownTool"));
    }
    if (entry.risk !== risk) {
      return err(permissionError("riskMismatch"));
    }
    entry.mode = mode;
    return ok(snapshot(entry));
  }

  /** Moves one selected mode along the closed deny/ask/allow order. */
  changeAt(
    index: number,
    direction: ToolPermissionDirection,
  ): Result<ToolPermissionSnapshot, ToolPermissionError> {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= this.#entries.length
    ) {
      return err(permissionError("invalidIndex"));
    }
    if (direction !== "less" && direction !== "more") {
      return err(permissionError("invalidMode"));
    }
    const entry = this.#entries.at(index);
    if (entry === undefined) {
      return err(permissionError("invalidIndex"));
    }
    entry.mode = changedMode(entry.mode, direction);
    return ok(snapshot(entry));
  }

  /** Releases every session grant by restoring the reviewed defaults. */
  reset(): void {
    for (const entry of this.#entries) {
      entry.mode = entry.defaultMode;
    }
  }
}
