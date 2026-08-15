import { err, ok, type Result } from "@agent/core";
import type { ToolRisk } from "@agent/tools";

import type {
  ToolActivitySnapshot,
  ToolActivityState,
} from "./tool-activity-log.js";
import { projectPatchMutationPreview } from "./workspace-mutation-preview.js";

export type ToolActivityTruth = "attention" | "negative" | "positive";

export type ToolActivityPresentationDefinition = Readonly<{
  action: string;
  name: string;
  risk: ToolRisk;
}>;

export type ToolActivityPresentation = Readonly<{
  action: string;
  detail: string;
  marker: "x" | "\u2022";
  preview: string;
  state: ToolActivityState;
  stateLabel: string;
  truth: ToolActivityTruth;
}>;

export type ToolActivityPresentationError = Readonly<{
  kind: "invalidPreview" | "invalidState" | "riskMismatch" | "unknownTool";
}>;

export const TOOL_ACTIVITY_PRESENTATION_DEFINITIONS:
  readonly ToolActivityPresentationDefinition[] = Object.freeze([
  Object.freeze({ action: "Read", name: "read_file", risk: "read" as const }),
  Object.freeze({
    action: "List",
    name: "list_directory",
    risk: "read" as const,
  }),
  Object.freeze({
    action: "Search",
    name: "search_text",
    risk: "read" as const,
  }),
  Object.freeze({
    action: "Write",
    name: "apply_patch",
    risk: "write" as const,
  }),
  Object.freeze({
    action: "Manage",
    name: "manage_path",
    risk: "write" as const,
  }),
  Object.freeze({
    action: "Run",
    name: "run_process",
    risk: "execute" as const,
  }),
]);

function presentationError(
  kind: ToolActivityPresentationError["kind"],
): ToolActivityPresentationError {
  return Object.freeze({ kind });
}

function validState(state: unknown): state is ToolActivityState {
  return (
    state === "permission" ||
    state === "cancelled" ||
    state === "cancelling" ||
    state === "denied" ||
    state === "failed" ||
    state === "queued" ||
    state === "running" ||
    state === "succeeded"
  );
}

function truthFor(state: ToolActivityState): ToolActivityTruth {
  if (state === "succeeded") return "positive";
  return state === "failed" || state === "denied" || state === "cancelled"
    ? "negative"
    : "attention";
}

/** Projects one exact lifecycle snapshot into bounded display-only semantics. */
export function projectToolActivityPresentation(
  activity: ToolActivitySnapshot,
): Result<ToolActivityPresentation, ToolActivityPresentationError> {
  const definition = TOOL_ACTIVITY_PRESENTATION_DEFINITIONS.find(
    (candidate) => candidate.name === activity.name,
  );
  if (definition === undefined) {
    return err(presentationError("unknownTool"));
  }
  if (definition.risk !== activity.risk) {
    return err(presentationError("riskMismatch"));
  }
  if (!validState(activity.state)) {
    return err(presentationError("invalidState"));
  }
  let detail = "";
  let preview = activity.preview;
  if (activity.name === "apply_patch" && activity.preview.length > 0) {
    const patch = projectPatchMutationPreview(activity.preview);
    if (patch === undefined) {
      return err(presentationError("invalidPreview"));
    }
    detail = patch.path;
    preview = patch.diff;
  }
  const truth = truthFor(activity.state);
  return ok(
    Object.freeze({
      action: definition.action,
      detail,
      marker: truth === "negative" ? "x" as const : "\u2022" as const,
      preview,
      state: activity.state,
      stateLabel: activity.state,
      truth,
    }),
  );
}
