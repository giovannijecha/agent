export type OpenCodeGoModelId =
  | "glm-5.3"
  | "glm-5.2"
  | "glm-5.1"
  | "kimi-k3"
  | "kimi-k2.7-code"
  | "kimi-k2.6"
  | "deepseek-v4-pro"
  | "deepseek-v4-flash"
  | "mimo-v2.5"
  | "mimo-v2.5-pro"
  | "hy3";

export const OPENCODE_GO_MODELS: readonly OpenCodeGoModelId[] = Object.freeze([
  "glm-5.3",
  "glm-5.2",
  "glm-5.1",
  "kimi-k3",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "hy3",
]);

/** Recognizes only models admitted for the owned Go Chat Completions wire. */
export function isOpenCodeGoModelId(value: unknown): value is OpenCodeGoModelId {
  return (
    typeof value === "string" &&
    OPENCODE_GO_MODELS.some((model) => model === value)
  );
}

export const OPENCODE_GO_MODEL: OpenCodeGoModelId = "kimi-k2.7-code";
