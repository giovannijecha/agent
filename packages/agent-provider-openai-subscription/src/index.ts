/** Public surface for decision 0095's inactive OpenAI provider transport. */

export { decodeOpenAIModelCatalog, OpenAIModelCatalog } from "./catalog.js";
export type {
  OpenAICreateError,
  OpenAICreateErrorKind,
  OpenAIError,
  OpenAIFailureOperation,
  OpenAIFailureReason,
} from "./errors.js";
export { OPENAI_PROVIDER_LIMITS } from "./limits.js";
export { OpenAISubscriptionModel } from "./model.js";
export { isOpenAIModelId, type OpenAIModelId } from "./models.js";
export type {
  OpenAICatalogCapture,
  OpenAIProviderTransport,
  OpenAITransportError,
  OpenAITransportErrorKind,
  OpenAITransportRequest,
  OpenAITransportStream,
} from "./transport.js";
