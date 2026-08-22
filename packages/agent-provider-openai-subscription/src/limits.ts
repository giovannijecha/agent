/** Fixed bounds for the owned OpenAI transport. */
export const OPENAI_PROVIDER_LIMITS = Object.freeze({
  catalogBodyBytes: 1_048_576,
  catalogModels: 256,
  eventBufferCodeUnits: 1_048_576,
  instructionsCodeUnits: 4_096,
  requestCodeUnits: 8_388_608,
  reasoningCodeUnits: 1_048_576,
  responseChunkBytes: 65_536,
  toolArgumentCodeUnits: 1_048_576,
  toolCallsPerBatch: 32,
  wireEvents: 16_384,
});
