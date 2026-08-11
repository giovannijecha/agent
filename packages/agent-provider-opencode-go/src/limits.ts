/** Fixed bounds for the owned OpenCode Go protocol adapter. */
export const OPENCODE_GO_LIMITS = Object.freeze({
  instructionsCodeUnits: 4_096,
  requestCodeUnits: 8_388_608,
  sseBufferCodeUnits: 1_114_112,
  sseDataCodeUnits: 1_048_576,
  sseLinesPerEvent: 256,
  sseTotalLines: 16_384,
  toolArgumentCodeUnits: 1_048_576,
  toolBatchArgumentCodeUnits: 1_048_576,
  toolCallsPerBatch: 32,
  wireEvents: 4_096,
});
