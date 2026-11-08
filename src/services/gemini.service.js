import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY is not set. Gemini services will fail.');
}

const ai = new GoogleGenAI({ apiKey });
let ex4CacheHandle = null;

const DEFAULT_MODEL = 'gemini-1.5-flash-001';
const CORE_PROMPT_PATH = path.join(__dirname, '../../prompts/core_marking_protocol.txt');
const EX4_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_rubric_and_anchors.txt');
const TRANSCRIPTION_PROMPT_PATH = path.join(__dirname, '../../prompts/ex4_transcription_prompt.txt');

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
 * Initializes or retrieves cached system instructions for Exercise 4.
 * Context caching slashes repeated evaluation costs by >95%.
 */
function getExpireTimestamp(cache) {
  const raw = cache?.expireTime || cache?.expirationTime || cache?.expire_time;
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export async function getOrCreateEx4Cache() {
  if (ex4CacheHandle) {
    const expireTime = getExpireTimestamp(ex4CacheHandle);
    if (expireTime && expireTime > Date.now()) {
      return ex4CacheHandle.name;
    }
  }

  const coreRules = readPromptFile(CORE_PROMPT_PATH);
  const ex4Rules = readPromptFile(EX4_PROMPT_PATH);
  const fullSystemInstruction = `${coreRules}\n\n${ex4Rules}`;

  const ttlSeconds = Number(process.env.CACHE_TTL_SECONDS || 86400);

  try {
    const cache = await ai.caches.create({
      model: DEFAULT_MODEL,
      config: {
        displayName: 'ex4_marking_cache',
        contents: [{ role: 'user', parts: [{ text: fullSystemInstruction }] }],
        ttl: `${ttlSeconds}s`
      }
    });

    ex4CacheHandle = cache;
    console.log(`[Gemini] Context cache created: ${cache.name}`);
    return cache.name;
  } catch (err) {
    console.error('[Gemini] Failed to create context cache:', err);
    throw err;
  }
}

/**
 * Resets the cached handle. Useful in tests or after token quota issues.
 */
export function resetEx4Cache() {
  ex4CacheHandle = null;
}

/**
 * Transcribes student handwriting from an image buffer without correcting errors.
 */
export async function transcribeHandwriting(imageBuffer, mimeType) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  const prompt = readPromptFile(TRANSCRIPTION_PROMPT_PATH);

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        {
          inlineData: {
            data: imageBuffer.toString('base64'),
            mimeType
          }
        },
        { text: prompt }
      ],
      config: { temperature: 0.0 }
    });

    return (response.text || '').trim();
  } catch (err) {
    console.error('[Gemini] Transcription failed:', err);
    throw err;
  }
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
 * Evaluates the final student text against the cached Exercise 4 rubric.
 */
export async function evaluateArticle(studentName, taskPrompt, studentText) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  if (!taskPrompt || !studentText) {
    throw new Error('Task prompt and student text are required.');
  }

  const cacheName = await getOrCreateEx4Cache();

  const userMessage = `
STUDENT FIRST NAME: ${studentName || 'Student'}
TASK PROMPT:
${taskPrompt}

STUDENT SUBMITTED DRAFT:
${studentText}
`;

  try {
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      config: {
        cachedContent: cacheName,
        responseMimeType: 'application/json',
        responseSchema: MarkingResponseSchema,
        temperature: 0.0
      }
    });

    const rawText = response.text || '{}';
    const parsed = JSON.parse(rawText);

    // Defensive normalization
    parsed.marks = normalizeMarks(parsed.marks || {});
    parsed.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    parsed.content_feedback = Array.isArray(parsed.content_feedback) ? parsed.content_feedback : [];
    parsed.corrected_version = String(parsed.corrected_version || studentText);

    return parsed;
  } catch (err) {
    console.error('[Gemini] Evaluation failed:', err);
    throw err;
  }
}
