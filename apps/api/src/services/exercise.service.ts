import { Prisma, type Exercise, type PromptVersion } from '@prisma/client';
import { z } from 'zod';
import {
  DEFAULT_EX4_TEMPLATE,
  EX4_TASK_EXTRACTION_PROMPT,
  ExerciseSkillSchema,
  MARKING_JSON_SCHEMA,
  PromptEntrySchema,
  TemplateSchema,
  type ExerciseSkill,
  type PromptEntry,
  type TemplateConfig
} from '@edumenai/shared';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';

export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, message: string, code = 'HTTP_ERROR') {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface PublishedExerciseSummary {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: string | null;
  };
}

export interface PublicPromptMeta {
  key: string;
  label: string;
  description?: string;
  taskType: PromptEntry['taskType'];
}

export interface PublishedExerciseDetail {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: string | null;
  };
  templateSchema: TemplateConfig;
  promptMeta: PublicPromptMeta[];
}

export interface ResolvedExecutionContext {
  exercise: Exercise;
  version: PromptVersion;
  promptEntries: PromptEntry[];
  templateSchema: TemplateConfig;
}

export interface AdminExerciseSummary {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  versionCount: number;
  activeVersion: {
    id: string;
    version: number;
    publishedAt: string | null;
  } | null;
  latestDraft: {
    id: string;
    version: number;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromptVersionView {
  id: string;
  version: number;
  status: PromptVersion['status'];
  isActive: boolean;
  templateSchema: TemplateConfig;
  promptEntries: PromptEntry[];
  markingSchema: Record<string, unknown>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminExerciseDetail {
  id: string;
  code: string;
  skill: ExerciseSkill;
  title: string;
  description: string | null;
  totalMarks: number;
  createdAt: string;
  updatedAt: string;
  versions: AdminPromptVersionView[];
}

export const CreateExerciseAdminSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Exercise code must be a lowercase slug (a-z, 0-9, -).'),
  skill: ExerciseSkillSchema.default('WRITING'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  totalMarks: z.number().int().positive().max(500).default(23)
});

export type CreateExerciseAdminInput = z.infer<typeof CreateExerciseAdminSchema>;

export const SaveExerciseDraftAdminSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  skill: ExerciseSkillSchema.optional(),
  totalMarks: z.number().int().positive().max(500).optional(),
  templateSchema: TemplateSchema.optional(),
  promptEntries: z.array(PromptEntrySchema).optional(),
  markingSchema: z.record(z.unknown()).optional()
});

export type SaveExerciseDraftAdminInput = z.infer<typeof SaveExerciseDraftAdminSchema>;

function parseTemplateSchema(raw: Prisma.JsonValue | null, code: string): TemplateConfig {
  if (raw !== null && raw !== undefined) {
    const parsed = TemplateSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
  }
  if (code === 'ex4') {
    return DEFAULT_EX4_TEMPLATE;
  }
  return TemplateSchema.parse({
    schemaVersion: 1,
    settings: {
      showHeaderBadges: true,
      badges: [],
      submitRedirectMode: 'report_page'
    },
    blocks: []
  });
}

function parsePromptEntries(version: PromptVersion): PromptEntry[] {
  if (Array.isArray(version.promptEntries)) {
    const parsed = z.array(PromptEntrySchema).safeParse(version.promptEntries);
    if (parsed.success) {
      return parsed.data;
    }
  }

  // Fallback synthesis from legacy PromptVersion columns
  const entries: PromptEntry[] = [];
  entries.push({
    key: 'task_extraction_prompt',
    label: 'Task Question OCR Prompt',
    taskType: 'vision',
    content: EX4_TASK_EXTRACTION_PROMPT,
    outputSchema: null
  });
  if (version.transcriptionPrompt) {
    entries.push({
      key: 'transcription_prompt',
      label: 'Handwriting OCR Prompt',
      taskType: 'vision',
      content: version.transcriptionPrompt,
      outputSchema: null
    });
  }
  if (version.evaluationPrompt) {
    entries.push({
      key: 'marking_protocol',
      label: 'Core Marking Protocol',
      taskType: 'evaluation',
      content: version.evaluationPrompt,
      outputSchema:
        version.markingSchema && typeof version.markingSchema === 'object' && !Array.isArray(version.markingSchema)
          ? (version.markingSchema as Record<string, unknown>)
          : null
    });
  }
  if (version.rubricPrompt) {
    entries.push({
      key: 'rubric_and_anchors',
      label: 'Rubric & Anchors',
      taskType: 'evaluation',
      content: version.rubricPrompt,
      outputSchema: null
    });
  }
  return entries;
}

