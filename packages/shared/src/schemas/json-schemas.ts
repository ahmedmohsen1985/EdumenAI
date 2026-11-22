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
      description: "Full, complete polished student text covering 100% of the student draft from the first word to the very last concluding sentence without cutting off or stopping early. Highlight corrections using plain <mark>word</mark> tags (no class attribute or quotes). Never tag single letters."
    }
  },
  required: ['marks', 'justification', 'errors', 'content_feedback', 'corrected_version']
} as const;

/**
 * Unified Structured JSON Schema for Calibrated Two-Step Forensic OCR Transcription.
 * Calibrates to the student's handwriting style before auditing genuine errors to avoid both autocorrect and phantom gibberish.
 */
export const TRANSCRIPTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pages_detected: {
      type: 'integer',
      description: 'Total count of handwritten exam pages visible in the uploaded file.'
    },
    writer_handwriting_profile: {
      type: 'string',
      description: 'Brief calibration note describing THIS writer\'s penmanship quirks observed in unambiguous words (e.g. short ascender stems, narrow closed loops, fast cursive ligatures) so messy strokes are decoded as their intended letters.'
    },
    genuine_spelling_errors: {
      type: 'array',
      items: { type: 'string' },
      description: 'ONLY unmistakable genuine spelling errors (clearly extra/doubled letters, omitted letters, wrong vowels) and unexpected mid-sentence capitals actually written by the student; never invent errors from messy cursive letterforms.'
    },
    transcription: {
      type: 'string',
      description: 'Complete verbatim transcription across all pages, merging continuing sentences smoothly across page breaks, keeping genuine errors while decoding messy penmanship accurately and omitting crossed-out text.'
    }
  },
  required: ['pages_detected', 'writer_handwriting_profile', 'genuine_spelling_errors', 'transcription']
} as const;
