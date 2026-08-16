/** Public surface for the owned OpenCode Zen provider adapter. */

export type {
  OpenCodeZenCreateError,
  OpenCodeZenCreateErrorKind,
  OpenCodeZenError,
  OpenCodeZenFailureOperation,
  OpenCodeZenFailureReason,
} from "./errors.js";
export { OPENCODE_ZEN_LIMITS } from "./limits.js";
export { OpenCodeZenModel } from "./model.js";
export type {
  OpenCodeZenTransport,
  OpenCodeZenTransportError,
  OpenCodeZenTransportErrorKind,
  OpenCodeZenTransportRequest,
  OpenCodeZenTransportStream,
} from "./transport.js";
export { OPENCODE_ZEN_MODEL } from "./wire.js";
