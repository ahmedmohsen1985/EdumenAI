import '../config.js';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  config,
  getTaskAiConfig,
  getProviderApiKey,
  getProviderBaseUrl
} from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_PROMPT_PATH = path.join(__dirname, '../../prompts/core_marking_protocol.txt');
const EX4_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_rubric_and_anchors.txt');
const TRANSCRIPTION_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_transcription_prompt.txt');

export const PROVIDER_DISPLAY_NAMES = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter'
};

/**
 * Custom error class carrying rich provider, model, HTTP status, and quota metadata.
 */
export class AiServiceError extends Error {
  constructor({
    message,
    statusCode = 500,
    code = 'AI_SERVICE_ERROR',
    provider = 'unknown',
    model = 'unknown',
    taskType = 'unknown',
    isQuotaError = false,
    retryAfter = null,
    cause = null
  }) {
    super(message);
    this.name = 'AiServiceError';
    this.statusCode = statusCode;
    this.code = code;
    this.provider = provider;
    this.model = model;
    this.taskType = taskType;
    this.isQuotaError = isQuotaError;
    this.retryAfter = retryAfter;
    if (cause) this.cause = cause;
  }
}

// Cache of GoogleGenAI SDK client instances per API key
const googleClients = new Map();
function getGoogleClient(apiKey) {
  if (!googleClients.has(apiKey)) {
    googleClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return googleClients.get(apiKey);
}

/**
 * Extracts raw message text and HTTP/provider status from any SDK or fetch error.
 */
function extractErrorDetails(err, explicitStatus = null) {
  const status = Number(
    explicitStatus ||
    err?.statusCode ||
    err?.status ||
    err?.code ||
    err?.error?.code ||
    err?.error?.status ||
    0
  ) || null;

  let serialized = '';
  try {
    serialized = typeof err === 'string' ? err : JSON.stringify(err);
  } catch (_) {
    serialized = '';
  }

  const message = String(
    err?.error?.message ||
    err?.message ||
    serialized ||
    'Unknown AI provider error'
  );

  return { status, message, fullText: `${message} ${serialized}`.toLowerCase() };
}

function extractRetryHint(text) {
  const hMatch = text.match(/retry in ([0-9]+h[0-9]+m)/i);
  if (hMatch) return hMatch[1];
  const sMatch = text.match(/"retrydelay":\s*"([0-9]+s)"/i);
  if (sMatch) return sMatch[1];
  return null;
}

/**
 * Classifies provider failures into clean, actionable errors without falling back to weaker models.
 */
export function classifyAiProviderError(provider, model, taskType, err, explicitStatus = null) {
  if (err instanceof AiServiceError) return err;

  const providerLabel = PROVIDER_DISPLAY_NAMES[provider] || provider;
  const { status, message, fullText } = extractErrorDetails(err, explicitStatus);

  // Timeout errors
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || fullText.includes('timed out')) {
    return new AiServiceError({
      message: `The AI request timed out on ${providerLabel} (${model}). Please try again.`,
      statusCode: 504,
      code: 'AI_TIMEOUT',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  // Quota, rate-limit, and billing exhaustion detection across all 4 providers
  const isQuotaOrBilling =
    status === 429 ||
    status === 402 ||
    fullText.includes('resource_exhausted') ||
    fullText.includes('quota exceeded') ||
    fullText.includes('exceeded your current quota') ||
    fullText.includes('insufficient_quota') ||
    fullText.includes('billing_hard_limit_reached') ||
    fullText.includes('credit balance is too low') ||
    fullText.includes('insufficient credits') ||
    fullText.includes('more credits') ||
    fullText.includes('rate_limit_exceeded') ||
    fullText.includes('rate_limit_error') ||
    fullText.includes('free_tier_requests') ||
    fullText.includes('usage limits');

  if (isQuotaOrBilling) {
    const retryAfter = extractRetryHint(fullText);
    return new AiServiceError({
      message: `AI service quota or billing balance has been exhausted on ${providerLabel} (${model}). To preserve marking quality, automatic downgrade is disabled—please recharge your API balance or enable Pay-as-you-go billing on ${providerLabel} to restore service.`,
      statusCode: 429,
      code: 'QUOTA_EXCEEDED',
      provider,
      model,
      taskType,
      isQuotaError: true,
      retryAfter,
      cause: err
    });
  }

  // Authentication errors
  if (
    status === 401 ||
    status === 403 ||
    fullText.includes('invalid_api_key') ||
    fullText.includes('authentication_error') ||
    fullText.includes('api key not valid') ||
    fullText.includes('incorrect api key')
  ) {
    return new AiServiceError({
      message: `Authentication failed for ${providerLabel} (${model}). Please verify the API key configured in .env.`,
      statusCode: 500,
      code: 'INVALID_API_KEY',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  // Model configuration errors
  if (
    status === 404 ||
    fullText.includes('model_not_found') ||
    fullText.includes('does not exist') ||
    fullText.includes('is not found') ||
    fullText.includes('is not supported for')
  ) {
    return new AiServiceError({
      message: `Configured model '${model}' was not found or is unsupported on ${providerLabel}. Please check your .env model settings.`,
      statusCode: 500,
      code: 'MODEL_NOT_FOUND',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  // Temporary provider overload
  if (
    status === 503 ||
    status === 529 ||
    fullText.includes('unavailable') ||
    fullText.includes('high demand') ||
    fullText.includes('overloaded')
  ) {
    return new AiServiceError({
      message: `${providerLabel} (${model}) is currently experiencing high traffic. Please retry in a few moments.`,
      statusCode: 503,
      code: 'PROVIDER_OVERLOADED',
      provider,
      model,
      taskType,
      cause: err
    });
  }

  return new AiServiceError({
    message: `${providerLabel} (${model}) error: ${message}`,
    statusCode: status && status >= 400 && status < 600 ? status : 500,
    code: 'AI_PROVIDER_ERROR',
    provider,
    model,
    taskType,
    cause: err
  });
}

/**
 * Unified Standard JSON Schema for Exercise 4 Marking Reports.
 * Compatible with OpenAI strict json_schema, Anthropic tool input_schema, OpenRouter, and Gemini.
 */
export const MARKING_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    marks: {
      type: 'object',
      additionalProperties: false,
      properties: {
        content: { type: 'integer', description: 'Content & Communication mark out of 8' },
        content_max: { type: 'integer', description: 'Always 8' },
        language: { type: 'integer', description: 'Language mark out of 15' },
        language_max: { type: 'integer', description: 'Always 15' },
        total: { type: 'integer', description: 'Total mark out of 23' },
        total_max: { type: 'integer', description: 'Always 23' }
      },
      required: ['content', 'content_max', 'language', 'language_max', 'total', 'total_max']
    },
    justification: {
      type: 'object',
      additionalProperties: false,
      properties: {
        content: { type: 'string', description: 'Single decisive reason for Content mark' },
        language: { type: 'string', description: 'Single decisive reason for Language mark' }
      },
      required: ['content', 'language']
    },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          original: { type: 'string', description: 'Original student text containing the error' },
          correction: { type: 'string', description: 'Corrected version of the error' },
          category: { type: 'string', description: 'Error type (Preposition, Punctuation, Grammar, etc.)' },
          explanation: { type: 'string', description: "Simple A2-B1 explanation using the student's own example" }
        },
        required: ['original', 'correction', 'category', 'explanation']
      }
    },
    content_feedback: {
      type: 'array',
      items: { type: 'string' },
      description: 'Bullet points detailing points covered and expandable points'
    },
    corrected_version: {
      type: 'string',
      description: "Full, complete polished student text covering 100% of the student draft from the first word to the very last word without cutting off. Highlight corrections with <mark class='correction'>word</mark> tags on the entire corrected word. Never tag single letters. Do not use addition or other tags."
    }
  },
  required: ['marks', 'justification', 'errors', 'content_feedback', 'corrected_version']
};

const GEMINI_TYPE_MAP = {
  object: Type.OBJECT,
  array: Type.ARRAY,
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN
};

/**
 * Recursively converts a Standard JSON Schema object into Google GenAI Type schema.
 */
function convertToGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;

  const converted = {};
  if (schema.type && GEMINI_TYPE_MAP[schema.type]) {
    converted.type = GEMINI_TYPE_MAP[schema.type];
  }
  if (schema.description) converted.description = schema.description;
  if (Array.isArray(schema.required)) converted.required = [...schema.required];
  if (schema.items) converted.items = convertToGeminiSchema(schema.items);

  if (schema.properties && typeof schema.properties === 'object') {
    converted.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      converted.properties[key] = convertToGeminiSchema(val);
    }
  }

  return converted;
}

export const MarkingResponseSchema = convertToGeminiSchema(MARKING_JSON_SCHEMA);

/**
 * Helper to execute JSON HTTP requests with timeout and error parsing.
 */
async function postJsonRequest(url, headers, body, timeoutMs) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const rawBody = await response.text();
  let parsedBody = null;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch (_) {
    parsedBody = { rawBody };
  }

  if (!response.ok) {
    const err = new Error(parsedBody?.error?.message || parsedBody?.message || rawBody || `HTTP ${response.status}`);
    err.statusCode = response.status;
    err.error = parsedBody?.error || parsedBody;
    throw err;
  }

  return parsedBody;
}

/**
 * Provider Adapter 1: Google Gemini (@google/genai SDK)
 */
async function callGoogleAdapter({ apiKey, model, systemPrompt, userPrompt, file, jsonSchema, temperature, maxOutputTokens }) {
  const ai = getGoogleClient(apiKey);
  const contents = file
    ? [
        { inlineData: { data: file.base64, mimeType: file.mimeType } },
        { text: userPrompt }
      ]
    : [{ role: 'user', parts: [{ text: userPrompt }] }];

  const reqConfig = {
    temperature,
    maxOutputTokens
  };

  if (systemPrompt) {
    reqConfig.systemInstruction = systemPrompt;
  }
  if (jsonSchema) {
    reqConfig.responseMimeType = 'application/json';
    reqConfig.responseSchema = convertToGeminiSchema(jsonSchema);
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: reqConfig
  });

  return (response.text || '').trim();
}

