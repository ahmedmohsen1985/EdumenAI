import path from 'node:path';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { EvaluateRequestSchema, type MarkingReport, type StudentInfo } from '@edumenai/shared';
import { resolveVersionForExecution } from '../services/exercise.service.js';
import {
  createEvaluatedSubmission,
  getReportById,
  listReports
} from '../services/submission.service.js';
import {
  evaluateArticle,
  extractTaskQuestion,
  transcribeHandwriting
} from '../ai-gateway/exercise4.pipeline.js';
import { AiServiceError } from '../ai-gateway/index.js';
import {
  dispatchFullReportWithPdf,
  notifyStudent,
  sendTeacherAudit,
  sendTeacherError,
  sendTeacherQuotaAlert
} from '../services/telegram.service.js';
import { isAdminAuthorized } from '../middleware/admin-auth.middleware.js';
import { logger } from '../lib/logger.js';

const router = Router();

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/heic',
  'image/heif'
];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_PDF_TYPES];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'];

function isAllowedUpload(file: Express.Multer.File | undefined): boolean {
  if (!file) return false;
  if (ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) return true;
  const ext = path.extname(file.originalname).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15 MB
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedUpload(file)) {
      cb(null, true);
      return;
    }
    const err = new Error('Only image files (JPG, PNG, WEBP) or PDF documents are allowed.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    cb(err);
  }
});

function singleFileUpload(fieldName: string): RequestHandler {
  return upload.single(fieldName) as unknown as RequestHandler;
}

function handleRouteAiError(
  res: Response,
  err: unknown,
  operationLabel: string,
  fallbackMessage: string,
  studentInfo?: StudentInfo
): void {
  logger.error({ err, operationLabel }, 'Exercise 4 AI route failed');

  const isAiError = err instanceof AiServiceError;
  const isQuotaError = isAiError ? err.isQuotaError || err.code === 'QUOTA_EXCEEDED' : false;
  const statusCode = isQuotaError ? 429 : isAiError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : fallbackMessage;
  const provider = isAiError ? err.provider : undefined;
  const model = isAiError ? err.model : undefined;
  const code = isAiError ? err.code : 'AI_ERROR';
  const retryAfter = isAiError ? err.retryAfter : undefined;

  if (isQuotaError) {
    void sendTeacherQuotaAlert({
      provider,
      model,
      operation: operationLabel,
      retryAfter,
      studentInfo: studentInfo ?? null
    }).catch((notifyErr: unknown) => {
      logger.error({ err: notifyErr, operationLabel }, 'Teacher quota alert failed');
    });
  } else if (studentInfo) {
    void sendTeacherError(studentInfo, message).catch((notifyErr: unknown) => {
      logger.error({ err: notifyErr, operationLabel }, 'Teacher error notification failed');
    });
  }

  res.status(statusCode).json({
    success: false,
    code,
    isQuotaError,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    error: message || fallbackMessage
  });
}

async function handleExtractTask(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No task question file provided.' });
      return;
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    let customPrompt: string | undefined;
    try {
      const resolved = await resolveVersionForExecution('ex4');
      customPrompt = resolved.promptEntries.find(
        (e) => e.key === 'task_extraction_prompt'
      )?.content;
    } catch {
      // Fallback to default prompt inside pipeline if ex4 is not seeded yet
    }

    const result = await extractTaskQuestion(req.file.buffer, mimeType, customPrompt);
    const taskQuestion = typeof result === 'string' ? result : result.taskQuestion;

    if (!taskQuestion || !taskQuestion.trim()) {
      res.status(422).json({
        success: false,
        error:
          'Could not detect an exam question in the uploaded file. Please make sure the image is clear or type the question manually.'
      });
      return;
    }

    res.json({
      success: true,
      data: {
        taskQuestion: taskQuestion.trim(),
        mimeType
      }
    });
  } catch (err) {
    handleRouteAiError(
      res,
      err,
      'Task Question Extraction (/extract-task)',
      'Task question extraction failed.'
    );
  }
}

