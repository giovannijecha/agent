/** Fixed bounds for the owned Ollama Cloud protocol adapter. */
export const OLLAMA_CLOUD_LIMITS = Object.freeze({
  instructionsCodeUnits: 4_096,
  ndjsonBufferCodeUnits: 1_114_112,
  ndjsonLineCodeUnits: 1_048_576,
  ndjsonLines: 16_384,
  requestCodeUnits: 8_388_608,
  thinkingCodeUnits: 1_048_576,
  toolArgumentCodeUnits: 1_048_576,
  toolBatchArgumentCodeUnits: 1_048_576,
  toolCallsPerBatch: 32,
  wireEvents: 4_096,
});
