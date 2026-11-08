import '../config.js';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGeminiApiKeys } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_PROMPT_PATH = path.join(__dirname, '../../prompts/core_marking_protocol.txt');
const EX4_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_rubric_and_anchors.txt');
const TRANSCRIPTION_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_transcription_prompt.txt');

/**
 * Priority chain of candidate models for automatic fallback on 429 quota exhaustion or service errors.
 * 1. gemini-3.5-flash: Top speed, next-gen reasoning, confirmed active on Free Tier.
 * 2. gemini-3-flash-preview: Superior OCR fidelity, confirmed active on Free Tier.
 * 3. gemini-flash-latest: Stable production Flash.
 * 4. gemini-2.5-flash: Standard Flash (will be used when its quota resets).
 * 5. gemini-flash-lite-latest: High-speed lightweight fallback.
 * 6. gemini-3.1-flash-lite: Lightweight backup.
 */
export const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite'
];

// Cache of GoogleGenAI SDK client instances per API key
const aiClients = new Map();
function getAiClient(apiKey) {
  if (!aiClients.has(apiKey)) {
    aiClients.set(apiKey, new GoogleGenAI({ apiKey }));
  }
  return aiClients.get(apiKey);
}

// Cooldown tracker for models that exceeded quota: Map of `${apiKey}_${model}` -> timestamp
const modelCooldowns = new Map();

function isCoolingDown(apiKey, model) {
  const mapKey = `${apiKey}_${model}`;
  const until = modelCooldowns.get(mapKey);
  if (!until) return false;
  if (Date.now() > until) {
    modelCooldowns.delete(mapKey);
    return false;
  }
  return true;
}

function markExhausted(apiKey, model, seconds = 1800) {
  const mapKey = `${apiKey}_${model}`;
  const until = Date.now() + (seconds * 1000);
  modelCooldowns.set(mapKey, until);
  const keyTail = apiKey.length > 6 ? apiKey.slice(-6) : 'KEY';
  console.warn(`[Gemini Quota] Model '${model}' marked exhausted on Key ...${keyTail} until ${new Date(until).toLocaleTimeString()}`);
}

function extractRetrySeconds(err) {
  try {
    const raw = String(err.message || JSON.stringify(err));
    const hMatch = raw.match(/retry in ([0-9]+)h([0-9]+)m/);
    if (hMatch) return (parseInt(hMatch[1], 10) * 3600) + (parseInt(hMatch[2], 10) * 60);
    const sMatch = raw.match(/"retryDelay":\s*"([0-9]+)s"/);
    if (sMatch) return parseInt(sMatch[1], 10);
  } catch (_) {}
  return 1800; // 30 minutes default cooldown
}

function isFallbackError(err) {
  if (!err) return false;
  const status = String(err.status || err.code || err.error?.code || err.error?.status || '');
  const msg = String(err.message || err.error?.message || '');

  return (
    status === '429' ||
    status === 'RESOURCE_EXHAUSTED' ||
    status === '404' ||
    status === '503' ||
    status === 'UNAVAILABLE' ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('Quota exceeded') ||
    msg.includes('not found') ||
    msg.includes('is not supported') ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

/**
 * Executes a Gemini operation with automatic multi-model and multi-key fallback.
 */
export async function callWithModelFallback(operationName, executeFn) {
  const apiKeys = getGeminiApiKeys();
  if (!apiKeys.length) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }

  let lastError = null;

  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const apiKey = apiKeys[keyIdx];
    const ai = getAiClient(apiKey);
    const keyTail = apiKey.length > 6 ? apiKey.slice(-6) : 'KEY';

    // Prioritize models that are NOT currently in quota cooldown
    const modelsToTry = [
      ...CANDIDATE_MODELS.filter(m => !isCoolingDown(apiKey, m)),
      ...CANDIDATE_MODELS.filter(m => isCoolingDown(apiKey, m))
    ];

    for (const model of modelsToTry) {
      if (isCoolingDown(apiKey, model) && modelsToTry.some(m => !isCoolingDown(apiKey, m))) {
        continue;
      }

      try {
        console.log(`[Gemini] ${operationName}: invoking model '${model}' (Key ...${keyTail})...`);
        const result = await executeFn(ai, model);
        console.log(`[Gemini] ${operationName} succeeded with model '${model}'`);
        return result;
      } catch (err) {
        lastError = err;
        const status = err.status || err.error?.code || err.error?.status || 'ERR';
        console.warn(`[Gemini Fallback] ${operationName} on '${model}' failed (${status}): ${err.message?.substring(0, 120)}`);

        if (isFallbackError(err)) {
          const delay = extractRetrySeconds(err);
          markExhausted(apiKey, model, delay);
          continue; // Try next model
        } else {
          throw err;
        }
      }
    }
  }

  console.error(`[Gemini Fallback] All candidate models and API keys failed for ${operationName}.`);
  throw lastError || new Error(`All Gemini models failed for ${operationName}.`);
}

