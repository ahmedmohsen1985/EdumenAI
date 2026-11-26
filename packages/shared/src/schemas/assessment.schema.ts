import { z } from 'zod';
import { IntegrityLogSchema } from './credits.schema.js';
import { MarkingReportSchema } from './marking-report.schema.js';
import { TranscriptionSchema } from './transcription.schema.js';

/**
 * Unified Assessment API request/response contracts.
 * These schemas define the public REST boundary between the Next.js frontend
 * and the Express backend.
 */

export const TranscriptionMetaSchema = TranscriptionSchema.omit({ transcription: true });

export const StudentInfoSchema = z.object({
  name: z.string().min(1),
  telegram: z.string().optional(),
  school: z.string().optional(),
  className: z.string().optional()
});

export const ExtractTaskResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    taskQuestion: z.string(),
    mimeType: z.string()
  })
});

export const TranscribeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    transcription: z.string(),
    mimeType: z.string(),
    transcriptionMeta: TranscriptionMetaSchema.optional()
  })
});

export const MediaAttachmentSchema = z.object({
  dataUrl: z.string().min(10).max(8_000_000).optional(),
  mimeType: z.string().min(3).max(120),
  fileName: z.string().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().optional(),
  source: z.enum(['preset', 'student']).default('student'),
  presetBlockId: z.string().optional(),
  omittedFromStorage: z.boolean().optional()
});
export type MediaAttachment = z.infer<typeof MediaAttachmentSchema>;

export const EvaluateRequestSchema = z
  .object({
    student: StudentInfoSchema,
    taskPrompt: z.string().optional().default(''),
    rawText: z.string().optional(),
    finalText: z.string().min(1),
    transcriptionMeta: TranscriptionMetaSchema.optional(),
    versionId: z.string().optional(),
    isPreview: z.boolean().optional(),
    formData: z.record(z.unknown()).optional(),
    promptKeys: z.array(z.string()).optional(),
    telegramTargetIds: z.array(z.string()).optional(),
    instructorId: z.string().min(1).nullable().optional(),
    integrityLog: IntegrityLogSchema.optional(),
    mediaAttachments: z.array(MediaAttachmentSchema).max(4).optional()
  })
  .superRefine((val, ctx) => {
    if (
      !val.taskPrompt?.trim() &&
      (!val.mediaAttachments || val.mediaAttachments.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either a task prompt or an attached media stimulus is required for evaluation.',
        path: ['taskPrompt']
      });
    }
  });

export const EvaluateResponseSchema = z.object({
  success: z.literal(true),
  data: MarkingReportSchema
});

export const EvaluatePersistedResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    reportId: z.string(),
    submissionId: z.string(),
    isPreview: z.boolean(),
    report: MarkingReportSchema,
    provider: z.string(),
    model: z.string(),
    usage: z.object({
      promptTokens: z.number().int().nullable(),
      completionTokens: z.number().int().nullable(),
      totalTokens: z.number().int().nullable(),
      latencyMs: z.number().int().nullable()
    })
  })
});

export const PersistedReportSchema = z.object({
  id: z.string(),
  submissionId: z.string(),
  studentId: z.string().nullable().optional(),
  instructorId: z.string().nullable().optional(),
  instructorName: z.string().nullable().optional(),
  exerciseOwnerId: z.string().nullable().optional(),
  exerciseCode: z.string(),
  exerciseTitle: z.string().optional(),
  promptVersion: z.number().int(),
  studentName: z.string(),
  studentClass: z.string().nullable(),
  studentSchool: z.string().nullable(),
  taskPrompt: z.string(),
  rawText: z.string().nullable(),
  finalText: z.string(),
  transcriptionMeta: z.record(z.unknown()).nullable(),
  isPreview: z.boolean().optional(),
  formData: z.record(z.unknown()).nullable().optional(),
  integrityLog: IntegrityLogSchema.nullable().optional(),
  mediaAttachments: z.array(MediaAttachmentSchema).nullable().optional(),
  marks: MarkingReportSchema.shape.marks,
  justification: MarkingReportSchema.shape.justification,
  errors: MarkingReportSchema.shape.errors,
  contentFeedback: z.array(z.string()),
  correctedVersion: z.string(),
  provider: z.string(),
  model: z.string(),
  promptTokens: z.number().int().nullable(),
  completionTokens: z.number().int().nullable(),
  totalTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  createdAt: z.string().datetime()
});

export const ListReportsResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(PersistedReportSchema),
    total: z.number().int()
  })
});

export type TranscriptionMeta = z.infer<typeof TranscriptionMetaSchema>;
export type StudentInfo = z.infer<typeof StudentInfoSchema>;
export type ExtractTaskResponse = z.infer<typeof ExtractTaskResponseSchema>;
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>;
export type EvaluatePersistedResponse = z.infer<typeof EvaluatePersistedResponseSchema>;
export type PersistedReport = z.infer<typeof PersistedReportSchema>;
export type ListReportsResponse = z.infer<typeof ListReportsResponseSchema>;
