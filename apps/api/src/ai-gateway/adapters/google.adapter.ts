import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentConfig, type Schema } from '@google/genai';
import { logger } from '../../lib/logger.js';
import type { AiAdapterParams, AiAdapterResult } from '../errors/ai-gateway.error.js';

const googleClients = new Map<string, GoogleGenAI>();

export function getGoogleClient(apiKey: string): GoogleGenAI {
  const existing = googleClients.get(apiKey);
  if (existing) return existing;
  const created = new GoogleGenAI({ apiKey });
  googleClients.set(apiKey, created);
  return created;
}

const GEMINI_TYPE_MAP: Record<string, Type> = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN
};

const THINKING_LEVEL_MAP: Record<string, ThinkingLevel> = {
  MINIMAL: ThinkingLevel.MINIMAL,
  LOW: ThinkingLevel.LOW,
  MEDIUM: ThinkingLevel.MEDIUM,
  HIGH: ThinkingLevel.HIGH
};

export function convertToGeminiSchema(schema: Record<string, unknown>): Schema {
  const converted: Schema = {};

  if (typeof schema.type === 'string' && GEMINI_TYPE_MAP[schema.type]) {
    converted.type = GEMINI_TYPE_MAP[schema.type];
  }
  if (typeof schema.description === 'string') {
    converted.description = schema.description;
  }
  if (Array.isArray(schema.required)) {
    converted.required = schema.required.filter((item): item is string => typeof item === 'string');
  }
  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    converted.items = convertToGeminiSchema(schema.items as Record<string, unknown>);
  }
  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    const props: Record<string, Schema> = {};
    for (const [key, val] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        props[key] = convertToGeminiSchema(val as Record<string, unknown>);
      }
    }
    converted.properties = props;
  }

  return converted;
}

export async function callGoogleAdapter({
  taskType,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  file,
  jsonSchema,
  temperature,
  maxOutputTokens,
  timeoutMs,
  reasoningConfig
}: AiAdapterParams): Promise<AiAdapterResult> {
  const ai = getGoogleClient(apiKey);
  const contents = file
    ? [
        { inlineData: { data: file.base64, mimeType: file.mimeType } },
        { text: userPrompt }
      ]
    : [{ role: 'user', parts: [{ text: userPrompt }] }];

  const reqConfig: GenerateContentConfig = {
    temperature,
    maxOutputTokens,
    abortSignal: AbortSignal.timeout(timeoutMs)
  };

  if (systemPrompt) {
    reqConfig.systemInstruction = systemPrompt;
  }
  if (jsonSchema) {
    reqConfig.responseMimeType = 'application/json';
    reqConfig.responseSchema = convertToGeminiSchema(jsonSchema);
  }

  const explicitReasoning =
    typeof reasoningConfig?.thinkingLevel === 'string'
      ? reasoningConfig.thinkingLevel
      : typeof reasoningConfig?.effort === 'string'
        ? reasoningConfig.effort
        : undefined;

  if (explicitReasoning !== undefined) {
    const thinkingRaw = explicitReasoning.trim().toUpperCase();
    if (thinkingRaw && thinkingRaw !== 'NONE' && THINKING_LEVEL_MAP[thinkingRaw]) {
      reqConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL_MAP[thinkingRaw] };
    }
  } else {
    const envThinking =
      taskType === 'vision'
        ? process.env.GEMINI_VISION_THINKING_LEVEL || ''
        : process.env.GEMINI_EVAL_THINKING_LEVEL || '';
    const thinkingRaw = envThinking.trim().toUpperCase();
    if (thinkingRaw && thinkingRaw !== 'NONE' && THINKING_LEVEL_MAP[thinkingRaw]) {
      reqConfig.thinkingConfig = { thinkingLevel: THINKING_LEVEL_MAP[thinkingRaw] };
    }
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: reqConfig
  });

  const finishReason = response?.candidates?.[0]?.finishReason || 'STOP';
  if (finishReason !== 'STOP') {
    logger.warn({ model, finishReason }, `[Google Adapter] Non-STOP finish reason for '${model}'`);
  }

  const usage = response.usageMetadata;
  return {
    text: (response.text || '').trim(),
    finishReason,
    promptTokens: typeof usage?.promptTokenCount === 'number' ? usage.promptTokenCount : null,
    completionTokens:
      typeof usage?.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : null,
    totalTokens: typeof usage?.totalTokenCount === 'number' ? usage.totalTokenCount : null
  };
}
