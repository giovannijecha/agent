export type OpenAIModelId = string;

/** Recognizes bounded identifiers admitted only from the authenticated catalog. */
export function isOpenAIModelId(value: unknown): value is OpenAIModelId {
  return typeof value === "string" &&
    value.length >= 1 && value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}
