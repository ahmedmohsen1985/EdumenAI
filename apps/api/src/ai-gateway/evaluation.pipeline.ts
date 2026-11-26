import {
  buildMarkingJsonSchema,
  createMarkingReportSchema,
  isLegacyEx4MarkingSchema,
  MARKING_JSON_SCHEMA,
  TRANSCRIPTION_JSON_SCHEMA,
  type MarkingMarksLimits,
  type MarkingReport,
  type PromptEntry,
  type TranscriptionMeta
} from '@edumenai/shared';
import { logger } from '../lib/logger.js';
import { HttpError } from '../services/exercise.service.js';
import {
  AiServiceError,
  invokeAiModel,
  isLengthTruncated,
  PROVIDER_DISPLAY_NAMES,
  type AiFilePayload,
  type AiUsageMetrics
} from './index.js';

function buildFilePayload(fileBuffer: Buffer, mimeType: string, baseName: string): AiFilePayload {
  const normalizedMime =
    mimeType === 'application/pdf' ? 'application/pdf' : mimeType || 'image/jpeg';
  const ext =
    normalizedMime === 'application/pdf'
      ? '.pdf'
      : `.${(normalizedMime.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
  return {
    base64: fileBuffer.toString('base64'),
    mimeType: normalizedMime,
    filename: `${baseName}${ext}`
  };
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function mergeUsageMetrics(a: AiUsageMetrics, b: AiUsageMetrics): AiUsageMetrics {
  return {
    promptTokens: sumNullable(a.promptTokens, b.promptTokens),
    completionTokens: sumNullable(a.completionTokens, b.completionTokens),
    totalTokens: sumNullable(a.totalTokens, b.totalTokens),
    latencyMs: sumNullable(a.latencyMs, b.latencyMs)
  };
}

/**
 * Parses JSON output defensively (strips markdown code fences if emitted by non-strict models).
 */
export function extractAndParseJson(
  rawText: string,
  provider: string,
  model: string
): Record<string, unknown> {
  const cleaned = String(rawText || '').trim();
  const providerLabel =
    (PROVIDER_DISPLAY_NAMES as Record<string, string>)[provider] || provider;

  if (!cleaned) {
    throw new AiServiceError({
      message: `Received empty JSON response from ${providerLabel} (${model}).`,
      statusCode: 502,
      code: 'EMPTY_AI_RESPONSE',
      provider,
      model,
      taskType: 'evaluation'
    });
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // try fence / brace recovery
  }

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  throw new AiServiceError({
    message: `Invalid JSON report format returned by ${providerLabel} (${model}).`,
    statusCode: 502,
    code: 'INVALID_AI_JSON',
    provider,
    model,
    taskType: 'evaluation'
  });
}

/**
 * Generic whitespace and meta-tag cleanup for OCR output.
 * Strictly avoids altering student words, spellings, or submission-specific text.
 */
export function sanitizeTranscription(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/^```(?:text|txt|markdown|json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\[(?:crossed[- ]?out|struck[- ]?through|strikethrough|deleted)\]/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractPartialJsonStringField(
  rawText: string,
  fieldName: string
): { found: boolean; value: string; complete: boolean } {
  const keyMatch = new RegExp(`"${fieldName}"\\s*:\\s*"`).exec(rawText);
  if (!keyMatch) return { found: false, value: '', complete: false };

  let i = keyMatch.index + keyMatch[0].length;
  let result = '';
  let complete = false;
  const escapeMap: Record<string, string> = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t'
  };

  while (i < rawText.length) {
    const ch = rawText[i];
    if (ch === '\\') {
      if (i + 1 >= rawText.length) break;
      const next = rawText[i + 1];
      if (next === 'u' && i + 5 < rawText.length) {
        const hex = rawText.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
      }
      result += escapeMap[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') {
      complete = true;
      break;
    }
    result += ch;
    i += 1;
  }

  return { found: true, value: result, complete };
}

export interface ParsedTranscriptionPayload {
  transcription: string;
  pagesDetected: number | null;
  anomaliesCount: number;
  partialJson: boolean;
  transcriptionMeta?: TranscriptionMeta;
}

export function parseTranscriptionPayload(
  rawText: string,
  provider: string,
  model: string
): ParsedTranscriptionPayload {
  const cleaned = String(rawText || '').trim();
  if (!cleaned) {
    return { transcription: '', pagesDetected: null, anomaliesCount: 0, partialJson: false };
  }

  try {
    const parsed = extractAndParseJson(cleaned, provider, model);
    if (parsed && typeof parsed.transcription === 'string') {
      const errorList = Array.isArray(parsed.genuine_spelling_errors)
        ? parsed.genuine_spelling_errors.filter((x): x is string => typeof x === 'string')
        : Array.isArray(parsed.literal_anomalies)
          ? parsed.literal_anomalies.filter((x): x is string => typeof x === 'string')
          : [];
      const pagesDetected =
        typeof parsed.pages_detected === 'number' ? parsed.pages_detected : null;
      const writerProfile =
        typeof parsed.writer_handwriting_profile === 'string'
          ? parsed.writer_handwriting_profile
          : '';

      const transcriptionMeta: TranscriptionMeta | undefined =
        pagesDetected !== null || writerProfile || errorList.length > 0
          ? {
              pages_detected: pagesDetected ?? 1,
              writer_handwriting_profile: writerProfile,
              genuine_spelling_errors: errorList
            }
          : undefined;

      return {
        transcription: parsed.transcription,
        pagesDetected,
        anomaliesCount: errorList.length,
        partialJson: false,
        transcriptionMeta
      };
    }
  } catch {
    // Fallback to partial JSON or plain text
  }

  if (cleaned.includes('"transcription"') || /^\s*(?:```json\s*)?\{/i.test(cleaned)) {
    const extracted = extractPartialJsonStringField(cleaned, 'transcription');
    if (extracted.found) {
      return {
        transcription: extracted.value,
        pagesDetected: null,
        anomaliesCount: 0,
        partialJson: !extracted.complete
      };
    }
    return { transcription: '', pagesDetected: null, anomaliesCount: 0, partialJson: true };
  }

  return { transcription: cleaned, pagesDetected: null, anomaliesCount: 0, partialJson: false };
}

export function mergeTranscriptionContinuation(
  existingText: string,
  continuationText: string
): string {
  const base = String(existingText || '').trimEnd();
  const cont = String(continuationText || '').trim();
  if (!cont) return base;
  if (!base) return cont;

  const tailTokens = [...base.matchAll(/\S+/g)].slice(-20);
  const headTokens = [...cont.matchAll(/\S+/g)].slice(0, 20);
  const maxOverlap = Math.min(tailTokens.length, headTokens.length);

  let overlapLen = 0;
  for (let k = maxOverlap; k >= 1; k--) {
    let matched = true;
    for (let j = 0; j < k; j++) {
      if (tailTokens[tailTokens.length - k + j][0] !== headTokens[j][0]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      overlapLen = k;
      break;
    }
  }

  let remainder = cont;
  if (overlapLen > 0) {
    const lastOverlap = headTokens[overlapLen - 1];
    remainder = cont.slice((lastOverlap.index ?? 0) + lastOverlap[0].length);
  }

  const trimmedRemainder = remainder.trimStart();
  if (!trimmedRemainder) return base;
  if (/^[.,;:!?]/.test(trimmedRemainder)) {
    return `${base}${trimmedRemainder}`;
  }
  const hasLeadingBreak = remainder.startsWith('\n\n') || cont.startsWith('\n');
  return `${base}${hasLeadingBreak ? '\n\n' : ' '}${trimmedRemainder}`;
}

async function runStructuredHandwritingOcr(
  fileBuffer: Buffer,
  mimeType: string,
  systemPrompt: string,
  jsonSchema: Record<string, unknown>
): Promise<{
  transcription: string;
  transcriptionMeta?: TranscriptionMeta;
  provider: string;
  model: string;
  usage: AiUsageMetrics;
}> {
  const file = buildFilePayload(fileBuffer, mimeType, 'student_handwriting');
  const initialUserPrompt =
    "Calibrate first to THIS writer's handwriting style so messy strokes in normal words are recognized cleanly without creating gibberish non-words, preserve ONLY genuine spelling/capitalisation/punctuation mistakes verbatim, merge sentences seamlessly across page breaks without extra paragraph breaks, omit crossed-out text, and return the complete JSON.";

  const firstCall = await invokeAiModel({
    taskType: 'vision',
    operationName: 'Transcription',
    systemPrompt,
    userPrompt: initialUserPrompt,
    file,
    jsonSchema,
    schemaName: 'submit_transcription',
    temperature: 0.0,
    maxOutputTokens: null
  });

  let aggregatedUsage = firstCall.usage;
  const parsedInitial = parseTranscriptionPayload(firstCall.text, firstCall.provider, firstCall.model);
  if (parsedInitial.pagesDetected !== null) {
    logger.info(
      {
        pagesDetected: parsedInitial.pagesDetected,
        anomaliesCount: parsedInitial.anomaliesCount
      },
      '[AI Gateway] OCR audit completed'
    );
  }

  let currentText = parsedInitial.transcription || '';
  let finishReason = firstCall.finishReason;
  const maxContinuations = 2;

  for (
    let attempt = 1;
    attempt <= maxContinuations &&
    (isLengthTruncated(finishReason) || (parsedInitial.partialJson && !currentText.trim()));
    attempt++
  ) {
    logger.warn(
      { finishReason, chars: currentText.length, attempt, maxContinuations },
      '[AI Gateway] Transcription truncated; triggering continuation recovery'
    );

    const anchorTail = currentText.trim().slice(-240);
    const continuationPrompt = anchorTail
      ? `Your previous transcription was cut off by token length. Output ONLY the remaining verbatim handwritten text from the image starting immediately after this tail (do NOT repeat earlier paragraphs, preserve every misspelling and capitalisation literally, omit crossed-out text, output plain text only — no JSON):\n\n...${anchorTail}`
      : 'Your previous structured OCR output was cut off before emitting text. Output ONLY the complete verbatim handwritten transcription of every page in plain text (no JSON, no autocorrection, omit crossed-out words).';

    const nextCall = await invokeAiModel({
      taskType: 'vision',
      operationName: 'TranscriptionContinuation',
      systemPrompt,
      userPrompt: continuationPrompt,
      file,
      jsonSchema: null,
      temperature: 0.0,
      maxOutputTokens: null
    });

    aggregatedUsage = mergeUsageMetrics(aggregatedUsage, nextCall.usage);
    const cleanedNext = sanitizeTranscription(nextCall.text);
    const merged = anchorTail
      ? mergeTranscriptionContinuation(currentText, cleanedNext)
      : cleanedNext;
    finishReason = nextCall.finishReason;

    if (merged.length <= currentText.length) {
      break;
    }
    currentText = merged;
  }

  if (isLengthTruncated(finishReason)) {
    const providerLabel =
      (PROVIDER_DISPLAY_NAMES as Record<string, string>)[firstCall.provider] || firstCall.provider;
    throw new AiServiceError({
      message: `Handwriting transcription on ${providerLabel} (${firstCall.model}) exceeded the output token limit even after continuation recovery. Increase AI_VISION_MAX_TOKENS or lower reasoning effort in settings/.env.`,
      statusCode: 502,
      code: 'TRANSCRIPTION_TRUNCATED',
      provider: firstCall.provider,
      model: firstCall.model,
      taskType: 'vision'
    });
  }

  return {
    transcription: sanitizeTranscription(currentText),
    transcriptionMeta: parsedInitial.transcriptionMeta,
    provider: firstCall.provider,
    model: firstCall.model,
    usage: aggregatedUsage
  };
}

export async function runDynamicOcr({
  fileBuffer,
  mimeType,
  promptEntry
}: {
  fileBuffer: Buffer;
  mimeType: string;
  promptEntry: PromptEntry;
}): Promise<{
  text: string;
  transcriptionMeta: TranscriptionMeta | null;
  provider: string;
  model: string;
  usage: AiUsageMetrics;
}> {
  const outputSchema =
    promptEntry.outputSchema && typeof promptEntry.outputSchema === 'object'
      ? promptEntry.outputSchema
      : null;
  const schemaProps =
    outputSchema?.properties && typeof outputSchema.properties === 'object'
      ? (outputSchema.properties as Record<string, unknown>)
      : null;

  const isForensicTranscription =
    promptEntry.key === 'transcription_prompt' || Boolean(schemaProps && 'transcription' in schemaProps);

  if (isForensicTranscription) {
    const res = await runStructuredHandwritingOcr(
      fileBuffer,
      mimeType,
      promptEntry.content,
      outputSchema ?? (TRANSCRIPTION_JSON_SCHEMA as unknown as Record<string, unknown>)
    );
    return {
      text: res.transcription,
      transcriptionMeta: res.transcriptionMeta ?? null,
      provider: res.provider,
      model: res.model,
      usage: res.usage
    };
  }

  const file = buildFilePayload(fileBuffer, mimeType, promptEntry.key || 'ocr_document');
  const result = await invokeAiModel({
    taskType: promptEntry.taskType === 'evaluation' ? 'vision' : promptEntry.taskType,
    operationName: `DynamicOcr(${promptEntry.key})`,
    systemPrompt: promptEntry.content,
    userPrompt: 'Extract the complete text from this document accurately as clean plain text.',
    file,
    jsonSchema: outputSchema,
    schemaName: promptEntry.key,
    temperature: 0.0,
    maxOutputTokens: 4096
  });

  const text = outputSchema
    ? result.text
    : result.text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .trim();

  return {
    text,
    transcriptionMeta: null,
    provider: result.provider,
    model: result.model,
    usage: result.usage
  };
}

function toPosInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
}

function resolveMarksLimits(
  explicit?: Partial<MarkingMarksLimits>,
  aiMarks?: Record<string, unknown>
): MarkingMarksLimits {
  const explicitContent = toPosInt(explicit?.contentMax);
  const explicitLang = toPosInt(explicit?.languageMax);
  const explicitTotal = toPosInt(explicit?.totalMax);

  if (explicitContent !== null && explicitLang !== null) {
    return {
      contentMax: explicitContent,
      languageMax: explicitLang,
      totalMax: explicitTotal ?? explicitContent + explicitLang
    };
  }

  if (explicitTotal !== null && explicitTotal !== 23) {
    const aiContentMax = toPosInt(aiMarks?.content_max);
    const aiLangMax = toPosInt(aiMarks?.language_max);
    if (aiContentMax !== null && aiLangMax !== null && aiContentMax + aiLangMax === explicitTotal) {
      return {
        contentMax: aiContentMax,
        languageMax: aiLangMax,
        totalMax: explicitTotal
      };
    }

    const half = Math.floor(explicitTotal / 2);
    return {
      contentMax: half,
      languageMax: explicitTotal - half,
      totalMax: explicitTotal
    };
  }

  return {
    contentMax: 8,
    languageMax: 15,
    totalMax: 23
  };
}

function normalizeMarks(
  marks: Record<string, unknown>,
  limits: MarkingMarksLimits = { contentMax: 8, languageMax: 15, totalMax: 23 }
): MarkingReport['marks'] {
  const content = Math.max(0, Math.min(limits.contentMax, Math.round(Number(marks.content) || 0)));
  const language = Math.max(0, Math.min(limits.languageMax, Math.round(Number(marks.language) || 0)));
  const rawTotal = Number(marks.total);
  const total = Math.max(
    0,
    Math.min(
      limits.totalMax,
      Number.isFinite(rawTotal) ? Math.round(rawTotal) : content + language
    )
  );

  return {
    content,
    content_max: limits.contentMax,
    language,
    language_max: limits.languageMax,
    total,
    total_max: limits.totalMax
  };
}

function stripHtmlTags(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countPlainWords(text: string): number {
  const plain = stripHtmlTags(text);
  return plain ? plain.split(/\s+/).filter(Boolean).length : 0;
}

export function normalizeCorrectedHtml(rawHtml: string, fallbackText = ''): string {
  let corrected = String(rawHtml || fallbackText || '').trim();
  corrected = corrected.replace(
    /<mark\s+[^>]*class=["']?(?:suggestion|addition)["']?[^>]*>([\s\S]*?)<\/mark>/gi,
    '<ins>$1</ins>'
  );
  corrected = corrected.replace(/<suggest(?:\s+[^>]*)?>([\s\S]*?)<\/suggest>/gi, '<ins>$1</ins>');
  corrected = corrected.replace(/<ins(?:\s+[^>]*)?>/gi, '<ins>');
  corrected = corrected.replace(/<mark(?:\s+[^>]*)?>/gi, '<mark class="correction">');
  corrected = corrected.replace(
    /<mark[^>]*>([A-Za-z])<\/mark>([A-Za-z0-9_]+)/g,
    '<mark class="correction">$1$2</mark>'
  );
  corrected = corrected.replace(
    /([A-Za-z0-9_]+)<mark[^>]*>([A-Za-z0-9_]+)<\/mark>/g,
    '<mark class="correction">$1$2</mark>'
  );
  corrected = corrected.replace(
    /<ins[^>]*>([A-Za-z])<\/ins>([A-Za-z0-9_]+)/g,
    '<ins>$1$2</ins>'
  );
  corrected = corrected.replace(
    /([A-Za-z0-9_]+)<ins[^>]*>([A-Za-z0-9_]+)<\/ins>/g,
    '<ins>$1$2</ins>'
  );
  return corrected;
}

export function isCorrectedVersionTruncated(studentText: string, correctedHtml: string): boolean {
  const plain = stripHtmlTags(correctedHtml);
  if (!plain) return true;

  const origWords = countPlainWords(studentText);
  const corrWords = countPlainWords(plain);

  if (origWords >= 20) {
    if (corrWords < Math.floor(origWords * 0.78)) {
      return true;
    }
    const endsWithPunctuation = /[.!?]["'”’)\]]*$/.test(plain);
    if (!endsWithPunctuation && corrWords < Math.floor(origWords * 0.95)) {
      return true;
    }
  } else if (origWords >= 5 && corrWords < Math.floor(origWords * 0.5)) {
    return true;
  }

  return false;
}

async function recoverCompleteCorrectedVersion(
  studentText: string,
  errors: Array<{ original?: string; correction?: string }> = []
): Promise<{ text: string; usage: AiUsageMetrics }> {
  const errorsSummary =
    Array.isArray(errors) && errors.length
      ? errors.map((e) => `- "${e.original ?? ''}" -> "${e.correction ?? ''}"`).join('\n')
      : 'Fix all spelling, grammar, capitalisation, punctuation, and awkward phrasing slips.';

  const recoverySystemPrompt = `You are an expert English assessment copy-editor.
Output ONLY the COMPLETE corrected version of the student's entire submission from the very first word to the very last concluding sentence.
Rules:
1. Cover 100% of the student's paragraphs and sentences without cutting off or summarizing.
2. Wrap every corrected word or phrase in plain <mark>word</mark> tags (no class attribute, always wrap whole words, never single letters).
3. Output ONLY the corrected HTML/text response itself—no JSON, no markdown code blocks, and no intro or outro commentary.`;

  const recoveryUserPrompt = `ORIGINAL STUDENT DRAFT:\n${studentText}\n\nERRORS IDENTIFIED:\n${errorsSummary}\n\nWrite the complete corrected version from start to finish:`;

  const result = await invokeAiModel({
    taskType: 'evaluation',
    operationName: 'CorrectedVersionRecovery',
    systemPrompt: recoverySystemPrompt,
    userPrompt: recoveryUserPrompt,
    jsonSchema: null,
    temperature: 0.0,
    maxOutputTokens: 4096
  });

  const cleaned = String(result.text || '')
    .replace(/^```(?:html|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return {
    text: normalizeCorrectedHtml(cleaned),
    usage: result.usage
  };
}

export interface EvaluateAssessmentParams {
  studentName?: string;
  taskPrompt: string;
  studentText: string;
  systemPrompts?: string[];
  markingSchema?: Record<string, unknown>;
  marksLimits?: Partial<MarkingMarksLimits>;
  files?: AiFilePayload[];
}

export interface EvaluateAssessmentResult {
  report: MarkingReport;
  provider: string;
  model: string;
  usage: AiUsageMetrics;
}

export async function evaluateAssessment({
  studentName,
  taskPrompt,
  studentText,
  systemPrompts,
  markingSchema,
  marksLimits,
  files
}: EvaluateAssessmentParams): Promise<EvaluateAssessmentResult> {
  const hasFiles = Boolean(files && files.length > 0);
  if ((!taskPrompt?.trim() && !hasFiles) || !studentText) {
    throw new HttpError(
      400,
      'Student text and either a task prompt or attached media are required.',
      'VALIDATION_ERROR'
    );
  }

  const validPrompts = Array.isArray(systemPrompts)
    ? systemPrompts.map((p) => p.trim()).filter((p) => p.length > 0)
    : [];

  if (validPrompts.length === 0) {
    throw new HttpError(
      400,
      'No evaluation prompt is configured for this exercise. Configure an evaluation prompt in Admin Studio -> Global Prompt Manager.',
      'MISSING_EVALUATION_PROMPT'
    );
  }

  const effectiveTaskPrompt =
    taskPrompt.trim() ||
    '(Visual/document stimulus attached for reference — evaluate the student response directly against the attached media according to the rubric.)';

  const userMessage = `
STUDENT FIRST NAME: ${studentName || 'Student'}
TASK PROMPT:
${effectiveTaskPrompt}

STUDENT SUBMITTED DRAFT:
${studentText}

CRITICAL REQUIREMENT FOR 'corrected_version':
Rewrite and polish the student's submission from start to finish. You MUST NOT cut off, shorten, or stop early. Every single paragraph and sentence down to the closing line must be included in 'corrected_version', using <mark>...</mark> tags for error corrections and <ins>...</ins> tags for optional suggested enhancements if specified by the prompt.

OUTPUT REQUIREMENT:
Return strictly valid JSON with keys: marks, justification, errors, content_feedback, corrected_version.
`;

  const fullSystemInstruction = validPrompts.join('\n\n');

  const preLimits = resolveMarksLimits(marksLimits);
  const hasNonDefaultLimits =
    preLimits.contentMax !== 8 || preLimits.languageMax !== 15 || preLimits.totalMax !== 23;

  const resolvedSchema =
    !markingSchema || (isLegacyEx4MarkingSchema(markingSchema) && hasNonDefaultLimits)
      ? hasNonDefaultLimits
        ? buildMarkingJsonSchema(preLimits)
        : (MARKING_JSON_SCHEMA as unknown as Record<string, unknown>)
      : markingSchema;

  const initialResult = await invokeAiModel({
    taskType: 'evaluation',
    operationName: 'AssessmentEvaluation',
    systemPrompt: fullSystemInstruction,
    userPrompt: userMessage,
    ...(hasFiles && files ? { files } : {}),
    jsonSchema: resolvedSchema,
    schemaName: 'submit_marking_report',
    temperature: 0.0,
    maxOutputTokens: null
  });

  let aggregatedUsage = initialResult.usage;
  const parsed = extractAndParseJson(initialResult.text, initialResult.provider, initialResult.model);

  const aiMarksObj =
    parsed.marks && typeof parsed.marks === 'object' && !Array.isArray(parsed.marks)
      ? (parsed.marks as Record<string, unknown>)
      : {};
  const resolvedLimits = resolveMarksLimits(marksLimits, aiMarksObj);
  const normalizedMarks = normalizeMarks(aiMarksObj, resolvedLimits);

  const rawJust =
    parsed.justification && typeof parsed.justification === 'object' && !Array.isArray(parsed.justification)
      ? (parsed.justification as Record<string, unknown>)
      : {};
  const justification = {
    content: typeof rawJust.content === 'string' ? rawJust.content : '',
    language: typeof rawJust.language === 'string' ? rawJust.language : ''
  };

  const errors = Array.isArray(parsed.errors)
    ? parsed.errors.map((item) => {
        const e = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          original: String(e.original ?? ''),
          correction: String(e.correction ?? ''),
          category: String(e.category ?? 'Grammar'),
          explanation: String(e.explanation ?? '')
        };
      })
    : [];

  const contentFeedback = Array.isArray(parsed.content_feedback)
    ? parsed.content_feedback.map((item) => String(item ?? ''))
    : [];

  let corrected = normalizeCorrectedHtml(
    typeof parsed.corrected_version === 'string' ? parsed.corrected_version : '',
    studentText
  );

  if (isCorrectedVersionTruncated(studentText, corrected)) {
    const origWords = countPlainWords(studentText);
    const currWords = countPlainWords(corrected);
    logger.warn(
      { currWords, origWords },
      "[AI Gateway] Truncated 'corrected_version' detected; triggering plain-text completion recovery"
    );

    try {
      const recovered = await recoverCompleteCorrectedVersion(studentText, errors);
      aggregatedUsage = mergeUsageMetrics(aggregatedUsage, recovered.usage);
      if (countPlainWords(recovered.text) > currWords) {
        corrected = recovered.text;
        logger.info(
          { recoveredWords: countPlainWords(corrected), origWords },
          '[AI Gateway] Plain-text recovery succeeded'
        );
      }
    } catch (recErr) {
      if (recErr instanceof AiServiceError && recErr.isQuotaError) {
        throw recErr;
      }
      const msg = recErr instanceof Error ? recErr.message : String(recErr);
      logger.warn(
        { error: msg },
        '[AI Gateway] Corrected version recovery failed, keeping best partial output'
      );
    }
  }

  let report: MarkingReport;
  try {
    report = createMarkingReportSchema(resolvedLimits).parse({
      marks: normalizedMarks,
      justification,
      errors,
      content_feedback: contentFeedback,
      corrected_version: corrected
    });
  } catch (err) {
    const providerLabel =
      (PROVIDER_DISPLAY_NAMES as Record<string, string>)[initialResult.provider] ||
      initialResult.provider;
    throw new AiServiceError({
      message: `Invalid marking report schema returned by ${providerLabel} (${initialResult.model}).`,
      statusCode: 502,
      code: 'INVALID_AI_SCHEMA',
      provider: initialResult.provider,
      model: initialResult.model,
      taskType: 'evaluation',
      cause: err
    });
  }

  return {
    report,
    provider: initialResult.provider,
    model: initialResult.model,
    usage: aggregatedUsage
  };
}
