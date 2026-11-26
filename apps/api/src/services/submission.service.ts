import { Prisma, type User } from '@prisma/client';
import {
  IntegrityLogSchema,
  MediaAttachmentSchema,
  type ErrorItem,
  type IntegrityLog,
  type Justification,
  type MarkingReport,
  type MediaAttachment,
  type PersistedReport,
  type StudentInfo,
  type TranscriptionMeta
} from '@edumenai/shared';
import { appCache } from '../lib/cache.js';
import { prisma, TX_OPTIONS } from '../lib/prisma.js';
import { HttpError } from './exercise.service.js';

export interface EvaluationUsageMetrics {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
}

export interface PipelineEvaluationResult {
  report: MarkingReport;
  provider: string;
  model: string;
  usage: EvaluationUsageMetrics;
}

export interface CreateEvaluatedSubmissionParams {
  exerciseId: string;
  promptVersionId: string;
  studentId?: string | null;
  instructorId?: string | null;
  student: StudentInfo;
  taskPrompt: string;
  rawText?: string;
  finalText: string;
  transcriptionMeta?: TranscriptionMeta;
  isPreview?: boolean;
  formData?: Record<string, unknown>;
  integrityLog?: IntegrityLog;
  evaluationResult: PipelineEvaluationResult;
}

export interface CreatedEvaluatedSubmission {
  submissionId: string;
  reportId: string;
  isPreview: boolean;
  report: PersistedReport;
}

export interface ListReportsParams {
  viewerUser?: User | null;
  isAdminOverride?: boolean;
  exerciseCode?: string;
  studentId?: string;
  instructorId?: string;
  search?: string;
  includePreview?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListReportsResult {
  items: PersistedReport[];
  total: number;
}

export interface ReportAccessContext {
  report: PersistedReport;
  studentTelegramId: string | null;
  parentTelegramId: string | null;
  submissionInstructorId: string | null;
  exerciseOwnerId: string | null;
  submissionStudentId: string | null;
}

export interface InstructorOverviewStats {
  approvedStudentsCount: number;
  pendingRequestsCount: number;
  myExercisesCount: number;
  publishedExercisesCount: number;
  totalSubmissionsCount: number;
  recentSubmissions: PersistedReport[];
}

const REPORT_INCLUDE = {
  submission: {
    include: {
      exercise: true,
      promptVersion: true,
      instructor: {
        select: {
          id: true,
          name: true
        }
      },
      student: {
        select: {
          id: true,
          telegramId: true,
          parentTelegramId: true,
          parentPhone: true
        }
      }
    }
  }
} as const;

type ReportWithRelations = Prisma.EvaluationReportGetPayload<{
  include: typeof REPORT_INCLUDE;
}>;

function mapReportToPersisted(
  record: ReportWithRelations,
  options?: { includeIntegrity?: boolean }
): PersistedReport {
  const { submission } = record;
  const transcriptionMeta =
    submission.transcriptionMeta &&
    typeof submission.transcriptionMeta === 'object' &&
    !Array.isArray(submission.transcriptionMeta)
      ? (submission.transcriptionMeta as Record<string, unknown>)
      : null;

  const formData =
    submission.formData &&
    typeof submission.formData === 'object' &&
    !Array.isArray(submission.formData)
      ? (submission.formData as Record<string, unknown>)
      : null;

  let integrityLog: IntegrityLog | null = null;
  if (options?.includeIntegrity === true && submission.integrityLog != null) {
    const parsedIntegrity = IntegrityLogSchema.safeParse(submission.integrityLog);
    if (parsedIntegrity.success) {
      integrityLog = parsedIntegrity.data;
    }
  }

  let mediaAttachments: MediaAttachment[] | null = null;
  const rawAttachments = formData?._mediaAttachments;
  if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
    const presetLookup = new Map<string, string>();
    const templateSchema =
      submission.promptVersion.templateSchema &&
      typeof submission.promptVersion.templateSchema === 'object' &&
      !Array.isArray(submission.promptVersion.templateSchema)
        ? (submission.promptVersion.templateSchema as {
            blocks?: Array<{ id?: unknown; type?: unknown; props?: unknown }>;
          })
        : null;

    if (Array.isArray(templateSchema?.blocks)) {
      for (const block of templateSchema.blocks) {
        if (block?.type !== 'media_upload' || typeof block.id !== 'string') continue;
        const props =
          block.props && typeof block.props === 'object' && !Array.isArray(block.props)
            ? (block.props as Record<string, unknown>)
            : null;
        if (typeof props?.presetImageDataUrl === 'string' && props.presetImageDataUrl.trim()) {
          presetLookup.set(block.id, props.presetImageDataUrl.trim());
        }
      }
    }

    const hydrated: MediaAttachment[] = [];
    for (const item of rawAttachments) {
      const parsed = MediaAttachmentSchema.safeParse(item);
      if (!parsed.success) continue;
      const att = parsed.data;
      if (att.source === 'preset' && !att.dataUrl && att.presetBlockId) {
        const presetUrl = presetLookup.get(att.presetBlockId);
        if (presetUrl) {
          hydrated.push({ ...att, dataUrl: presetUrl });
          continue;
        }
      }
      hydrated.push(att);
    }

    if (hydrated.length > 0) {
      mediaAttachments = hydrated;
    }
  }

