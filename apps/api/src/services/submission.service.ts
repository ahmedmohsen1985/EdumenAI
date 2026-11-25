import { Prisma } from '@prisma/client';
import type {
  ErrorItem,
  Justification,
  MarkingReport,
  PersistedReport,
  StudentInfo,
  TranscriptionMeta
} from '@edumenai/shared';
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
  evaluationResult: PipelineEvaluationResult;
}

export interface CreatedEvaluatedSubmission {
  submissionId: string;
  reportId: string;
  isPreview: boolean;
  report: PersistedReport;
}

export interface ListReportsParams {
  exerciseCode?: string;
  includePreview?: boolean;
  limit?: number;
  offset?: number;
}

export interface ListReportsResult {
  items: PersistedReport[];
  total: number;
}

type ReportWithRelations = Prisma.EvaluationReportGetPayload<{
  include: {
    submission: {
      include: {
        exercise: true;
        promptVersion: true;
      };
    };
  };
}>;

function mapReportToPersisted(record: ReportWithRelations): PersistedReport {
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

  return {
    id: record.id,
    submissionId: submission.id,
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
      include: {
        submission: {
          include: {
            exercise: true,
            promptVersion: true
          }
        }
      }
    });

    return evaluationReport;
  }, TX_OPTIONS);

  return {
    submissionId: created.submissionId,
    reportId: created.id,
    isPreview,
    report: mapReportToPersisted(created)
  };
}

export async function listReports(params: ListReportsParams = {}): Promise<ListReportsResult> {
  const includePreview = params.includePreview ?? false;
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const submissionWhere: Prisma.SubmissionWhereInput = {
    ...(includePreview ? {} : { isPreview: false }),
    ...(params.exerciseCode ? { exercise: { code: params.exerciseCode } } : {})
  };

  const where: Prisma.EvaluationReportWhereInput = {
    submission: submissionWhere
  };

  const [rows, total] = await Promise.all([
    prisma.evaluationReport.findMany({
      where,
      include: {
        submission: {
          include: {
            exercise: true,
            promptVersion: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    }),
    prisma.evaluationReport.count({ where })
  ]);

  return {
    items: rows.map(mapReportToPersisted),
    total
  };
}

export async function getReportById(id: string): Promise<PersistedReport> {
  const record = await prisma.evaluationReport.findUnique({
    where: { id },
    include: {
      submission: {
        include: {
          exercise: true,
          promptVersion: true
        }
      }
    }
  });

  if (!record) {
    throw new HttpError(404, `Evaluation report "${id}" not found.`, 'REPORT_NOT_FOUND');
  }

  return mapReportToPersisted(record);
}
