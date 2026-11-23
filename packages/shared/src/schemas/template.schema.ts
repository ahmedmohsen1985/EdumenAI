import { z } from 'zod';

export const ExerciseSkillSchema = z.enum(['WRITING', 'READING', 'LISTENING', 'SPEAKING']);
export const VersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const AiTaskTypeSchema = z.enum(['vision', 'evaluation', 'audio']);

export const BUILT_IN_BLOCK_TYPES = [
  'input',
  'dropdown',
  'textarea',
  'richtext',
  'file_upload_ocr',
  'action_button',
  'examiner_evaluation'
] as const;

export const BuiltInBlockTypeSchema = z.enum(BUILT_IN_BLOCK_TYPES);

export const PromptEntrySchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  description: z.string().optional(),
  taskType: AiTaskTypeSchema,
  content: z.string().min(1),
  outputSchema: z.record(z.unknown()).nullable().optional()
});

export const TemplateBlockBindingsSchema = z.object({
  promptKey: z.string().optional(),
  promptKeys: z.array(z.string()).optional(),
  inputFieldMap: z.record(z.string()).optional(),
  targetActionBlockId: z.string().optional(),
  telegramTargetIds: z.array(z.string()).optional(),
  enablePdfDownload: z.boolean().optional(),
  enableTelegramSend: z.boolean().optional()
});

export const TemplateBlockSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1), // open string so external/future Lego plugins register without schema changes
  fieldKey: z.string().regex(/^[a-z0-9_]+$/).optional(),
  label: z.string().optional(),
  section: z.string().optional(),
  order: z.number().int().min(0),
  width: z.enum(['full', 'half']).default('full'),
  required: z.boolean().default(false),
  props: z.record(z.unknown()).default({}),
  bindings: TemplateBlockBindingsSchema.optional()
});

export const TemplateSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  settings: z
    .object({
      showHeaderBadges: z.boolean().default(true),
      badges: z.array(z.string()).default([]),
      submitRedirectMode: z.enum(['report_page', 'inline']).default('report_page')
    })
    .default({}),
  blocks: z.array(TemplateBlockSchema)
});

export type ExerciseSkill = z.infer<typeof ExerciseSkillSchema>;
export type VersionStatus = z.infer<typeof VersionStatusSchema>;
export type AiTaskType = z.infer<typeof AiTaskTypeSchema>;
export type BuiltInBlockType = z.infer<typeof BuiltInBlockTypeSchema>;
export type PromptEntry = z.infer<typeof PromptEntrySchema>;
export type TemplateBlockBindings = z.infer<typeof TemplateBlockBindingsSchema>;
export type TemplateBlock = z.infer<typeof TemplateBlockSchema>;
export type TemplateConfig = z.infer<typeof TemplateSchema>;

export const DEFAULT_TASK_EXTRACTION_PROMPT = `You are an Oxford AQA IGCSE ESL examination assistant.
Extract the EXACT and COMPLETE exam question text from this exam paper image or PDF.

Include:
- Any context or scenario provided in the prompt
- Any topic, headline, or sub-questions
- Any bullet points, notes, or guiding instructions
- Any word count guideline if present

Rules:
1. Output ONLY the clean question text in clear English.
2. Maintain paragraph breaks and bullet points (using plain '-' for bullets).
3. Do NOT use Markdown formatting such as **bold**, *italic*, ## headings, or backticks.
4. Do NOT include page numbers, exam barcodes, candidate numbers, or center headers.
5. Do NOT answer the question. Only extract the question itself.`;
