/** Fixed public safety limits enforced by the owned streaming runtime. */
export const RUNTIME_LIMITS = Object.freeze({
  conversationCodeUnits: 1_048_576,
  conversationMessages: 256,
  deltaCodeUnits: 16_384,
  inputCodePoints: 4_096,
  responseCodeUnits: 262_144,
  streamEvents: 4_096,
  toolSteps: 32,
});
