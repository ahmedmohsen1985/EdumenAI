/**
 * Backward-compatibility wrapper redirecting legacy imports to the unified multi-provider ai.service.js.
 */
export {
  AiServiceError,
  PROVIDER_DISPLAY_NAMES,
  MARKING_JSON_SCHEMA,
  MarkingResponseSchema,
  classifyAiProviderError,
  invokeAiModel,
  extractAndParseJson,
  sanitizeTranscription,
  transcribeHandwriting,
  extractTaskQuestion,
  evaluateArticle,
  resetEx4Cache,
  getOrCreateEx4Cache
} from './ai.service.js';
