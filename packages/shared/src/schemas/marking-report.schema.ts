import { z } from 'zod';
import type { MarkingMarksLimits } from './json-schemas.js';

/**
 * Unified Standard JSON Schema for Assessment Marking Reports.
 * Compatible with OpenAI strict json_schema, Anthropic tool input_schema,
 * OpenRouter, and Gemini.
 */

export const MarksSchema = z
  .object({
    content: z.number().int().min(0).describe('Content & Communication mark'),
    content_max: z.number().int().positive().describe('Maximum Content & Communication mark'),
    language: z.number().int().min(0).describe('Language mark'),
    language_max: z.number().int().positive().describe('Maximum Language mark'),
    total: z.number().int().min(0).describe('Total mark'),
    total_max: z.number().int().positive().describe('Maximum total mark')
  })
  .refine(
    (m) => m.content <= m.content_max && m.language <= m.language_max && m.total <= m.total_max,
    {
      message: 'Awarded marks cannot exceed maximum marks.'
    }
  );

export const JustificationSchema = z.object({
  content: z
    .string()
    .describe('Single decisive reason for Content mark'),
  language: z
    .string()
    .describe('Single decisive reason for Language mark')
});

export const ErrorItemSchema = z.object({
  original: z
    .string()
    .describe('Original student text containing the error'),
  correction: z.string().describe('Corrected version of the error'),
  category: z
    .string()
    .describe('Error type (Preposition, Punctuation, Grammar, etc.)'),
  explanation: z
    .string()
    .describe("Simple A2-B1 explanation using the student's own example")
});

export const MarkingReportSchema = z.object({
  marks: MarksSchema,
  justification: JustificationSchema,
  errors: z.array(ErrorItemSchema),
  content_feedback: z
    .array(z.string())
    .describe('Bullet points detailing points covered and expandable points'),
  corrected_version: z
    .string()
    .describe(
      "Full, complete polished student text covering 100% of the student draft from the first word to the very last concluding sentence without cutting off or stopping early. Highlight corrections using plain <mark>word</mark> tags (no class attribute or quotes). Never tag single letters."
    )
});

export function createMarkingReportSchema(limits: MarkingMarksLimits) {
  return z.object({
    marks: z.object({
      content: z.number().int().min(0).max(limits.contentMax),
      content_max: z.literal(limits.contentMax),
      language: z.number().int().min(0).max(limits.languageMax),
      language_max: z.literal(limits.languageMax),
      total: z.number().int().min(0).max(limits.totalMax),
      total_max: z.literal(limits.totalMax)
    }),
    justification: JustificationSchema,
    errors: z.array(ErrorItemSchema),
    content_feedback: z.array(z.string()),
    corrected_version: z.string()
  });
}

export type Marks = z.infer<typeof MarksSchema>;
export type Justification = z.infer<typeof JustificationSchema>;
export type ErrorItem = z.infer<typeof ErrorItemSchema>;
export type MarkingReport = z.infer<typeof MarkingReportSchema>;