async function handleTranscribe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file provided.' });
      return;
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    let customPrompt: string | undefined;
    try {
      const resolved = await resolveVersionForExecution('ex4');
      customPrompt =
        resolved.promptEntries.find((e) => e.key === 'transcription_prompt')?.content ??
        (resolved.version.transcriptionPrompt || undefined);
    } catch {
      // Fallback to file prompt inside pipeline if ex4 is not seeded yet
    }

    const result = await transcribeHandwriting(req.file.buffer, mimeType, customPrompt);

    res.json({
      success: true,
      data: {
        transcription: result.transcription,
        mimeType,
        ...(result.transcriptionMeta ? { transcriptionMeta: result.transcriptionMeta } : {})
      }
    });
  } catch (err) {
    handleRouteAiError(
      res,
      err,
      'Handwriting Transcription (/transcribe)',
      'Transcription failed.'
    );
  }
}

async function evaluateEx4Core(req: Request): Promise<{
  reportId: string;
  submissionId: string;
  isPreview: boolean;
  report: MarkingReport;
  provider: string;
  model: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    latencyMs: number | null;
  };
}> {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const rawStudent = (rawBody.student ?? {}) as Record<string, unknown>;

  const normalizedInput = EvaluateRequestSchema.parse({
    student: {
      name: typeof rawStudent.name === 'string' && rawStudent.name.trim() ? rawStudent.name : 'Unknown',
      telegram: typeof rawStudent.telegram === 'string' ? rawStudent.telegram : undefined,
      school: typeof rawStudent.school === 'string' ? rawStudent.school : undefined,
      className:
        typeof rawStudent.className === 'string'
          ? rawStudent.className
          : typeof rawStudent.class === 'string'
            ? rawStudent.class
            : undefined
    },
    taskPrompt: rawBody.taskPrompt,
    rawText: typeof rawBody.rawText === 'string' ? rawBody.rawText : undefined,
    finalText: rawBody.finalText,
    transcriptionMeta: rawBody.transcriptionMeta,
    versionId: typeof rawBody.versionId === 'string' ? rawBody.versionId : undefined,
    isPreview: typeof rawBody.isPreview === 'boolean' ? rawBody.isPreview : false,
    formData: rawBody.formData,
    promptKeys: rawBody.promptKeys,
    telegramTargetIds: rawBody.telegramTargetIds
  });

  const isPreview = Boolean(normalizedInput.isPreview);
  const authorized = isAdminAuthorized(req);

  const resolved = await resolveVersionForExecution('ex4', {
    versionId: normalizedInput.versionId,
    allowDraft: authorized
  });

  const evalEntries =
    normalizedInput.promptKeys && normalizedInput.promptKeys.length > 0
      ? resolved.promptEntries.filter((e) => normalizedInput.promptKeys!.includes(e.key))
      : resolved.promptEntries.filter((e) => e.taskType === 'evaluation');

  const systemPrompts = evalEntries.map((e) => e.content).filter((c) => c.trim().length > 0);
  const versionSchema =
    resolved.version.markingSchema &&
    typeof resolved.version.markingSchema === 'object' &&
    !Array.isArray(resolved.version.markingSchema)
      ? (resolved.version.markingSchema as Record<string, unknown>)
      : undefined;

  const evaluationResult = await evaluateArticle({
    studentName: normalizedInput.student.name,
    taskPrompt: normalizedInput.taskPrompt,
    studentText: normalizedInput.finalText,
    ...(systemPrompts.length > 0 ? { systemPrompts } : {}),
    ...(versionSchema ? { markingSchema: versionSchema } : {})
  });

  const persisted = await createEvaluatedSubmission({
    exerciseId: resolved.exercise.id,
    promptVersionId: resolved.version.id,
    student: normalizedInput.student,
    taskPrompt: normalizedInput.taskPrompt,
    rawText: normalizedInput.rawText,
    finalText: normalizedInput.finalText,
    transcriptionMeta: normalizedInput.transcriptionMeta,
    isPreview,
    formData: normalizedInput.formData,
    evaluationResult
  });

  if (!isPreview) {
    void (async () => {
      try {
        if (normalizedInput.student.telegram) {
          await notifyStudent(
            normalizedInput.student.telegram,
            normalizedInput.student.name,
            evaluationResult.report
          );
        }
        await sendTeacherAudit(
          normalizedInput.student,
          normalizedInput.rawText ?? '',
          normalizedInput.finalText,
          evaluationResult.report,
          normalizedInput.telegramTargetIds
        );
      } catch (notifyErr: unknown) {
        logger.error({ err: notifyErr }, 'Exercise 4 Telegram notification error');
      }
    })();
  }

  return {
    reportId: persisted.reportId,
    submissionId: persisted.submissionId,
    isPreview: persisted.isPreview,
    report: evaluationResult.report,
    provider: evaluationResult.provider,
    model: evaluationResult.model,
    usage: evaluationResult.usage
  };
}