  return {
    id: record.id,
    submissionId: submission.id,
    studentId: submission.studentId,
    instructorId: submission.instructorId,
    instructorName: submission.instructor?.name ?? null,
    exerciseOwnerId: submission.exercise.ownerId ?? null,
    exerciseCode: submission.exercise.code,
    exerciseTitle: submission.exercise.title,
    promptVersion: submission.promptVersion.version,
    studentName: submission.studentName,
    studentClass: submission.studentClass,
    studentSchool: submission.studentSchool,
    taskPrompt: submission.taskPrompt,
    rawText: submission.rawText,
    finalText: submission.finalText,
    transcriptionMeta,
    isPreview: submission.isPreview,
    formData,
    integrityLog,
    mediaAttachments,
    marks: {
      content: record.marksContent,
      content_max: record.marksContentMax,
      language: record.marksLanguage,
      language_max: record.marksLanguageMax,
      total: record.marksTotal,
      total_max: record.marksTotalMax
    },
    justification: record.justification as unknown as Justification,
    errors: record.errors as unknown as ErrorItem[],
    contentFeedback: Array.isArray(record.contentFeedback)
      ? (record.contentFeedback as string[])
      : [],
    correctedVersion: record.correctedVersion,
    provider: record.provider,
    model: record.model,
    promptTokens: record.promptTokens,
    completionTokens: record.completionTokens,
    totalTokens: record.totalTokens,
    latencyMs: record.latencyMs,
    createdAt: record.createdAt.toISOString()
  };
}

export async function createEvaluatedSubmission(
  params: CreateEvaluatedSubmissionParams
): Promise<CreatedEvaluatedSubmission> {
  const isPreview = Boolean(params.isPreview);
  const { report, provider, model, usage } = params.evaluationResult;

  const created = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.create({
      data: {
        exerciseId: params.exerciseId,
        promptVersionId: params.promptVersionId,
        studentId: params.studentId ?? null,
        instructorId: params.instructorId ?? null,
        studentName: params.student.name,
        studentClass: params.student.className ?? null,
        studentSchool: params.student.school ?? null,
        taskPrompt: params.taskPrompt,
        rawText: params.rawText ?? null,
        finalText: params.finalText,
        ...(params.transcriptionMeta !== undefined
          ? { transcriptionMeta: params.transcriptionMeta as unknown as Prisma.InputJsonValue }
          : {}),
        isPreview,
        ...(params.formData !== undefined
          ? { formData: params.formData as unknown as Prisma.InputJsonValue }
          : {}),
        ...(params.integrityLog !== undefined
          ? { integrityLog: params.integrityLog as unknown as Prisma.InputJsonValue }
          : {}),
        status: 'COMPLETED'
      }
    });

    const evaluationReport = await tx.evaluationReport.create({
      data: {
        submissionId: submission.id,
        marksContent: report.marks.content,
        marksContentMax: report.marks.content_max,
        marksLanguage: report.marks.language,
        marksLanguageMax: report.marks.language_max,
        marksTotal: report.marks.total,
        marksTotalMax: report.marks.total_max,
        justification: report.justification as unknown as Prisma.InputJsonValue,
        errors: report.errors as unknown as Prisma.InputJsonValue,
        contentFeedback: report.content_feedback as unknown as Prisma.InputJsonValue,
        correctedVersion: report.corrected_version,
        provider,
        model,
        promptTokens: usage.promptTokens ?? null,
        completionTokens: usage.completionTokens ?? null,
        totalTokens: usage.totalTokens ?? null,
        latencyMs: usage.latencyMs ?? null
      },
      include: REPORT_INCLUDE
    });

    return evaluationReport;
  }, TX_OPTIONS);

  appCache.delPrefix('metrics:');

  return {
    submissionId: created.submissionId,
    reportId: created.id,
    isPreview,
    report: mapReportToPersisted(created)
  };
}

