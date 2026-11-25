import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import { z } from 'zod';
import {
  CreateTelegramTargetSchema,
  UpdateTelegramTargetSchema
} from '@edumenai/shared';
import { requireRole } from '../middleware/auth.middleware.js';
import {
  createExerciseInstructor,
  deleteExerciseInstructor,
  duplicateExerciseInstructor,
  getExerciseInstructor,
  listExercisesForInstructor,
  publishExerciseInstructor,
  saveExerciseDraftInstructor
} from '../services/exercise.service.js';
import {
  getInstructorOverviewStats,
  listReports
} from '../services/submission.service.js';
import {
  createTelegramTarget,
  deleteTelegramTarget,
  getInstructorTelegramStatus,
  listTelegramTargets,
  sendTelegramTestMessage,
  updateTelegramTarget
} from '../services/telegram.service.js';

const router = Router();

router.use(requireRole('INSTRUCTOR', 'ADMIN'));

const PublishExerciseBodySchema = z
  .object({
    versionId: z.string().min(1).optional()
  })
  .optional();

const TelegramTestSchema = z.object({
  chatId: z.string().trim().min(1),
  message: z.string().max(1000).optional()
});

function parseBoundedInt(
  raw: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof raw !== 'string') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

router.get('/overview', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const stats = await getInstructorOverviewStats(reqUser.id);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
});

router.get('/submissions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const exerciseCode =
      typeof req.query.exerciseCode === 'string' && req.query.exerciseCode.trim()
        ? req.query.exerciseCode.trim()
        : undefined;
    const studentId =
      typeof req.query.studentId === 'string' && req.query.studentId.trim()
        ? req.query.studentId.trim()
        : undefined;
    const search =
      typeof req.query.search === 'string' && req.query.search.trim()
        ? req.query.search.trim()
        : undefined;
    const limit = parseBoundedInt(req.query.limit, 25, 1, 100);
    const offset = parseBoundedInt(req.query.offset, 0, 0, 100_000);

    const data = await listReports({
      viewerUser: reqUser,
      exerciseCode,
      studentId,
      search,
      limit,
      offset
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/exercises', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const data = await listExercisesForInstructor(reqUser.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const created = await createExerciseInstructor(reqUser.id, req.body);
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.get('/exercises/:code', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const detail = await getExerciseInstructor(reqUser.id, req.params.code ?? '');
    res.json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
});

router.put('/exercises/:code/draft', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const saved = await saveExerciseDraftInstructor(
      reqUser.id,
      req.params.code ?? '',
      req.body
    );
    res.json({ success: true, data: saved });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises/:code/publish', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const parsed = PublishExerciseBodySchema.parse(req.body);
    const published = await publishExerciseInstructor(
      reqUser.id,
      req.params.code ?? '',
      parsed?.versionId
    );
    res.json({ success: true, data: published });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises/:code/duplicate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const duplicated = await duplicateExerciseInstructor(
      reqUser.id,
      req.params.code ?? '',
      req.body
    );
    res.status(201).json({ success: true, data: duplicated });
  } catch (err) {
    next(err);
  }
});

router.delete('/exercises/:code', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const deleted = await deleteExerciseInstructor(reqUser.id, req.params.code ?? '');
    res.json({ success: true, data: deleted });
  } catch (err) {
    next(err);
  }
});

router.get('/telegram', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const [config, targets] = await Promise.all([
      getInstructorTelegramStatus(),
      listTelegramTargets({ ownerId: reqUser.id })
    ]);
    res.json({ success: true, data: { config, targets } });
  } catch (err) {
    next(err);
  }
});

router.post('/telegram/targets', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const input = CreateTelegramTargetSchema.parse(req.body ?? {});
    const target = await createTelegramTarget(input, { ownerId: reqUser.id });
    res.status(201).json({ success: true, data: target });
  } catch (err) {
    next(err);
  }
});

router.put('/telegram/targets/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const input = UpdateTelegramTargetSchema.parse(req.body ?? {});
    const target = await updateTelegramTarget(req.params.id ?? '', input, {
      ownerId: reqUser.id
    });
    res.json({ success: true, data: target });
  } catch (err) {
    next(err);
  }
});

router.delete('/telegram/targets/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reqUser = res.locals.authUser as User;
    const deleted = await deleteTelegramTarget(req.params.id ?? '', { ownerId: reqUser.id });
    res.json({ success: true, data: deleted });
  } catch (err) {
    next(err);
  }
});

router.post('/telegram/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = TelegramTestSchema.parse(req.body ?? {});
    const result = await sendTelegramTestMessage(parsed.chatId, parsed.message);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
