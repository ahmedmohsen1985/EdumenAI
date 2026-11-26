import path from 'node:path';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { User } from '@prisma/client';
import multer from 'multer';
import {
  EvaluateRequestSchema,
  type MediaAttachment,
  type StudentInfo
} from '@edumenai/shared';
import {
  getPublishedExerciseByCode,
  HttpError,
  listPublishedExercises,
  resolveVersionForExecution
} from '../services/exercise.service.js';
import { createEvaluatedSubmission } from '../services/submission.service.js';
import {
  checkCreditEligibility,
  deductCreditsForAiUsage
} from '../services/credits.service.js';
import { isAdminAuthorized } from '../middleware/admin-auth.middleware.js';
import { prisma } from '../lib/prisma.js';
import { evaluateAssessment, runDynamicOcr } from '../ai-gateway/evaluation.pipeline.js';
import { AiServiceError, type AiFilePayload } from '../ai-gateway/index.js';
import {
  notifyParent,
  notifyStudent,
  sendTeacherAudit,
  sendTeacherError,
  sendTeacherQuotaAlert
} from '../services/telegram.service.js';
import { logger } from '../lib/logger.js';

const MAX_MEDIA_ATTACHMENTS = 4;
const MAX_MEDIA_BASE64_BYTES = 8 * 1024 * 1024;
const MAX_PERSISTED_DATA_URL_LENGTH = 600_000;

function buildAiFilePayload(
  attachment: MediaAttachment,
  fallbackIndex: number
): AiFilePayload | null {
  if (!attachment.dataUrl) {
    return null;
  }

  const match = attachment.dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/);
  if (!match) {
    throw new HttpError(
      400,
      `Invalid media data URL format for "${attachment.fileName}".`,
      'INVALID_MEDIA_DATA_URL'
    );
  }

  const mimeType = match[1].toLowerCase();
  const base64 = match[2];

  if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
    throw new HttpError(
      400,
      `Unsupported media MIME type "${mimeType}". Only images and PDFs are supported.`,
      'UNSUPPORTED_MEDIA_TYPE'
    );
  }

  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes > MAX_MEDIA_BASE64_BYTES) {
    throw new HttpError(
      400,
      `Media attachment "${attachment.fileName}" exceeds the 8 MB limit.`,
      'MEDIA_TOO_LARGE'
    );
  }

  return {
    base64,
    mimeType,
    filename: attachment.fileName || `stimulus-${fallbackIndex + 1}`
  };
}

