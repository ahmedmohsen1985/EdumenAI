import path from 'node:path';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import { EvaluateRequestSchema, type StudentInfo } from '@edumenai/shared';
import {
  getPublishedExerciseByCode,
  listPublishedExercises,
  resolveVersionForExecution
} from '../services/exercise.service.js';
import { createEvaluatedSubmission } from '../services/submission.service.js';
import { isAdminAuthorized } from '../middleware/admin-auth.middleware.js';
import { evaluateArticle, runDynamicOcr } from '../ai-gateway/exercise4.pipeline.js';
import { AiServiceError } from '../ai-gateway/index.js';
import {
  notifyStudent,
  sendTeacherAudit,
  sendTeacherError,
  sendTeacherQuotaAlert
} from '../services/telegram.service.js';
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
  studentInfo?: StudentInfo,
  exerciseTitle?: string
): void {
  logger.error({ err, operationLabel }, 'AI route execution failed');

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
    void sendTeacherError(studentInfo, message, exerciseTitle).catch((notifyErr: unknown) => {
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

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const exercises = await listPublishedExercises();
    res.json({
      success: true,
      data: exercises
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:code', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    const exercise = await getPublishedExerciseByCode(code);
    res.json({
      success: true,
      data: exercise
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:code/ocr',
  singleFileUpload('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = String(req.params.code || '');
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file provided.' });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const promptKey = typeof body.promptKey === 'string' ? body.promptKey.trim() : '';
      if (!promptKey) {
        res.status(400).json({ success: false, error: 'promptKey is required.' });
        return;
      }

      const versionId =
        typeof body.versionId === 'string' && body.versionId.trim()
          ? body.versionId.trim()
          : undefined;
      const isPreview = body.isPreview === true || body.isPreview === 'true';
      const authorized = isAdminAuthorized(req);

      if ((isPreview || versionId) && !authorized) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: admin access required for preview or draft execution.'
        });
        return;
      }

      const resolved = await resolveVersionForExecution(code, {
        versionId,
        allowDraft: authorized
      });

      const promptEntry = resolved.promptEntries.find((entry) => entry.key === promptKey);
      if (!promptEntry) {
        res.status(404).json({
          success: false,
          error: `Prompt entry "${promptKey}" not found in exercise "${code}".`
        });
        return;
      }

      const mimeType = req.file.mimetype || 'application/octet-stream';
      const ocrResult = await runDynamicOcr({
        fileBuffer: req.file.buffer,
        mimeType,
        promptEntry
      });

      res.json({
        success: true,
        data: {
          text: ocrResult.text,
          mimeType,
          promptKey,
          transcriptionMeta: ocrResult.transcriptionMeta ?? null,
          provider: ocrResult.provider,
          model: ocrResult.model,
          usage: ocrResult.usage,
          latencyMs: ocrResult.usage.latencyMs
        }
      });
    } catch (err) {
      if (err instanceof AiServiceError) {
        handleRouteAiError(res, err, `Dynamic OCR (/exercises/${req.params.code}/ocr)`, 'OCR failed.');
        return;
      }
      next(err);
    }
  }
);

router.post(
  '/:code/evaluate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const code = String(req.params.code || '');
    let parsedBody: ReturnType<typeof EvaluateRequestSchema.parse>;

    try {
      parsedBody = EvaluateRequestSchema.parse(req.body ?? {});
    } catch (err) {
      next(err);
      return;
    }

    const isPreview = Boolean(parsedBody.isPreview);
    const authorized = isAdminAuthorized(req);

    if (isPreview && !authorized) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: admin access required for preview evaluation.'
      });
      return;
    }

    let resolvedExerciseTitle: string | undefined;

    try {
      const resolved = await resolveVersionForExecution(code, {
        versionId: parsedBody.versionId,
        allowDraft: authorized
      });
      resolvedExerciseTitle = resolved.exercise.title;

      const requestedKeys = parsedBody.promptKeys;
      const evalEntries =
        requestedKeys && requestedKeys.length > 0
          ? resolved.promptEntries.filter((e) => requestedKeys.includes(e.key))
          : resolved.promptEntries.filter((e) => e.taskType === 'evaluation');

      const systemPrompts = evalEntries.map((e) => e.content).filter((c) => c.trim().length > 0);
      const entrySchema = evalEntries.find(
        (e) => e.outputSchema && typeof e.outputSchema === 'object'
      )?.outputSchema;
      const versionSchema =
        resolved.version.markingSchema &&
        typeof resolved.version.markingSchema === 'object' &&
        !Array.isArray(resolved.version.markingSchema)
          ? (resolved.version.markingSchema as Record<string, unknown>)
          : undefined;
      const markingSchema = entrySchema ?? versionSchema;

      const evalBlock = resolved.templateSchema.blocks.find(
        (b) => b.type === 'examiner_evaluation'
      );
      const evalProps = (evalBlock?.props ?? {}) as Record<string, unknown>;
      const toPosInt = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined;
      };
      const contentMax = toPosInt(evalProps.contentMax);
      const languageMax = toPosInt(evalProps.languageMax);
      const evalTotal = toPosInt(evalProps.totalMarks);
      const totalMax = evalTotal ?? resolved.exercise.totalMarks;
      const marksLimits = {
        ...(contentMax !== undefined ? { contentMax } : {}),
        ...(languageMax !== undefined ? { languageMax } : {}),
        totalMax
      };

      const evaluationResult = await evaluateArticle({
        studentName: parsedBody.student.name,
        taskPrompt: parsedBody.taskPrompt,
        studentText: parsedBody.finalText,
        ...(systemPrompts.length > 0 ? { systemPrompts } : {}),
        ...(markingSchema ? { markingSchema } : {}),
        marksLimits
      });

      const persisted = await createEvaluatedSubmission({
        exerciseId: resolved.exercise.id,
        promptVersionId: resolved.version.id,
        student: parsedBody.student,
        taskPrompt: parsedBody.taskPrompt,
        rawText: parsedBody.rawText,
        finalText: parsedBody.finalText,
        transcriptionMeta: parsedBody.transcriptionMeta,
        isPreview,
        formData: parsedBody.formData,
        evaluationResult
      });

      if (!isPreview) {
        void (async () => {
          try {
            if (parsedBody.student.telegram) {
              await notifyStudent(
                parsedBody.student.telegram,
                parsedBody.student.name,
                evaluationResult.report,
                resolved.exercise.title
              );
            }
            await sendTeacherAudit(
              parsedBody.student,
              parsedBody.rawText ?? '',
              parsedBody.finalText,
              evaluationResult.report,
              parsedBody.telegramTargetIds,
              resolved.exercise.title
            );
          } catch (notifyErr: unknown) {
            logger.error({ err: notifyErr, code }, 'Post-evaluation Telegram notification failed');
          }
        })();
      }

      res.json({
        success: true,
        data: {
          reportId: persisted.reportId,
          submissionId: persisted.submissionId,
          isPreview: persisted.isPreview,
          report: evaluationResult.report,
          provider: evaluationResult.provider,
          model: evaluationResult.model,
          usage: evaluationResult.usage
        }
      });
    } catch (err) {
      if (err instanceof AiServiceError) {
        handleRouteAiError(
          res,
          err,
          `Exercise Evaluation (/exercises/${code}/evaluate)`,
          'Evaluation failed.',
          isPreview ? undefined : parsedBody.student,
          resolvedExerciseTitle
        );
        return;
      }
      next(err);
    }
  }
);

export default router;