export async function listReports(params: ListReportsParams = {}): Promise<ListReportsResult> {
  const viewerUser = params.viewerUser ?? null;
  const isAdminOverride = Boolean(params.isAdminOverride);

  if (!viewerUser && !isAdminOverride) {
    throw new HttpError(401, 'Authentication required to view evaluation reports.', 'AUTH_REQUIRED');
  }

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const andConditions: Prisma.SubmissionWhereInput[] = [];

  if (params.exerciseCode) {
    andConditions.push({ exercise: { code: params.exerciseCode } });
  }

  if (isAdminOverride || viewerUser?.role === 'ADMIN') {
    if (!params.includePreview) {
      andConditions.push({ isPreview: false });
    }
    if (params.studentId) {
      andConditions.push({ studentId: params.studentId });
    }
    if (params.instructorId) {
      andConditions.push({
        OR: [{ instructorId: params.instructorId }, { exercise: { ownerId: params.instructorId } }]
      });
    }
  } else if (viewerUser?.role === 'INSTRUCTOR') {
    if (viewerUser.accountStatus !== 'ACTIVE') {
      throw new HttpError(
        403,
        'Your instructor account must be active to view student reports.',
        'FORBIDDEN'
      );
    }
    if (!params.includePreview) {
      andConditions.push({ isPreview: false });
    }
    andConditions.push({
      OR: [{ instructorId: viewerUser.id }, { exercise: { ownerId: viewerUser.id } }]
    });
    if (params.studentId) {
      andConditions.push({ studentId: params.studentId });
    }
  } else if (viewerUser) {
    // Students can only ever view their own non-preview reports
    andConditions.push({ studentId: viewerUser.id });
    andConditions.push({ isPreview: false });
  }

  const search = params.search?.trim();
  if (search) {
    andConditions.push({
      OR: [
        { studentName: { contains: search, mode: 'insensitive' } },
        { studentSchool: { contains: search, mode: 'insensitive' } },
        { studentClass: { contains: search, mode: 'insensitive' } },
        { exercise: { title: { contains: search, mode: 'insensitive' } } },
        { exercise: { code: { contains: search, mode: 'insensitive' } } }
      ]
    });
  }

  const where: Prisma.EvaluationReportWhereInput = {
    submission: andConditions.length > 0 ? { AND: andConditions } : {}
  };

  const [rows, total] = await Promise.all([
    prisma.evaluationReport.findMany({
      where,
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.evaluationReport.count({ where })
  ]);

  const includeIntegrity = Boolean(
    isAdminOverride || viewerUser?.role === 'ADMIN' || viewerUser?.role === 'INSTRUCTOR'
  );

  return {
    items: rows.map((row) => mapReportToPersisted(row, { includeIntegrity })),
    total
  };
}

export async function getReportAccessContext(
  id: string,
  viewerUser?: User | null,
  isAdminOverride = false
): Promise<ReportAccessContext> {
  const record = await prisma.evaluationReport.findUnique({
    where: { id },
    include: REPORT_INCLUDE
  });

  if (!record) {
    throw new HttpError(404, `Evaluation report "${id}" not found.`, 'REPORT_NOT_FOUND');
  }

  if (!viewerUser && !isAdminOverride) {
    throw new HttpError(401, 'Authentication required to view this evaluation report.', 'AUTH_REQUIRED');
  }

  if (!isAdminOverride && viewerUser && viewerUser.role !== 'ADMIN') {
    if (viewerUser.role === 'INSTRUCTOR') {
      const ownsSubmission =
        record.submission.instructorId === viewerUser.id ||
        record.submission.exercise.ownerId === viewerUser.id;
      if (viewerUser.accountStatus !== 'ACTIVE' || !ownsSubmission) {
        throw new HttpError(403, 'You do not have permission to access this report.', 'FORBIDDEN');
      }
    } else {
      const isOwnStudentReport =
        record.submission.studentId === viewerUser.id && !record.submission.isPreview;
      if (!isOwnStudentReport) {
        throw new HttpError(403, 'You do not have permission to access this report.', 'FORBIDDEN');
      }
    }
  }

  const includeIntegrity = Boolean(
    isAdminOverride || viewerUser?.role === 'ADMIN' || viewerUser?.role === 'INSTRUCTOR'
  );

  return {
    report: mapReportToPersisted(record, { includeIntegrity }),
    studentTelegramId: record.submission.student?.telegramId ?? null,
    parentTelegramId: record.submission.student?.parentTelegramId ?? null,
    submissionInstructorId: record.submission.instructorId,
    exerciseOwnerId: record.submission.exercise.ownerId,
    submissionStudentId: record.submission.studentId
  };
}

export async function getReportById(id: string): Promise<PersistedReport> {
  const ctx = await getReportAccessContext(id, null, true);
  return ctx.report;
}

export async function deleteReportById(
  id: string,
  viewerUser?: User | null,
  isAdminOverride = false
): Promise<{ deleted: true; id: string; submissionId: string }> {
  if (!viewerUser && !isAdminOverride) {
    throw new HttpError(401, 'Authentication required to delete evaluation reports.', 'AUTH_REQUIRED');
  }

  const record = await prisma.evaluationReport.findUnique({
    where: { id },
    select: {
      id: true,
      submission: {
        select: {
          id: true,
          exercise: {
            select: {
              ownerId: true
            }
          }
        }
      }
    }
  });

  if (!record) {
    throw new HttpError(404, `Evaluation report "${id}" not found.`, 'REPORT_NOT_FOUND');
  }

  if (!isAdminOverride && viewerUser?.role !== 'ADMIN') {
    if (viewerUser?.role === 'INSTRUCTOR') {
      if (
        viewerUser.accountStatus !== 'ACTIVE' ||
        record.submission.exercise.ownerId !== viewerUser.id
      ) {
        throw new HttpError(
          403,
          'Instructors can only delete reports belonging to their own custom exercises.',
          'FORBIDDEN'
        );
      }
    } else {
      throw new HttpError(
        403,
        'You do not have permission to delete evaluation reports.',
        'FORBIDDEN'
      );
    }
  }

  await prisma.submission.delete({
    where: { id: record.submission.id }
  });

  appCache.delPrefix('metrics:');

  return {
    deleted: true,
    id: record.id,
    submissionId: record.submission.id
  };
}

export async function getInstructorOverviewStats(
  instructorId: string
): Promise<InstructorOverviewStats> {
  const instructorSubmissionScope: Prisma.SubmissionWhereInput = {
    isPreview: false,
    OR: [{ instructorId }, { exercise: { ownerId: instructorId } }]
  };

  const [
    approvedStudentsCount,
    pendingRequestsCount,
    myExercisesCount,
    publishedExercisesCount,
    totalSubmissionsCount,
    recentRows
  ] = await Promise.all([
    prisma.studentInstructor.count({
      where: { instructorId, status: 'APPROVED' }
    }),
    prisma.studentInstructor.count({
      where: { instructorId, status: 'PENDING' }
    }),
    prisma.exercise.count({
      where: { ownerId: instructorId }
    }),
    prisma.exercise.count({
      where: {
        ownerId: instructorId,
        promptVersions: {
          some: {
            status: 'PUBLISHED',
            isActive: true
          }
        }
      }
    }),
    prisma.evaluationReport.count({
      where: { submission: instructorSubmissionScope }
    }),
    prisma.evaluationReport.findMany({
      where: { submission: instructorSubmissionScope },
      include: REPORT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 5
    })
  ]);

  return {
    approvedStudentsCount,
    pendingRequestsCount,
    myExercisesCount,
    publishedExercisesCount,
    totalSubmissionsCount,
    recentSubmissions: recentRows.map((row) =>
      mapReportToPersisted(row, { includeIntegrity: true })
    )
  };
}
