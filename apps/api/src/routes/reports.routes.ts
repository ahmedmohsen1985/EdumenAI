import path from 'node:path';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import multer from 'multer';
import type { MarkingReport, StudentInfo } from '@edumenai/shared';
import { getReportById, listReports } from '../services/submission.service.js';
import { dispatchFullReportWithPdf } from '../services/telegram.service.js';
import { isAdminAuthorized } from '../middleware/admin-auth.middleware.js';

const router = Router();

function isAllowedPdf(file: Express.Multer.File | undefined): boolean {
  if (!file) return false;
  if (file.mimetype === 'application/pdf') return true;
  return path.extname(file.originalname).toLowerCase() === '.pdf';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024 // 15 MB
  },
  fileFilter: (_req, file, cb) => {
    if (isAllowedPdf(file)) {
      cb(null, true);
      return;
    }
    const err = new Error('Only PDF documents are allowed.') as Error & { statusCode?: number };
    err.statusCode = 400;
    cb(err);
  }
});

function singleFileUpload(fieldName: string): RequestHandler {
  return upload.single(fieldName) as unknown as RequestHandler;
}

function parseTargetIds(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) {
    const ids = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    return ids.length > 0 ? ids : undefined;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const ids = parsed.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        );
        return ids.length > 0 ? ids : undefined;
      }
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return undefined;
}

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const exerciseCode =
      typeof req.query.exerciseCode === 'string' && req.query.exerciseCode.trim()
        ? req.query.exerciseCode.trim()
        : undefined;
    const includePreview = req.query.includePreview === 'true' && isAdminAuthorized(req);
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;
    const offset = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;

    const data = await listReports({
      exerciseCode,
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

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
  '/:id/send-telegram',
  singleFileUpload('pdf'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await getReportById(String(req.params.id || ''));
      const body = (req.body ?? {}) as Record<string, unknown>;
      const authorized = isAdminAuthorized(req);

      const studentTelegram = authorized
        ? typeof body.studentTelegram === 'string' && body.studentTelegram.trim()
          ? body.studentTelegram.trim()
          : typeof body.telegramId === 'string' && body.telegramId.trim()
            ? body.telegramId.trim()
            : undefined
        : undefined;

      const targetIds = authorized ? parseTargetIds(body.targetIds) : undefined;

      const studentInfo: StudentInfo = {
        name: report.studentName,
        ...(report.studentClass ? { className: report.studentClass } : {}),
        ...(report.studentSchool ? { school: report.studentSchool } : {}),
        ...(studentTelegram ? { telegram: studentTelegram } : {})
      };

      const evaluation: MarkingReport = {
        marks: report.marks,
        justification: report.justification,
        errors: report.errors,
        content_feedback: report.contentFeedback,
        corrected_version: report.correctedVersion
      };

      const fileName =
        req.file?.originalname ||
        `EdumenAI_Report_${report.studentName.replace(/\s+/g, '_')}.pdf`;

      const dispatchResult = await dispatchFullReportWithPdf({
        studentInfo,
        evaluation,
        rawText: report.rawText ?? '',
        finalText: report.finalText,
        pdfBuffer: req.file?.buffer,
        fileName,
        targetIds
      });

      res.json({
        success: true,
        data: dispatchResult
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
