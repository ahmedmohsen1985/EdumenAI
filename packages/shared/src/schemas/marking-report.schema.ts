import { z } from 'zod';

/**
 * Unified Standard JSON Schema for Exercise 4 Marking Reports.
 * Compatible with OpenAI strict json_schema, Anthropic tool input_schema,
 * OpenRouter, and Gemini.
 *
 * NOTE: This Zod contract is a verbatim translation of the golden JSON schema
 * used by the Exercise 4 POC. Do not alter field names, types, or semantics.
 */

export const MarksSchema = z.object({
  content: z
    .number()
    .int()
    .min(0)
    .max(8)
    .describe('Content & Communication mark out of 8'),
  content_max: z.number().int().describe('Always 8'),
  language: z
    .number()
    .int()
    .min(0)
    .max(15)
    .describe('Language mark out of 15'),
  language_max: z.number().int().describe('Always 15'),
  total: z.number().int().min(0).max(23).describe('Total mark out of 23'),
  total_max: z.number().int().describe('Always 23')
});

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

export type Marks = z.infer<typeof MarksSchema>;
export type Justification = z.infer<typeof JustificationSchema>;
export type ErrorItem = z.infer<typeof ErrorItemSchema>;
export type MarkingReport = z.infer<typeof MarkingReportSchema>;
