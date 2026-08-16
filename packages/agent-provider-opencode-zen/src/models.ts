export type OpenCodeZenModelId =
  | "deepseek-v4-pro"
  | "deepseek-v4-flash"
  | "minimax-m3"
  | "minimax-m2.7"
  | "minimax-m2.5"
  | "glm-5.2"
  | "glm-5.1"
  | "glm-5"
  | "kimi-k2.5"
  | "kimi-k2.6"
  | "kimi-k2.7-code"
  | "kimi-k3"
  | "big-pickle"
  | "mimo-v2.5-free"
  | "hy3-free"
  | "laguna-s-2.1-free"
  | "nemotron-3-ultra-free"
  | "nemotron-3.5-lightning-free"
  | "deepseek-v4-flash-free";

export const OPENCODE_ZEN_MODELS: readonly OpenCodeZenModelId[] = Object.freeze([
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "minimax-m3",
  "minimax-m2.7",
  "minimax-m2.5",
  "glm-5.2",
  "glm-5.1",
  "glm-5",
  "kimi-k2.5",
  "kimi-k2.6",
  "kimi-k2.7-code",
  "kimi-k3",
  "big-pickle",
  "mimo-v2.5-free",
  "hy3-free",
  "laguna-s-2.1-free",
  "nemotron-3-ultra-free",
  "nemotron-3.5-lightning-free",
  "deepseek-v4-flash-free",
]);

/** Recognizes only models admitted for the owned Zen Chat Completions wire. */
export function isOpenCodeZenModelId(value: unknown): value is OpenCodeZenModelId {
  return (
    typeof value === "string" &&
    OPENCODE_ZEN_MODELS.some((model) => model === value)
  );
}

export const OPENCODE_ZEN_MODEL: OpenCodeZenModelId =
  "deepseek-v4-flash-free";