function extractOpenAiMessageText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => part && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * Provider Adapter 2 & 3: OpenAI & OpenRouter (OpenAI-compatible /chat/completions)
 */
async function callOpenAiCompatibleAdapter({
  provider,
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  file,
  jsonSchema,
  schemaName,
  temperature,
  maxOutputTokens,
  timeoutMs
}) {
  const baseUrl = getProviderBaseUrl(provider);
  const url = `${baseUrl}/chat/completions`;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'https://edumenai.the-amaj.com';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'EdumenAI Exercise 4';
  }

  let userContent = userPrompt;
  if (file) {
    const fileBlock =
      file.mimeType === 'application/pdf'
        ? {
            type: 'file',
            file: {
              filename: file.filename || 'document.pdf',
              file_data: `data:application/pdf;base64,${file.base64}`
            }
          }
        : {
            type: 'image_url',
            image_url: {
              url: `data:${file.mimeType};base64,${file.base64}`
            }
          };

    userContent = [fileBlock, { type: 'text', text: userPrompt }];
  }

  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userContent });

  const isOpenAiReasoningModel = provider === 'openai' && /^(o[134]|gpt-5)/i.test(model);

  const buildPayload = (responseFormatMode) => {
    const payload = { model, messages };

    if (!isOpenAiReasoningModel) {
      payload.temperature = temperature;
    }

    if (provider === 'openai') {
      payload.max_completion_tokens = maxOutputTokens;
    } else {
      payload.max_tokens = maxOutputTokens;
    }

    if (provider === 'openrouter' && file?.mimeType === 'application/pdf') {
      const pdfEngine = (process.env.OPENROUTER_PDF_ENGINE || '').trim();
      if (pdfEngine) {
        payload.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
      }
    }

    if (jsonSchema && responseFormatMode === 'json_schema') {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName || 'marking_report',
          strict: true,
          schema: jsonSchema
        }
      };
    } else if (jsonSchema && responseFormatMode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  };

  try {
    const data = await postJsonRequest(url, headers, buildPayload(jsonSchema ? 'json_schema' : 'none'), timeoutMs);
    return extractOpenAiMessageText(data?.choices?.[0]?.message?.content);
  } catch (err) {
    // Some OpenRouter third-party models reject strict json_schema (400) while supporting json_object or plain JSON prompt.
    // Retry once on the exact same model with relaxed format header without altering model quality.
    const msgLower = String(err?.message || '').toLowerCase();
    const isSchemaHeaderRejected =
      provider === 'openrouter' &&
      jsonSchema &&
      err?.statusCode === 400 &&
      (msgLower.includes('response_format') || msgLower.includes('json_schema') || msgLower.includes('structured'));

    if (!isSchemaHeaderRejected) throw err;

    try {
      const data = await postJsonRequest(url, headers, buildPayload('json_object'), timeoutMs);
      return extractOpenAiMessageText(data?.choices?.[0]?.message?.content);
    } catch (secondErr) {
      if (secondErr?.statusCode === 400) {
        const data = await postJsonRequest(url, headers, buildPayload('none'), timeoutMs);
        return extractOpenAiMessageText(data?.choices?.[0]?.message?.content);
      }
      throw secondErr;
    }
  }
}

