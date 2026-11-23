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

export const EX4_TASK_EXTRACTION_PROMPT = `You are an Oxford AQA IGCSE ESL examination assistant.
Extract the EXACT and COMPLETE Exercise 4 exam question text from this exam paper image or PDF.

Include:
- Any context / scenario (e.g., 'You see this announcement in your school magazine...', 'You have had a class discussion about...')
- The article topic or headline (e.g., 'Articles wanted: Social media in modern life')
- The core question/prompt (e.g., 'Have we become too dependent on social media? Write an article giving your views.')
- Any bullet points, notes, or prompts to include
- The word count guideline if present (e.g., 'Write your article in about 100-150 words.')

Rules:
1. Output ONLY the clean question text in clear English.
2. Maintain paragraph breaks and bullet points (using plain '-' for bullets).
3. Do NOT use Markdown formatting such as **bold**, *italic*, ## headings, or backticks.
4. Do NOT include page numbers, exam barcodes, candidate numbers, or center headers.
5. Do NOT answer the question. Only extract the question itself.`;

export const DEFAULT_EX4_TEMPLATE: TemplateConfig = TemplateSchema.parse({
  schemaVersion: 1,
  settings: {
    showHeaderBadges: true,
    badges: ['Article', '23 Marks', 'AI Marker'],
    submitRedirectMode: 'report_page'
  },
  blocks: [
    {
      id: 'ex4_student_name',
      type: 'input',
      fieldKey: 'student_name',
      label: 'Full Name',
      section: 'Student Identity',
      order: 0,
      width: 'half',
      required: true,
      props: {
        placeholder: 'e.g. Ahmed Hassan'
      }
    },
    {
      id: 'ex4_student_class',
      type: 'dropdown',
      fieldKey: 'student_class',
      label: 'Class / Group',
      section: 'Student Identity',
      order: 1,
      width: 'half',
      required: false,
      props: {
        placeholder: '-- Select your class --',
        options: [
          'Capital',
          'Capital Lotus',
          'MES',
          "MANARET AL'EMAN",
          'AMGAD',
          'SUMMITS',
          'IMPERIAL',
          'BRS',
          'OXFORD G 1',
          'OXFORD G 2 (ONLINE)'
        ]
      }
    },
    {
      id: 'ex4_task_ocr',
      type: 'file_upload_ocr',
      fieldKey: 'task_question',
      label: 'Upload Your Task Question',
      section: 'Step 1: Task Question',
      order: 2,
      width: 'full',
      required: true,
      props: {
        description:
          'Upload the Exercise 4 question image or PDF. You can edit the extracted question if needed.',
        accept: ['image/*', 'application/pdf'],
        maxSizeMb: 15,
        locked: false,
        allowManualEdit: true,
        extractButtonLabel: 'Extract Task Question'
      },
      bindings: {
        promptKey: 'task_extraction_prompt'
      }
    },
    {
      id: 'ex4_answer_ocr',
      type: 'file_upload_ocr',
      fieldKey: 'student_article',
      label: 'Submit Your Handwritten Article',
      section: 'Step 2: Submit Your Article',
      order: 3,
      width: 'full',
      required: true,
      props: {
        description: 'Upload your handwritten article (Image or PDF) for verbatim transcription.',
        accept: ['image/*', 'application/pdf'],
        maxSizeMb: 15,
        locked: true,
        allowManualEdit: false,
        extractButtonLabel: 'Transcribe Handwriting',
        lockedNotice:
          'Directly extracted character-by-character from your handwriting. Editing is locked to preserve authentic Oxford AQA exam scoring.'
      },
      bindings: {
        promptKey: 'transcription_prompt'
      }
    },
    {
      id: 'ex4_eval_config',
      type: 'examiner_evaluation',
      label: 'Oxford AQA Exercise 4 Examiner',
      section: 'Evaluation & Feedback',
      order: 4,
      width: 'full',
      required: false,
      props: {
        reportTitle: 'EdumenAI - Exercise 4 Report',
        totalMarks: 23,
        contentMax: 8,
        languageMax: 15
      },
      bindings: {
        promptKeys: ['marking_protocol', 'rubric_and_anchors'],
        inputFieldMap: {
          studentName: 'student_name',
          studentClass: 'student_class',
          taskPrompt: 'task_question',
          studentText: 'student_article'
        },
        enablePdfDownload: true,
        enableTelegramSend: true
      }
    },
    {
      id: 'ex4_submit_btn',
      type: 'action_button',
      label: 'Get Examiner Feedback',
      section: 'Evaluation & Feedback',
      order: 5,
      width: 'full',
      required: false,
      props: {
        variant: 'primary',
        action: 'run_evaluation',
        loadingLabel: 'AI Examiner Marking Your Article...'
      },
      bindings: {
        targetActionBlockId: 'ex4_eval_config'
      }
    }
  ]
});
