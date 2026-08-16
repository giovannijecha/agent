/** Public surface for the owned OpenCode Go provider adapter. */

export type {
  OpenCodeGoCreateError,
  OpenCodeGoCreateErrorKind,
  OpenCodeGoError,
  OpenCodeGoFailureOperation,
  OpenCodeGoFailureReason,
} from "./errors.js";
export { OPENCODE_GO_LIMITS } from "./limits.js";
export { OpenCodeGoModel } from "./model.js";
export {
  isOpenCodeGoModelId,
  OPENCODE_GO_MODEL,
  OPENCODE_GO_MODELS,
  type OpenCodeGoModelId,
} from "./models.js";
export type {
  OpenCodeGoTransport,
  OpenCodeGoTransportError,
  OpenCodeGoTransportErrorKind,
  OpenCodeGoTransportRequest,
  OpenCodeGoTransportStream,
} from "./transport.js";