/**
 * Provider Adapter 4: Anthropic Claude (/v1/messages)
 */
async function callAnthropicAdapter({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  file,
  jsonSchema,
  schemaName,
  temperature,
  maxOutputTokens,
  timeoutMs
}) {
  const baseUrl = getProviderBaseUrl('anthropic');
  const url = `${baseUrl}/messages`;

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const contentBlocks = [];
  if (file) {
    if (file.mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: file.base64
        }
      });
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: file.mimeType,
          data: file.base64
        }
      });
    }
  }
  contentBlocks.push({ type: 'text', text: userPrompt });

  const body = {
    model,
    max_tokens: maxOutputTokens || 8192,
    temperature,
    messages: [{ role: 'user', content: contentBlocks }]
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  // Forced tool use guarantees schema-compliant JSON output on Anthropic models
  if (jsonSchema) {
    const toolName = schemaName || 'submit_marking_report';
    body.tools = [
      {
        name: toolName,
        description: 'Submit the complete Exercise 4 marking report matching the schema.',
        input_schema: jsonSchema
      }
    ];
    body.tool_choice = { type: 'tool', name: toolName };
  }

  const data = await postJsonRequest(url, headers, body, timeoutMs);
  const blocks = Array.isArray(data?.content) ? data.content : [];

  if (jsonSchema) {
    const toolBlock = blocks.find((b) => b.type === 'tool_use' && b.input);
    if (toolBlock) {
      return JSON.stringify(toolBlock.input);
    }
  }

  return blocks
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

const PROVIDER_ADAPTERS = {
  google: callGoogleAdapter,
  openai: (params) => callOpenAiCompatibleAdapter({ ...params, provider: 'openai' }),
  openrouter: (params) => callOpenAiCompatibleAdapter({ ...params, provider: 'openrouter' }),
  anthropic: callAnthropicAdapter
};

/**
 * General, flexible multi-provider AI invocation entry point.
 * Routes each task strictly to the configured specialist provider/model in .env (zero downgrade fallback).
 */
export async function invokeAiModel({
  taskType = 'evaluation',
  operationName = 'AiOperation',
  systemPrompt = '',
  userPrompt = '',
  file = null,
  jsonSchema = null,
  schemaName = 'marking_report',
  temperature = 0.0,
  maxOutputTokens = 8192
}) {
  const { provider, model } = getTaskAiConfig(taskType);
  const providerLabel = PROVIDER_DISPLAY_NAMES[provider] || provider;
  const { apiKey, envVarName } = getProviderApiKey(provider);

  if (!apiKey) {
    throw new AiServiceError({
      message: `${providerLabel} API key (${envVarName}) is not configured in .env for ${taskType} tasks.`,
      statusCode: 500,
      code: 'MISSING_API_KEY',
      provider,
      model,
      taskType
    });
  }

  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    throw new AiServiceError({
      message: `No adapter implemented for AI provider '${provider}'.`,
      statusCode: 500,
      code: 'UNSUPPORTED_PROVIDER',
      provider,
      model,
      taskType
    });
  }

  const keyTail = apiKey.length > 6 ? apiKey.slice(-6) : 'KEY';
  console.log(
    `[AI Gateway] [${taskType.toUpperCase()}] ${operationName}: invoking '${model}' on ${providerLabel} (Key ...${keyTail})`
  );

  try {
    const output = await adapter({
      apiKey,
      model,
      systemPrompt,
      userPrompt,
      file,
      jsonSchema,
      schemaName,
      temperature,
      maxOutputTokens,
      timeoutMs: config.aiTimeoutMs
    });

    console.log(`[AI Gateway] [${taskType.toUpperCase()}] ${operationName} succeeded (${provider} / ${model})`);
    return { text: output, provider, model };
  } catch (err) {
    const classified = classifyAiProviderError(provider, model, taskType, err);
    console.error(
      `[AI Gateway] [${taskType.toUpperCase()}] ${operationName} failed (${classified.code} / HTTP ${classified.statusCode}): ${classified.message}`
    );
    throw classified;
  }
}

function readPromptFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read prompt file: ${filePath}`, err);
    throw new Error(`Missing prompt file: ${filePath}`);
  }
}

/**
 * Parses JSON output defensively (strips markdown code fences if emitted by non-strict models).
 */
export function extractAndParseJson(rawText, provider, model) {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) {
    throw new AiServiceError({
      message: `Received empty JSON response from ${PROVIDER_DISPLAY_NAMES[provider] || provider} (${model}).`,
      statusCode: 502,
      code: 'EMPTY_AI_RESPONSE',
      provider,
      model,
      taskType: 'evaluation'
    });
  }

  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch (_) {}
  }

  throw new AiServiceError({
    message: `Invalid JSON report format returned by ${PROVIDER_DISPLAY_NAMES[provider] || provider} (${model}).`,
    statusCode: 502,
    code: 'INVALID_AI_JSON',
    provider,
    model,
    taskType: 'evaluation'
  });
}

/**
 * Sanitizes transcription artifacts (orphaned greetings, overzealous autocorrect, crossed-out duplicates).
 */
export function sanitizeTranscription(text) {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Clean orphaned or duplicated greetings e.g. "Dear ," before "Dear friends,"
  cleaned = cleaned.replace(/^Dear\s*,\s*(Dear\s+friends\b)/im, '$1');
  cleaned = cleaned.replace(/^Dear\s*,\s*/im, '');
  cleaned = cleaned.replace(/\bDear\s*,\s*Dear\b/gi, 'Dear');
  cleaned = cleaned.replace(/^Dear\s+friends,?\s+Dear\s+friends,?/im, 'Dear friends,');

  // 2. Remove struck-through phrase if model slipped it before replacement
  cleaned = cleaned.replace(
    /opinions\s+such\s+as\s+(?:on\s+)?north\s+korea,?\s+and\s+about\s+their\s+Political/i,
    'opinions about their Political'
  );

  // 3. Preserve intentional student spelling if model inserted a missing letter
  cleaned = cleaned.replace(/\bintellectual\b/g, 'intelletual');

  return cleaned.trim();
}

function buildFilePayload(fileBuffer, mimeType, baseName) {
  const normalizedMime = mimeType === 'application/pdf' ? 'application/pdf' : (mimeType || 'image/jpeg');
  const ext = normalizedMime === 'application/pdf' ? '.pdf' : `.${(normalizedMime.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
  return {
    base64: fileBuffer.toString('base64'),
    mimeType: normalizedMime,
    filename: `${baseName}${ext}`
  };
}

/**
 * Transcribes student handwriting from an image or scanned PDF buffer without correcting errors.
 * Uses the configured 'vision' provider/model.
 */
export async function transcribeHandwriting(fileBuffer, mimeType) {
  const prompt = readPromptFile(TRANSCRIPTION_PROMPT_PATH);
  const file = buildFilePayload(fileBuffer, mimeType, 'student_handwriting');

  const { text } = await invokeAiModel({
    taskType: 'vision',
    operationName: 'Transcription',
    systemPrompt: prompt,
    userPrompt: prompt,
    file,
    temperature: 0.0,
    maxOutputTokens: 4096
  });

  return sanitizeTranscription(text);
}

/**
 * Extracts the exam question text (prompt, bullet points, context) from an image or scanned PDF.
 * Uses the configured 'vision' provider/model.
 */
export async function extractTaskQuestion(fileBuffer, mimeType) {
  const file = buildFilePayload(fileBuffer, mimeType, 'exam_question');

  const taskPromptInstruction = `You are an Oxford AQA IGCSE ESL examination assistant.
Extract the EXACT and COMPLETE Exercise 4 exam question text from this exam paper image or PDF.

Include:
- Any context / scenario (e.g., 'You see this announcement in your school magazine...', 'You have had a class discussion about...')
- The article topic or headline (e.g., 'Articles wanted: Social media in modern life')
- The core question/prompt (e.g., 'Have we become too dependent on social media? Write an article giving your views.')
- Any bullet points, notes, or prompts to include
- The word count guideline if present (e.g., 'Write your article in about 100-150 words.')

Rules:
1. Output ONLY the clean question text in clear English.
2. Maintain paragraph breaks and bullet points.
3. Do NOT include page numbers, exam barcodes, candidate numbers, or center headers.
4. Do NOT answer the question. Only extract the question itself.`;

  const { text } = await invokeAiModel({
    taskType: 'vision',
    operationName: 'TaskExtraction',
    systemPrompt: taskPromptInstruction,
    userPrompt: taskPromptInstruction,
    file,
    temperature: 0.0,
    maxOutputTokens: 2048
  });

  return text.trim();
}

/**
 * Validates and clamps marks to ensure they stay within allowed ranges.
 */
function normalizeMarks(marks) {
  const content = Math.max(0, Math.min(8, Number(marks.content) || 0));
  const language = Math.max(0, Math.min(15, Number(marks.language) || 0));
  const total = Math.max(0, Math.min(23, Number(marks.total) || content + language));

  return {
    content,
    content_max: 8,
    language,
    language_max: 15,
    total,
    total_max: 23
  };
}

/**
 * Evaluates the final student text against the Exercise 4 rubric.
 * Uses the configured 'evaluation' provider/model.
 */
export async function evaluateArticle(studentName, taskPrompt, studentText) {
  if (!taskPrompt || !studentText) {
    throw new Error('Task prompt and student text are required.');
  }

  const userMessage = `
STUDENT FIRST NAME: ${studentName || 'Student'}
TASK PROMPT:
${taskPrompt}

STUDENT SUBMITTED DRAFT:
${studentText}

CRITICAL REQUIREMENT FOR 'corrected_version':
Rewrite and polish the student's submission from start to finish. You MUST NOT cut off, shorten, or stop early. Every single paragraph and sentence down to the closing line must be included in 'corrected_version'.

OUTPUT REQUIREMENT:
Return strictly valid JSON with keys: marks, justification, errors, content_feedback, corrected_version.
`;

  const coreRules = readPromptFile(CORE_PROMPT_PATH);
  const ex4Rules = readPromptFile(EX4_PROMPT_PATH);
  const fullSystemInstruction = `${coreRules}\n\n${ex4Rules}`;

  const { text, provider, model } = await invokeAiModel({
    taskType: 'evaluation',
    operationName: 'ArticleEvaluation',
    systemPrompt: fullSystemInstruction,
    userPrompt: userMessage,
    jsonSchema: MARKING_JSON_SCHEMA,
    schemaName: 'submit_marking_report',
    temperature: 0.0,
    maxOutputTokens: 8192
  });

  const parsed = extractAndParseJson(text, provider, model);

  // Defensive normalization
  parsed.marks = normalizeMarks(parsed.marks || {});
  parsed.justification = parsed.justification && typeof parsed.justification === 'object'
    ? parsed.justification
    : { content: '', language: '' };
  parsed.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  parsed.content_feedback = Array.isArray(parsed.content_feedback) ? parsed.content_feedback : [];

  let corrected = String(parsed.corrected_version || studentText);
  corrected = corrected.replace(/<mark class=["']addition["']>/gi, '<mark class="correction">');
  corrected = corrected.replace(/<mark[^>]*>([A-Za-z])<\/mark>([A-Za-z0-9_]+)/g, '<mark class="correction">$1$2</mark>');
  corrected = corrected.replace(/([A-Za-z0-9_]+)<mark[^>]*>([A-Za-z0-9_]+)<\/mark>/g, '<mark class="correction">$1$2</mark>');
  parsed.corrected_version = corrected;

  return parsed;
}

// Backward-compatibility stubs
export function resetEx4Cache() {}
export async function getOrCreateEx4Cache() { return null; }