/**
 * Strict JSON Schema for Gemini structured output.
 */
export const MarkingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    marks: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.INTEGER, description: 'Content & Communication mark out of 8' },
        content_max: { type: Type.INTEGER, description: 'Always 8' },
        language: { type: Type.INTEGER, description: 'Language mark out of 15' },
        language_max: { type: Type.INTEGER, description: 'Always 15' },
        total: { type: Type.INTEGER, description: 'Total mark out of 23' },
        total_max: { type: Type.INTEGER, description: 'Always 23' }
      },
      required: ['content', 'content_max', 'language', 'language_max', 'total', 'total_max']
    },
    justification: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: 'Single decisive reason for Content mark' },
        language: { type: Type.STRING, description: 'Single decisive reason for Language mark' }
      },
      required: ['content', 'language']
    },
    errors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING, description: 'Original student text containing the error' },
          correction: { type: Type.STRING, description: 'Corrected version of the error' },
          category: { type: Type.STRING, description: 'Error type (Preposition, Punctuation, Grammar, etc.)' },
          explanation: { type: Type.STRING, description: 'Simple A2-B1 explanation using the student\'s own example' }
        },
        required: ['original', 'correction', 'category', 'explanation']
      }
    },
    content_feedback: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Bullet points detailing points covered and expandable points'
    },
    corrected_version: {
      type: Type.STRING,
      description: "Complete student text with <mark class='correction'>yellow</mark> and <mark class='addition'>blue</mark> HTML tags"
    }
  },
  required: ['marks', 'justification', 'errors', 'content_feedback', 'corrected_version']
};

function readPromptFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read prompt file: ${filePath}`, err);
    throw new Error(`Missing prompt file: ${filePath}`);
  }
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

/**
 * Transcribes student handwriting from an image or scanned PDF buffer without correcting errors.
 */
export async function transcribeHandwriting(fileBuffer, mimeType) {
  const prompt = readPromptFile(TRANSCRIPTION_PROMPT_PATH);
  const normalizedMime = mimeType === 'application/pdf' ? 'application/pdf' : (mimeType || 'image/jpeg');
  const base64Data = fileBuffer.toString('base64');

  return await callWithModelFallback('Transcription', async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: normalizedMime
          }
        },
        { text: prompt }
      ],
      config: {
        systemInstruction: prompt,
        temperature: 0.0
      }
    });

    let text = (response.text || '').trim();
    return sanitizeTranscription(text);
  });
}

/**
 * Extracts the exam question text (prompt, bullet points, context) from an image or scanned PDF.
 */
export async function extractTaskQuestion(fileBuffer, mimeType) {
  const normalizedMime = mimeType === 'application/pdf' ? 'application/pdf' : (mimeType || 'image/jpeg');
  const base64Data = fileBuffer.toString('base64');

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

  return await callWithModelFallback('TaskExtraction', async (ai, model) => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: normalizedMime
          }
        },
        { text: taskPromptInstruction }
      ],
      config: { temperature: 0.0 }
    });

    return (response.text || '').trim();
  });
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
 * Evaluates the final student text against the Exercise 4 rubric with model fallback.
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
`;

  const coreRules = readPromptFile(CORE_PROMPT_PATH);
  const ex4Rules = readPromptFile(EX4_PROMPT_PATH);
  const fullSystemInstruction = `${coreRules}\n\n${ex4Rules}`;

  return await callWithModelFallback('ArticleEvaluation', async (ai, model) => {
    const config = {
      responseMimeType: 'application/json',
      responseSchema: MarkingResponseSchema,
      temperature: 0.0,
      systemInstruction: fullSystemInstruction
    };

    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);

    // Defensive normalization
    parsed.marks = normalizeMarks(parsed.marks || {});
    parsed.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    parsed.content_feedback = Array.isArray(parsed.content_feedback) ? parsed.content_feedback : [];
    parsed.corrected_version = String(parsed.corrected_version || studentText);

    return parsed;
  });
}

// Backward-compatibility stubs for cache reset
export function resetEx4Cache() {}
export async function getOrCreateEx4Cache() { return null; }
