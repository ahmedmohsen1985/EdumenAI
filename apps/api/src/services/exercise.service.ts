import { Prisma, type Exercise, type PromptVersion } from '@prisma/client';
import { z } from 'zod';
import {
  buildMarkingJsonSchema,
  ExerciseSkillSchema,
  MARKING_JSON_SCHEMA,
  PromptEntrySchema,
  TemplateSchema,
  type ExerciseSkill,
  type PromptEntry,
  type TemplateConfig
} from '@edumenai/shared';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { appCache } from '../lib/cache.js';

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

export const DuplicateExerciseAdminSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'Exercise code must be a lowercase slug (a-z, 0-9, -).'),
  title: z.string().min(1).max(200)
});

export type DuplicateExerciseAdminInput = z.infer<typeof DuplicateExerciseAdminSchema>;

function parseTemplateSchema(raw: Prisma.JsonValue | null): TemplateConfig {
  if (raw !== null && raw !== undefined) {
    const parsed = TemplateSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
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
  return [];
}

function mapAdminVersion(version: PromptVersion): AdminPromptVersionView {
  const markingSchema =
    version.markingSchema && typeof version.markingSchema === 'object' && !Array.isArray(version.markingSchema)
      ? (version.markingSchema as Record<string, unknown>)
      : (MARKING_JSON_SCHEMA as unknown as Record<string, unknown>);

  return {
    id: version.id,
    version: version.version,
    status: version.status,
    isActive: version.isActive,
    templateSchema: parseTemplateSchema(version.templateSchema),
    promptEntries: parsePromptEntries(version),
    markingSchema,
    publishedAt: version.publishedAt ? version.publishedAt.toISOString() : null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}

function buildDefaultTemplateForNewExercise(_title: string, _totalMarks: number): TemplateConfig {
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

function buildDefaultPromptEntriesForNewExercise(): PromptEntry[] {
  return [];
}

export async function listPublishedExercises(): Promise<PublishedExerciseSummary[]> {
  return appCache.getOrSet('exercises:published:list', async () => {
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
          select: {
            id: true,
            version: true,
            publishedAt: true
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
  });
}

export async function getPublishedExerciseByCode(code: string): Promise<PublishedExerciseDetail> {
  return appCache.getOrSet(`exercises:published:code:${code}`, async () => {
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
    const templateSchema = parseTemplateSchema(active.templateSchema);
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
  });
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
    templateSchema: parseTemplateSchema(version.templateSchema)
  };
}

export async function listAllExercisesAdmin(): Promise<AdminExerciseSummary[]> {
  return appCache.getOrSet('exercises:admin:list', async () => {
    const exercises = await prisma.exercise.findMany({
      include: {
        promptVersions: {
          select: {
            id: true,
            version: true,
            status: true,
            isActive: true,
            publishedAt: true,
            updatedAt: true
          },
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
  });
}

export async function createExerciseAdmin(
  rawInput: CreateExerciseAdminInput
): Promise<AdminExerciseDetail> {
  const input = CreateExerciseAdminSchema.parse(rawInput);

  const defaultTemplate = buildDefaultTemplateForNewExercise(input.title, input.totalMarks);
  const defaultPrompts = buildDefaultPromptEntriesForNewExercise();
  const defaultMarkingSchema = buildMarkingJsonSchema({
    totalMax: input.totalMarks
  }) as unknown as Prisma.InputJsonValue;

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

  const detail: AdminExerciseDetail = {
    id: created.exercise.id,
    code: created.exercise.code,
    skill: created.exercise.skill,
    title: created.exercise.title,
    description: created.exercise.description,
    totalMarks: created.exercise.totalMarks,
    createdAt: created.exercise.createdAt.toISOString(),
    updatedAt: created.exercise.updatedAt.toISOString(),
    versions: created.versions.map((v) => mapAdminVersion(v))
  };

  appCache.delPrefix('exercises:');
  appCache.set(`exercises:admin:code:${detail.code}`, detail, 60_000);

  return detail;
}

export async function getExerciseAdmin(code: string): Promise<AdminExerciseDetail> {
  return appCache.getOrSet(`exercises:admin:code:${code}`, async () => {
    const exercise = await prisma.exercise.findUnique({
      where: { code },
      include: {
        promptVersions: {
          orderBy: { version: 'desc' },
          take: 3
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
      versions: exercise.promptVersions.map((v) => mapAdminVersion(v))
    };
  });
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
        validatedTemplate ?? parseTemplateSchema(existingDraft.templateSchema);

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
          ? parseTemplateSchema(activePublished.templateSchema)
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
          orderBy: { version: 'desc' },
          take: 3
        }
      }
    });

    return { refreshed, draftVersion };
  }, TX_OPTIONS);

  const exerciseDetail: AdminExerciseDetail = {
    id: result.refreshed.id,
    code: result.refreshed.code,
    skill: result.refreshed.skill,
    title: result.refreshed.title,
    description: result.refreshed.description,
    totalMarks: result.refreshed.totalMarks,
    createdAt: result.refreshed.createdAt.toISOString(),
    updatedAt: result.refreshed.updatedAt.toISOString(),
    versions: result.refreshed.promptVersions.map((v) => mapAdminVersion(v))
  };

  appCache.delPrefix('exercises:');
  appCache.set(`exercises:admin:code:${code}`, exerciseDetail, 60_000);

  return {
    exercise: exerciseDetail,
    draftVersion: mapAdminVersion(result.draftVersion)
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
          orderBy: { version: 'desc' },
          take: 3
        }
      }
    });

    return { refreshed, published };
  }, TX_OPTIONS);

  const exerciseDetail: AdminExerciseDetail = {
    id: result.refreshed.id,
    code: result.refreshed.code,
    skill: result.refreshed.skill,
    title: result.refreshed.title,
    description: result.refreshed.description,
    totalMarks: result.refreshed.totalMarks,
    createdAt: result.refreshed.createdAt.toISOString(),
    updatedAt: result.refreshed.updatedAt.toISOString(),
    versions: result.refreshed.promptVersions.map((v) => mapAdminVersion(v))
  };

  appCache.delPrefix('exercises:');
  appCache.set(`exercises:admin:code:${code}`, exerciseDetail, 60_000);

  return {
    exercise: exerciseDetail,
    publishedVersion: mapAdminVersion(result.published)
  };
}

