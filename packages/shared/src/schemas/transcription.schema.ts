import { z } from 'zod';

/**
 * Unified Structured JSON Schema for Calibrated Two-Step Forensic OCR Transcription.
 * Calibrates to the student's handwriting style before auditing genuine errors to
 * avoid both autocorrect and phantom gibberish.
 *
 * NOTE: This Zod contract is a verbatim translation of the golden JSON schema
 * used by the Exercise 4 POC. Do not alter field names, types, or semantics.
 */

export const TranscriptionSchema = z.object({
  pages_detected: z
    .number()
    .int()
    .describe('Total count of handwritten exam pages visible in the uploaded file.'),
  writer_handwriting_profile: z
    .string()
    .describe(
      "Brief calibration note describing THIS writer's penmanship quirks observed in unambiguous words (e.g. short ascender stems, narrow closed loops, fast cursive ligatures) so messy strokes are decoded as their intended letters."
    ),
  genuine_spelling_errors: z
    .array(z.string())
    .describe(
      "ONLY unmistakable genuine spelling errors (clearly extra/doubled letters, omitted letters, wrong vowels) and unexpected mid-sentence capitals actually written by the student; never invent errors from messy cursive letterforms."
    ),
  transcription: z
    .string()
    .describe(
      'Complete verbatim transcription across all pages, merging continuing sentences smoothly across page breaks, keeping genuine errors while decoding messy penmanship accurately and omitting crossed-out text.'
    )
});

export type TranscriptionPayload = z.infer<typeof TranscriptionSchema>;