function mapAdminVersion(version: PromptVersion, code: string): AdminPromptVersionView {
  const markingSchema =
    version.markingSchema && typeof version.markingSchema === 'object' && !Array.isArray(version.markingSchema)
      ? (version.markingSchema as Record<string, unknown>)
      : (MARKING_JSON_SCHEMA as unknown as Record<string, unknown>);

  return {
    id: version.id,
    version: version.version,
    status: version.status,
    isActive: version.isActive,
    templateSchema: parseTemplateSchema(version.templateSchema, code),
    promptEntries: parsePromptEntries(version),
    markingSchema,
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}

function buildDefaultTemplateForNewExercise(title: string, totalMarks: number): TemplateConfig {
  return TemplateSchema.parse({
    schemaVersion: 1,
    settings: {
      showHeaderBadges: true,
      badges: [title, `${totalMarks} Marks`, 'AI Marker'],
      submitRedirectMode: 'report_page'
    },
    blocks: [
      {
        id: 'student_name',
        type: 'input',
        fieldKey: 'student_name',
        label: 'Full Name',
        section: 'Student Identity',
        order: 0,
        width: 'full',
        required: true,
        props: { placeholder: 'e.g. Ahmed Hassan' }
      },
      {
        id: 'task_question',
        type: 'textarea',
        fieldKey: 'task_question',
        label: 'Task Prompt',
        section: 'Task',
        order: 1,
        width: 'full',
        required: true,
        props: { placeholder: 'Enter the task prompt...' }
      },
      {
        id: 'student_response',
        type: 'textarea',
        fieldKey: 'student_article',
        label: 'Student Response',
        section: 'Response',
        order: 2,
        width: 'full',
        required: true,
        props: { placeholder: 'Enter or paste student response...' }
      }
    ]
  });
}

function buildDefaultPromptEntriesForNewExercise(): PromptEntry[] {
  return [
    PromptEntrySchema.parse({
      key: 'marking_protocol',
      label: 'Core Marking Protocol',
      taskType: 'evaluation',
      content: 'Evaluate the student response against the task prompt and return structured feedback.',
      outputSchema: MARKING_JSON_SCHEMA as unknown as Record<string, unknown>
    })
  ];
}

export async function listPublishedExercises(): Promise<PublishedExerciseSummary[]> {
  const exercises = await prisma.exercise.findMany({
    where: {
      promptVersions: {
        some: {
          status: 'PUBLISHED',
          isActive: true
        }
      }
    },
    include: {
      promptVersions: {
        where: {
          status: 'PUBLISHED',
          isActive: true
        },
        orderBy: { version: 'desc' },
        take: 1
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  return exercises
    .filter((ex) => ex.promptVersions.length > 0)
    .map((ex) => {
      const active = ex.promptVersions[0]!;
      return {
        id: ex.id,
        code: ex.code,
        skill: ex.skill,
        title: ex.title,
        description: ex.description,
        totalMarks: ex.totalMarks,
        activeVersion: {
          id: active.id,
          version: active.version,
          publishedAt: active.publishedAt ? active.publishedAt.toISOString() : null
        }
      };
    });
}

export async function getPublishedExerciseByCode(code: string): Promise<PublishedExerciseDetail> {
  const exercise = await prisma.exercise.findUnique({
    where: { code },
    include: {
      promptVersions: {
        where: {
          status: 'PUBLISHED',
          isActive: true
        },
        orderBy: { version: 'desc' },
        take: 1
      }
    }
  });

  if (!exercise || exercise.promptVersions.length === 0) {
    throw new HttpError(404, `Published exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
  }

  const active = exercise.promptVersions[0]!;
  const templateSchema = parseTemplateSchema(active.templateSchema, exercise.code);
  const promptEntries = parsePromptEntries(active);

  const promptMeta: PublicPromptMeta[] = promptEntries.map((entry) => ({
    key: entry.key,
    label: entry.label,
    ...(entry.description ? { description: entry.description } : {}),
    taskType: entry.taskType
  }));

  return {
    id: exercise.id,
    code: exercise.code,
    skill: exercise.skill,
    title: exercise.title,
    description: exercise.description,
    totalMarks: exercise.totalMarks,
    activeVersion: {
      id: active.id,
      version: active.version,
      publishedAt: active.publishedAt ? active.publishedAt.toISOString() : null
    },
    templateSchema,
    promptMeta
  };
}

export async function resolveVersionForExecution(
  code: string,
  options: { versionId?: string; allowDraft?: boolean } = {}
): Promise<ResolvedExecutionContext> {
  const exercise = await prisma.exercise.findUnique({
    where: { code }
  });

  if (!exercise) {
    throw new HttpError(404, `Exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
  }

  let version: PromptVersion | null = null;

  if (options.versionId) {
    version = await prisma.promptVersion.findFirst({
      where: {
        id: options.versionId,
        exerciseId: exercise.id
      }
    });

    if (!version) {
      throw new HttpError(
        404,
        `Prompt version "${options.versionId}" not found for exercise "${code}".`,
        'PROMPT_VERSION_NOT_FOUND'
      );
    }

    if (version.status === 'DRAFT' && !options.allowDraft) {
      throw new HttpError(
        403,
        'Draft prompt versions can only be executed by an authorized administrator.',
        'DRAFT_FORBIDDEN'
      );
    }
  } else {
    version = await prisma.promptVersion.findFirst({
      where: {
        exerciseId: exercise.id,
        status: 'PUBLISHED',
        isActive: true
      },
      orderBy: { version: 'desc' }
    });

    if (!version) {
      throw new HttpError(
        404,
        `No active published version found for exercise "${code}".`,
        'PUBLISHED_VERSION_NOT_FOUND'
      );
    }
  }

  return {
    exercise,
    version,
    promptEntries: parsePromptEntries(version),
    templateSchema: parseTemplateSchema(version.templateSchema, exercise.code)
  };
}

export async function listAllExercisesAdmin(): Promise<AdminExerciseSummary[]> {
  const exercises = await prisma.exercise.findMany({
    include: {
      promptVersions: {
        orderBy: { version: 'desc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  return exercises.map((ex) => {
    const active = ex.promptVersions.find((v) => v.status === 'PUBLISHED' && v.isActive) ?? null;
    const latestDraft = ex.promptVersions.find((v) => v.status === 'DRAFT') ?? null;

    return {
      id: ex.id,
      code: ex.code,
      skill: ex.skill,
      title: ex.title,
      description: ex.description,
      totalMarks: ex.totalMarks,
      versionCount: ex.promptVersions.length,
      activeVersion: active
        ? {
            id: active.id,
            version: active.version,
            publishedAt: active.publishedAt ? active.publishedAt.toISOString() : null
          }
        : null,
      latestDraft: latestDraft
        ? {
            id: latestDraft.id,
            version: latestDraft.version,
            updatedAt: latestDraft.updatedAt.toISOString()
          }
        : null,
      createdAt: ex.createdAt.toISOString(),
      updatedAt: ex.updatedAt.toISOString()
    };
  });
}

export async function createExerciseAdmin(
  rawInput: CreateExerciseAdminInput
): Promise<AdminExerciseDetail> {
  const input = CreateExerciseAdminSchema.parse(rawInput);

  const defaultTemplate = buildDefaultTemplateForNewExercise(input.title, input.totalMarks);
  const defaultPrompts = buildDefaultPromptEntriesForNewExercise();
  const defaultMarkingSchema = MARKING_JSON_SCHEMA as unknown as Prisma.InputJsonValue;

  const created = await prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.create({
      data: {
        code: input.code,
        skill: input.skill,
        title: input.title,
        description: input.description ?? null,
        totalMarks: input.totalMarks
      }
    });

    const draftVersion = await tx.promptVersion.create({
      data: {
        exerciseId: exercise.id,
        version: 1,
        status: 'DRAFT',
        isActive: false,
        transcriptionPrompt: '',
        evaluationPrompt: defaultPrompts[0]?.content ?? '',
        rubricPrompt: '',
        markingSchema: defaultMarkingSchema,
        templateSchema: defaultTemplate as unknown as Prisma.InputJsonValue,
        promptEntries: defaultPrompts as unknown as Prisma.InputJsonValue
      }
    });

    return { exercise, versions: [draftVersion] };
  }, TX_OPTIONS);

  return {
    id: created.exercise.id,
    code: created.exercise.code,
    skill: created.exercise.skill,
    title: created.exercise.title,
    description: created.exercise.description,
    totalMarks: created.exercise.totalMarks,
    createdAt: created.exercise.createdAt.toISOString(),
    updatedAt: created.exercise.updatedAt.toISOString(),
    versions: created.versions.map((v) => mapAdminVersion(v, created.exercise.code))
  };
}

export async function getExerciseAdmin(code: string): Promise<AdminExerciseDetail> {
  const exercise = await prisma.exercise.findUnique({
    where: { code },
    include: {
      promptVersions: {
        orderBy: { version: 'desc' }
      }
    }
  });

  if (!exercise) {
    throw new HttpError(404, `Exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
  }

  return {
    id: exercise.id,
    code: exercise.code,
    skill: exercise.skill,
    title: exercise.title,
    description: exercise.description,
    totalMarks: exercise.totalMarks,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
    versions: exercise.promptVersions.map((v) => mapAdminVersion(v, exercise.code))
  };
}

export async function saveExerciseDraftAdmin(
  code: string,
  rawInput: SaveExerciseDraftAdminInput
): Promise<{ exercise: AdminExerciseDetail; draftVersion: AdminPromptVersionView }> {
  const input = SaveExerciseDraftAdminSchema.parse(rawInput);

  const validatedTemplate =
    input.templateSchema !== undefined ? TemplateSchema.parse(input.templateSchema) : undefined;
  const validatedPromptEntries =
    input.promptEntries !== undefined ? z.array(PromptEntrySchema).parse(input.promptEntries) : undefined;

  const result = await prisma.$transaction(async (tx) => {
    let exercise = await tx.exercise.findUnique({
      where: { code },
      include: {
        promptVersions: {
          orderBy: { version: 'desc' }
        }
      }
    });

    if (!exercise) {
      throw new HttpError(404, `Exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
    }

    if (
      input.title !== undefined ||
      input.description !== undefined ||
      input.skill !== undefined ||
      input.totalMarks !== undefined
    ) {
      exercise = await tx.exercise.update({
        where: { id: exercise.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.skill !== undefined ? { skill: input.skill } : {}),
          ...(input.totalMarks !== undefined ? { totalMarks: input.totalMarks } : {})
        },
        include: {
          promptVersions: {
            orderBy: { version: 'desc' }
          }
        }
      });
    }

    const existingDraft = exercise.promptVersions.find((v) => v.status === 'DRAFT');
    const activePublished =
      exercise.promptVersions.find((v) => v.status === 'PUBLISHED' && v.isActive) ??
      exercise.promptVersions[0];

    let draftVersion: PromptVersion;

    if (existingDraft) {
      const nextPromptEntries =
        validatedPromptEntries ?? parsePromptEntries(existingDraft);
      const nextTemplateSchema =
        validatedTemplate ?? parseTemplateSchema(existingDraft.templateSchema, exercise.code);

      draftVersion = await tx.promptVersion.update({
        where: { id: existingDraft.id },
        data: {
          ...(validatedTemplate !== undefined
            ? { templateSchema: nextTemplateSchema as unknown as Prisma.InputJsonValue }
            : {}),
          ...(validatedPromptEntries !== undefined
            ? { promptEntries: nextPromptEntries as unknown as Prisma.InputJsonValue }
            : {}),
          ...(input.markingSchema !== undefined
            ? { markingSchema: input.markingSchema as Prisma.InputJsonValue }
            : {})
        }
      });
    } else {
      const maxVersion = exercise.promptVersions.reduce(
        (max, v) => (v.version > max ? v.version : max),
        0
      );

      const basePromptEntries =
        validatedPromptEntries ??
        (activePublished ? parsePromptEntries(activePublished) : buildDefaultPromptEntriesForNewExercise());
      const baseTemplateSchema =
        validatedTemplate ??
        (activePublished
          ? parseTemplateSchema(activePublished.templateSchema, exercise.code)
          : buildDefaultTemplateForNewExercise(exercise.title, exercise.totalMarks));
      const baseMarkingSchema =
        input.markingSchema ??
        (activePublished?.markingSchema ?? MARKING_JSON_SCHEMA);

      draftVersion = await tx.promptVersion.create({
        data: {
          exerciseId: exercise.id,
          version: maxVersion + 1,
          status: 'DRAFT',
          isActive: false,
          transcriptionPrompt: activePublished?.transcriptionPrompt ?? '',
          evaluationPrompt: activePublished?.evaluationPrompt ?? '',
          rubricPrompt: activePublished?.rubricPrompt ?? '',
          markingSchema: baseMarkingSchema as Prisma.InputJsonValue,
          templateSchema: baseTemplateSchema as unknown as Prisma.InputJsonValue,
          promptEntries: basePromptEntries as unknown as Prisma.InputJsonValue
        }
      });
    }

    const refreshed = await tx.exercise.findUniqueOrThrow({
      where: { id: exercise.id },
      include: {
        promptVersions: {
          orderBy: { version: 'desc' }
        }
      }
    });

    return { refreshed, draftVersion };
  }, TX_OPTIONS);

  return {
    exercise: {
      id: result.refreshed.id,
      code: result.refreshed.code,
      skill: result.refreshed.skill,
      title: result.refreshed.title,
      description: result.refreshed.description,
      totalMarks: result.refreshed.totalMarks,
      createdAt: result.refreshed.createdAt.toISOString(),
      updatedAt: result.refreshed.updatedAt.toISOString(),
      versions: result.refreshed.promptVersions.map((v) =>
        mapAdminVersion(v, result.refreshed.code)
      )
    },
    draftVersion: mapAdminVersion(result.draftVersion, result.refreshed.code)
  };
}

export async function publishExerciseAdmin(
  code: string,
  versionId?: string
): Promise<{ exercise: AdminExerciseDetail; publishedVersion: AdminPromptVersionView }> {
  const result = await prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.findUnique({
      where: { code },
      include: {
        promptVersions: {
          orderBy: { version: 'desc' }
        }
      }
    });

    if (!exercise) {
      throw new HttpError(404, `Exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
    }

    const target = versionId
      ? exercise.promptVersions.find((v) => v.id === versionId)
      : exercise.promptVersions.find((v) => v.status === 'DRAFT');

    if (!target) {
      throw new HttpError(
        404,
        versionId
          ? `Version "${versionId}" not found for exercise "${code}".`
          : `No draft version found to publish for exercise "${code}".`,
        'VERSION_NOT_FOUND'
      );
    }

    // Mark all other versions inactive (keeping PUBLISHED status for rollback clarity)
    await tx.promptVersion.updateMany({
      where: {
        exerciseId: exercise.id,
        id: { not: target.id },
        isActive: true
      },
      data: {
        isActive: false
      }
    });

    const entries = parsePromptEntries(target);
    const findPromptContent = (key: string): string | undefined =>
      entries.find((e) => e.key === key)?.content;

    const syncedTranscription = findPromptContent('transcription_prompt');
    const syncedEvaluation = findPromptContent('marking_protocol');
    const syncedRubric = findPromptContent('rubric_and_anchors');

    const published = await tx.promptVersion.update({
      where: { id: target.id },
      data: {
        status: 'PUBLISHED',
        isActive: true,
        publishedAt: new Date(),
        ...(syncedTranscription !== undefined ? { transcriptionPrompt: syncedTranscription } : {}),
        ...(syncedEvaluation !== undefined ? { evaluationPrompt: syncedEvaluation } : {}),
        ...(syncedRubric !== undefined ? { rubricPrompt: syncedRubric } : {})
      }
    });

    const refreshed = await tx.exercise.findUniqueOrThrow({
      where: { id: exercise.id },
      include: {
        promptVersions: {
          orderBy: { version: 'desc' }
        }
      }
    });

    return { refreshed, published };
  }, TX_OPTIONS);

  return {
    exercise: {
      id: result.refreshed.id,
      code: result.refreshed.code,
      skill: result.refreshed.skill,
      title: result.refreshed.title,
      description: result.refreshed.description,
      totalMarks: result.refreshed.totalMarks,
      createdAt: result.refreshed.createdAt.toISOString(),
      updatedAt: result.refreshed.updatedAt.toISOString(),
      versions: result.refreshed.promptVersions.map((v) =>
        mapAdminVersion(v, result.refreshed.code)
      )
    },
    publishedVersion: mapAdminVersion(result.published, result.refreshed.code)
  };
}
