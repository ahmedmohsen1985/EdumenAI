import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  deleteEnrollment,
  listMyEnrollments,
  requestInstructorEnrollment,
  respondToEnrollment
} from '../services/enrollment.service.js';

const router = Router();

router.get('/my', requireAuth, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User;
    const data = await listMyEnrollments(authUser);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/request',
  requireRole('STUDENT'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const data = await requestInstructorEnrollment(authUser, req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/respond',
  requireRole('INSTRUCTOR', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const id = String(req.params.id || '');
      const data = await respondToEnrollment(authUser, id, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const id = String(req.params.id || '');
      const data = await deleteEnrollment(authUser, id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