function sanitizeFormDataForStorage(
  rawFormData: Record<string, unknown> | undefined,
  resolvedMedia: MediaAttachment[]
): Record<string, unknown> | undefined {
  if (!rawFormData && resolvedMedia.length === 0) {
    return undefined;
  }

  const cleaned: Record<string, unknown> = {};
  if (rawFormData) {
    for (const [key, value] of Object.entries(rawFormData)) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'dataUrl' in value &&
        typeof (value as Record<string, unknown>).dataUrl === 'string' &&
        ((value as Record<string, unknown>).dataUrl as string).length > 4096
      ) {
        const record = value as Record<string, unknown>;
        cleaned[key] = {
          source: record.source ?? 'student',
          fileName: record.fileName ?? 'attachment',
          mimeType: record.mimeType ?? 'application/octet-stream',
          ...(typeof record.presetBlockId === 'string'
            ? { presetBlockId: record.presetBlockId }
            : {}),
          ...(typeof record.sizeBytes === 'number' ? { sizeBytes: record.sizeBytes } : {})
        };
      } else {
        cleaned[key] = value;
      }
    }
  }

  if (resolvedMedia.length > 0) {
    cleaned._mediaAttachments = resolvedMedia.map((item): MediaAttachment => {
      if (item.source === 'preset') {
        return {
          source: 'preset',
          ...(item.presetBlockId ? { presetBlockId: item.presetBlockId } : {}),
          fileName: item.fileName,
          mimeType: item.mimeType
        };
      }

      if (item.mimeType === 'application/pdf') {
        return {
          source: 'student',
          mimeType: 'application/pdf',
          fileName: item.fileName,
          ...(typeof item.sizeBytes === 'number' ? { sizeBytes: item.sizeBytes } : {}),
          omittedFromStorage: true
        };
      }

      if (item.dataUrl && item.dataUrl.length <= MAX_PERSISTED_DATA_URL_LENGTH) {
        return {
          source: 'student',
          dataUrl: item.dataUrl,
          mimeType: item.mimeType,
          fileName: item.fileName,
          ...(typeof item.sizeBytes === 'number' ? { sizeBytes: item.sizeBytes } : {})
        };
      }

      return {
        source: 'student',
        mimeType: item.mimeType,
        fileName: item.fileName,
        ...(typeof item.sizeBytes === 'number' ? { sizeBytes: item.sizeBytes } : {}),
        omittedFromStorage: true
      };
    });
  }

  return cleaned;
}

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
    const authUser = res.locals.authUser as User | undefined;
    const exercises = await listPublishedExercises({ viewerUser: authUser ?? null });
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
    const authUser = res.locals.authUser as User | undefined;
    const exercise = await getPublishedExerciseByCode(code, authUser ?? null);
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
      const authorized = isAdminAuthorized(req, res);
      const authUser = res.locals.authUser as User | undefined;
      const isActiveInstructor = Boolean(
        authUser && authUser.role === 'INSTRUCTOR' && authUser.accountStatus === 'ACTIVE'
      );

      if (isPreview || versionId) {
        if (!authorized && !authUser) {
          res.status(401).json({
            success: false,
            error: 'Unauthorized: admin or instructor access required for preview or draft execution.'
          });
          return;
        }
        if (!authorized && !isActiveInstructor) {
          res.status(403).json({
            success: false,
            code: 'FORBIDDEN',
            error: 'Only administrators or active instructors can preview or run draft versions.'
          });
          return;
        }
      }

      if (!isPreview) {
        if (!authUser) {
          res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            error: 'Authentication is required to run OCR.'
          });
          return;
        }
        if (authUser.accountStatus !== 'ACTIVE') {
          res.status(403).json({
            success: false,
            code: 'ACCOUNT_NOT_ACTIVE',
            error: 'Your account is not active.'
          });
          return;
        }
      }

      const resolved = await resolveVersionForExecution(code, {
        versionId,
        allowDraft: Boolean(authorized || isActiveInstructor)
      });

      if ((isPreview || versionId) && !authorized && resolved.exercise.ownerId !== authUser?.id) {
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          error: 'You can only preview or run drafts for exercises you own.'
        });
        return;
      }

      const promptEntry = resolved.promptEntries.find((entry) => entry.key === promptKey);
      if (!promptEntry) {
        res.status(404).json({
          success: false,
          error: `Prompt entry "${promptKey}" not found in exercise "${code}".`
        });
        return;
      }

      if (!isPreview && authUser) {
        await checkCreditEligibility(authUser, resolved.exercise.ownerId);
      }

      const mimeType = req.file.mimetype || 'application/octet-stream';
      const ocrResult = await runDynamicOcr({
        fileBuffer: req.file.buffer,
        mimeType,
        promptEntry
      });

      if (!isPreview && authUser) {
        try {
          await deductCreditsForAiUsage({
            studentUser: authUser,
            instructorId: resolved.exercise.ownerId,
            tokensUsed: ocrResult.usage?.totalTokens ?? 0,
            operation: 'ocr'
          });
        } catch (billingErr: unknown) {
          logger.warn({ err: billingErr, code }, 'Failed to deduct OCR credits');
        }
      }

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
    const authorized = isAdminAuthorized(req, res);
    const authUser = res.locals.authUser as User | undefined;
    const isActiveInstructor = Boolean(
      authUser && authUser.role === 'INSTRUCTOR' && authUser.accountStatus === 'ACTIVE'
    );

    if (isPreview || parsedBody.versionId) {
      if (!authorized && !authUser) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: admin or instructor access required for preview evaluation.'
        });
        return;
      }
      if (!authorized && !isActiveInstructor) {
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          error: 'Only administrators or active instructors can preview or evaluate draft versions.'
        });
        return;
      }
    }

    if (!isPreview) {
      if (!authUser) {
        res.status(401).json({
          success: false,
          code: 'AUTH_REQUIRED',
          error: 'Authentication is required to submit an assessment.'
        });
        return;
      }
      if (authUser.accountStatus !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          code: 'ACCOUNT_NOT_ACTIVE',
          error: 'Your account is not active.'
        });
        return;
      }
    }

    const resolvedStudent: StudentInfo = authUser
      ? {
          name:
            (authUser.name && authUser.name.trim()) ||
            parsedBody.student.name ||
            'Student',
          ...(authUser.telegramId || parsedBody.student.telegram
            ? { telegram: authUser.telegramId || parsedBody.student.telegram }
            : {}),
          ...(authUser.school || parsedBody.student.school
            ? { school: authUser.school || parsedBody.student.school }
            : {}),
          ...(authUser.className || parsedBody.student.className
            ? { className: authUser.className || parsedBody.student.className }
            : {})
        }
      : parsedBody.student;

    let resolvedExerciseTitle: string | undefined;

    try {
      const resolved = await resolveVersionForExecution(code, {
        versionId: parsedBody.versionId,
        allowDraft: Boolean(authorized || isActiveInstructor)
      });

      if (
        (isPreview || parsedBody.versionId) &&
        !authorized &&
        resolved.exercise.ownerId !== authUser?.id
      ) {
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          error: 'You can only preview or evaluate drafts for exercises you own.'
        });
        return;
      }

      resolvedExerciseTitle = resolved.exercise.title;

      let resolvedInstructorId: string | null = null;
      if (resolved.exercise.ownerId) {
        const isOwnerOrAdmin =
          authorized ||
          authUser?.role === 'ADMIN' ||
          authUser?.id === resolved.exercise.ownerId;
        if (!isOwnerOrAdmin) {
          if (!authUser) {
            res.status(403).json({
              success: false,
              code: 'FORBIDDEN',
              error: 'You are not authorized to submit to this instructor exercise.'
            });
            return;
          }
          const approved = await prisma.studentInstructor.findFirst({
            where: {
              studentId: authUser.id,
              instructorId: resolved.exercise.ownerId,
              status: 'APPROVED'
            },
            select: { id: true }
          });
          if (!approved) {
            res.status(403).json({
              success: false,
              code: 'FORBIDDEN',
              error: 'You must be an approved student of this instructor to submit.'
            });
            return;
          }
        }
        resolvedInstructorId = resolved.exercise.ownerId;
      } else if (parsedBody.instructorId) {
        if (!authUser) {
          res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            error: 'Authentication is required to submit to an instructor.'
          });
          return;
        }
        const approved = await prisma.studentInstructor.findFirst({
          where: {
            studentId: authUser.id,
            instructorId: parsedBody.instructorId,
            status: 'APPROVED'
          },
          select: { id: true }
        });
        if (!approved) {
          res.status(403).json({
            success: false,
            code: 'FORBIDDEN',
            error: 'You are not an approved student of the selected instructor.'
          });
          return;
        }
        resolvedInstructorId = parsedBody.instructorId;
      }

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

      if (!isPreview && authUser) {
        await checkCreditEligibility(authUser, resolvedInstructorId);
      }

      const incomingAttachments: MediaAttachment[] = parsedBody.mediaAttachments ?? [];
      const presetBlocksMap = new Map<
        string,
        { dataUrl: string; fileName: string; mimeType: string; fieldKey: string }
      >();

      for (const block of resolved.templateSchema.blocks) {
        if (block.type !== 'media_upload') continue;
        const blockProps = (block.props ?? {}) as Record<string, unknown>;
        const presetDataUrl =
          typeof blockProps.presetImageDataUrl === 'string'
            ? blockProps.presetImageDataUrl.trim()
            : '';
        if (!presetDataUrl) continue;

        presetBlocksMap.set(block.id, {
          dataUrl: presetDataUrl,
          fileName:
            typeof blockProps.presetImageName === 'string' && blockProps.presetImageName.trim()
              ? blockProps.presetImageName.trim()
              : 'stimulus.jpg',
          mimeType:
            typeof blockProps.presetImageMimeType === 'string' &&
            blockProps.presetImageMimeType.trim()
              ? blockProps.presetImageMimeType.trim()
              : 'image/jpeg',
          fieldKey: block.fieldKey || block.id
        });
      }

      const resolvedMediaAttachments: MediaAttachment[] = [];
      const includedPresetIds = new Set<string>();

      for (const item of incomingAttachments) {
        if (item.source === 'preset' && item.presetBlockId) {
          const preset = presetBlocksMap.get(item.presetBlockId);
          if (preset) {
            includedPresetIds.add(item.presetBlockId);
            resolvedMediaAttachments.push({
              source: 'preset',
              presetBlockId: item.presetBlockId,
              dataUrl: item.dataUrl || preset.dataUrl,
              fileName: item.fileName || preset.fileName,
              mimeType: item.mimeType || preset.mimeType
            });
            continue;
          }
        }
        resolvedMediaAttachments.push(item);
      }

      for (const [blockId, preset] of presetBlocksMap.entries()) {
        if (includedPresetIds.has(blockId)) continue;
        const fieldVal = parsedBody.formData?.[preset.fieldKey];
        const overriddenByStudent =
          fieldVal &&
          typeof fieldVal === 'object' &&
          !Array.isArray(fieldVal) &&
          (fieldVal as Record<string, unknown>).source === 'student';
        if (overriddenByStudent) continue;

        resolvedMediaAttachments.push({
          source: 'preset',
          presetBlockId: blockId,
          dataUrl: preset.dataUrl,
          fileName: preset.fileName,
          mimeType: preset.mimeType
        });
      }

      const cappedMedia = resolvedMediaAttachments.slice(0, MAX_MEDIA_ATTACHMENTS);
      const aiFiles: AiFilePayload[] = [];
      for (let idx = 0; idx < cappedMedia.length; idx += 1) {
        const payload = buildAiFilePayload(cappedMedia[idx], idx);
        if (payload) {
          aiFiles.push(payload);
        }
      }

      const persistedFormData = sanitizeFormDataForStorage(parsedBody.formData, cappedMedia);
      const persistedTaskPrompt =
        parsedBody.taskPrompt.trim() || 'Stimulus-based assessment (media attached)';

      const evaluationResult = await evaluateAssessment({
        studentName: resolvedStudent.name,
        taskPrompt: parsedBody.taskPrompt,
        studentText: parsedBody.finalText,
        ...(systemPrompts.length > 0 ? { systemPrompts } : {}),
        ...(markingSchema ? { markingSchema } : {}),
        marksLimits,
        ...(aiFiles.length > 0 ? { files: aiFiles } : {})
      });

      const persisted = await createEvaluatedSubmission({
        exerciseId: resolved.exercise.id,
        promptVersionId: resolved.version.id,
        studentId: authUser?.id ?? null,
        instructorId: resolvedInstructorId,
        student: resolvedStudent,
        taskPrompt: persistedTaskPrompt,
        rawText: parsedBody.rawText,
        finalText: parsedBody.finalText,
        transcriptionMeta: parsedBody.transcriptionMeta,
        isPreview,
        formData: persistedFormData,
        ...(parsedBody.integrityLog ? { integrityLog: parsedBody.integrityLog } : {}),
        evaluationResult
      });

      let creditDeduction: {
        creditsDeducted: number;
        balanceAfter: number;
        isLowCredit: boolean;
      } | null = null;

      if (!isPreview && authUser) {
        try {
          creditDeduction = await deductCreditsForAiUsage({
            studentUser: authUser,
            instructorId: resolvedInstructorId,
            submissionId: persisted.submissionId,
            tokensUsed: evaluationResult.usage?.totalTokens ?? 0,
            operation: 'evaluation'
          });
        } catch (billingErr: unknown) {
          logger.warn({ err: billingErr, code }, 'Failed to deduct evaluation credits');
        }
      }

      if (!isPreview) {
        void (async () => {
          try {
            if (resolvedStudent.telegram) {
              await notifyStudent(
                resolvedStudent.telegram,
                resolvedStudent.name,
                evaluationResult.report,
                resolved.exercise.title
              );
            }
            const parentTg = authUser?.parentTelegramId?.trim();
            if (parentTg && parentTg !== resolvedStudent.telegram?.trim()) {
              await notifyParent(
                parentTg,
                resolvedStudent.name,
                evaluationResult.report,
                resolved.exercise.title
              );
            }
            await sendTeacherAudit(
              resolvedStudent,
              parsedBody.rawText ?? '',
              parsedBody.finalText,
              evaluationResult.report,
              parsedBody.telegramTargetIds,
              resolved.exercise.title,
              resolvedInstructorId
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
          usage: evaluationResult.usage,
          ...(creditDeduction ? { credits: creditDeduction } : {})
        }
      });
    } catch (err) {
      if (err instanceof AiServiceError) {
        handleRouteAiError(
          res,
          err,
          `Exercise Evaluation (/exercises/${code}/evaluate)`,
          'Evaluation failed.',
          isPreview ? undefined : resolvedStudent,
          resolvedExerciseTitle
        );
        return;
      }
      next(err);
    }
  }
);

export default router;
