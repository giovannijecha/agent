/** Public surface for the owned Ollama Cloud provider adapter. */

export type {
  OllamaCloudCreateError,
  OllamaCloudCreateErrorKind,
  OllamaCloudError,
  OllamaCloudFailureOperation,
  OllamaCloudFailureReason,
} from "./errors.js";
export { OLLAMA_CLOUD_LIMITS } from "./limits.js";
export { OllamaCloudModel } from "./model.js";
export {
  isOllamaCloudModelId,
  type OllamaCloudModelId,
} from "./models.js";
export type {
  OllamaCloudTransport,
  OllamaCloudTransportError,
  OllamaCloudTransportErrorKind,
  OllamaCloudTransportRequest,
  OllamaCloudTransportStream,
} from "./transport.js";