// Legacy POC routes + Step-2 Exercise 4 routes
router.post('/extract-task', singleFileUpload('file'), handleExtractTask);
router.post('/exercise-4/extract-task', singleFileUpload('file'), handleExtractTask);

router.post('/transcribe', singleFileUpload('file'), handleTranscribe);
router.post('/exercise-4/transcribe', singleFileUpload('file'), handleTranscribe);

router.post('/evaluate', async (req: Request, res: Response): Promise<void> => {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const rawStudent = (rawBody.student ?? {}) as Record<string, unknown>;
  const studentInfo: StudentInfo = {
    name: typeof rawStudent.name === 'string' && rawStudent.name.trim() ? rawStudent.name : 'Unknown',
    telegram: typeof rawStudent.telegram === 'string' ? rawStudent.telegram : '',
    school: typeof rawStudent.school === 'string' ? rawStudent.school : '',
    className:
      typeof rawStudent.className === 'string'
        ? rawStudent.className
        : typeof rawStudent.class === 'string'
          ? rawStudent.class
          : ''
  };

  if (!rawBody.taskPrompt || !rawBody.finalText) {
    res.status(400).json({
      success: false,
      error: 'Task prompt and final text are required.'
    });
    return;
  }

  if (rawBody.isPreview === true && !isAdminAuthorized(req)) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized: admin access required for preview evaluation.'
    });
    return;
  }

  try {
    const result = await evaluateEx4Core(req);
    res.json({
      success: true,
      data: {
        ...result.report,
        reportId: result.reportId,
        submissionId: result.submissionId
      }
    });
  } catch (err) {
    handleRouteAiError(
      res,
      err,
      'Article Evaluation (/evaluate)',
      'Evaluation failed.',
      studentInfo
    );
  }
});

router.post('/exercise-4/evaluate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const rawBody = (req.body ?? {}) as Record<string, unknown>;
  const rawStudent = (rawBody.student ?? {}) as Record<string, unknown>;
  const studentInfo: StudentInfo = {
    name: typeof rawStudent.name === 'string' && rawStudent.name.trim() ? rawStudent.name : 'Unknown',
    telegram: typeof rawStudent.telegram === 'string' ? rawStudent.telegram : undefined,
    school: typeof rawStudent.school === 'string' ? rawStudent.school : undefined,
    className: typeof rawStudent.className === 'string' ? rawStudent.className : undefined
  };

  try {
    const isPreview = rawBody.isPreview === true;
    if (isPreview && !isAdminAuthorized(req)) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: admin access required for preview evaluation.'
      });
      return;
    }

    const result = await evaluateEx4Core(req);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    if (err instanceof AiServiceError) {
      handleRouteAiError(
        res,
        err,
        'Article Evaluation (/exercise-4/evaluate)',
        'Evaluation failed.',
        studentInfo
      );
      return;
    }
    next(err);
  }
});