export async function deleteExerciseAdmin(
  code: string
): Promise<{ deleted: true; code: string }> {
  await prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.findUnique({
      where: { code },
      select: { id: true }
    });

    if (!exercise) {
      throw new HttpError(404, `Exercise "${code}" not found.`, 'EXERCISE_NOT_FOUND');
    }

    await tx.submission.deleteMany({ where: { exerciseId: exercise.id } });
    await tx.promptVersion.deleteMany({ where: { exerciseId: exercise.id } });
    await tx.exercise.delete({ where: { id: exercise.id } });
  }, TX_OPTIONS);

  appCache.delPrefix('exercises:');
  return { deleted: true, code };
}

export async function duplicateExerciseAdmin(
  sourceCode: string,
  rawInput: DuplicateExerciseAdminInput
): Promise<AdminExerciseDetail> {
  const input = DuplicateExerciseAdminSchema.parse(rawInput);

  const source = await prisma.exercise.findUnique({
    where: { code: sourceCode },
    include: {
      promptVersions: {
        orderBy: { version: 'desc' },
        take: 1
      }
    }
  });

  if (!source) {
    throw new HttpError(404, `Exercise "${sourceCode}" not found.`, 'EXERCISE_NOT_FOUND');
  }

  const latestVersion = source.promptVersions[0] ?? null;
  const clonedTemplate = latestVersion
    ? parseTemplateSchema(latestVersion.templateSchema)
    : buildDefaultTemplateForNewExercise(input.title, source.totalMarks);
  const clonedPrompts = latestVersion
    ? parsePromptEntries(latestVersion)
    : buildDefaultPromptEntriesForNewExercise();
  const clonedMarkingSchema =
    latestVersion?.markingSchema ??
    (buildMarkingJsonSchema({ totalMax: source.totalMarks }) as unknown as Prisma.InputJsonValue);

  const created = await prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.create({
      data: {
        code: input.code,
        skill: source.skill,
        title: input.title.trim(),
        description: source.description,
        totalMarks: source.totalMarks
      }
    });

    const draftVersion = await tx.promptVersion.create({
      data: {
        exerciseId: exercise.id,
        version: 1,
        status: 'DRAFT',
        isActive: false,
        transcriptionPrompt: latestVersion?.transcriptionPrompt ?? '',
        evaluationPrompt: latestVersion?.evaluationPrompt ?? '',
        rubricPrompt: latestVersion?.rubricPrompt ?? '',
        markingSchema: clonedMarkingSchema as Prisma.InputJsonValue,
        templateSchema: clonedTemplate as unknown as Prisma.InputJsonValue,
        promptEntries: clonedPrompts as unknown as Prisma.InputJsonValue
      }
    });

    return { exercise, versions: [draftVersion] };
  }, TX_OPTIONS);

  const detail: AdminExerciseDetail = {
    id: created.exercise.id,
    code: created.exercise.code,
    skill: created.exercise.skill,
    title: created.exercise.title,
    description: created.exercise.description,
    totalMarks: created.exercise.totalMarks,
    createdAt: created.exercise.createdAt.toISOString(),
    updatedAt: created.exercise.updatedAt.toISOString(),
    versions: created.versions.map((v) => mapAdminVersion(v))
  };

  appCache.delPrefix('exercises:');
  appCache.set(`exercises:admin:code:${detail.code}`, detail, 60_000);

  return detail;
}