router.get('/exercise-4/reports', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
    const offset = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const includePreview = req.query.includePreview === 'true' && isAdminAuthorized(req);

    const data = await listReports({
      exerciseCode: 'ex4',
      includePreview,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0
    });

    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

router.get('/exercise-4/reports/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const report = await getReportById(String(req.params.id || ''));
    res.json({
      success: true,
      data: report
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/send-telegram-report',
  singleFileUpload('pdf'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file || !req.file.buffer) {
        res.status(400).json({ success: false, error: 'PDF file is required.' });
        return;
      }

      const authorized = isAdminAuthorized(req);
      const body = (req.body ?? {}) as Record<string, unknown>;
      let studentInfo: StudentInfo = { name: 'Student' };

      if (body.student) {
        try {
          const parsed =
            typeof body.student === 'string'
              ? (JSON.parse(body.student) as Record<string, unknown>)
              : (body.student as Record<string, unknown>);
          studentInfo = {
            name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Student',
            className: typeof parsed.className === 'string' ? parsed.className : undefined,
            school: typeof parsed.school === 'string' ? parsed.school : undefined,
            telegram:
              authorized && typeof parsed.telegram === 'string' ? parsed.telegram : undefined
          };
        } catch {
          studentInfo = { name: 'Student' };
        }
      } else {
        studentInfo = {
          name: typeof body.studentName === 'string' && body.studentName ? body.studentName : 'Student',
          className: typeof body.studentClass === 'string' ? body.studentClass : undefined,
          school: typeof body.studentSchool === 'string' ? body.studentSchool : undefined,
          telegram: authorized
            ? typeof body.telegramId === 'string'
              ? body.telegramId
              : typeof body.studentTelegram === 'string'
                ? body.studentTelegram
                : undefined
            : undefined
        };
      }

      let targetIds: string[] | undefined;
      if (authorized && body.targetIds !== undefined) {
        if (Array.isArray(body.targetIds)) {
          const ids = body.targetIds.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          );
          if (ids.length > 0) targetIds = ids;
        } else if (typeof body.targetIds === 'string' && body.targetIds.trim().length > 0) {
          try {
            const parsedIds = JSON.parse(body.targetIds) as unknown;
            if (Array.isArray(parsedIds)) {
              const ids = parsedIds.filter(
                (item): item is string => typeof item === 'string' && item.trim().length > 0
              );
              if (ids.length > 0) targetIds = ids;
            }
          } catch {
            const ids = body.targetIds
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            if (ids.length > 0) targetIds = ids;
          }
        }
      }

      let evaluation: Partial<MarkingReport> = {};
      if (body.evaluation) {
        try {
          evaluation =
            typeof body.evaluation === 'string'
              ? (JSON.parse(body.evaluation) as Partial<MarkingReport>)
              : (body.evaluation as Partial<MarkingReport>);
        } catch {
          evaluation = {};
        }
      }

      const rawText = typeof body.rawText === 'string' ? body.rawText : '';
      const finalText = typeof body.finalText === 'string' ? body.finalText : '';
      const fileName =
        req.file.originalname ||
        `EdumenAI_Report_${studentInfo.name.replace(/\s+/g, '_')}.pdf`;

      const dispatchResult = await dispatchFullReportWithPdf({
        studentInfo,
        evaluation: evaluation as MarkingReport,
        rawText,
        finalText,
        pdfBuffer: req.file.buffer,
        fileName,
        ...(targetIds ? { targetIds } : {})
      });

      res.json({
        success: true,
        data: dispatchResult
      });
    } catch (err) {
      logger.error({ err }, 'POST /api/send-telegram-report failed');
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to dispatch report to Telegram.'
      });
    }
  }
);

export default router;
