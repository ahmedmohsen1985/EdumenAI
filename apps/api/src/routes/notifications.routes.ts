import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notification.service.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User;
    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 30;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
    const data = await listUserNotifications(authUser.id, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User;
    const id = String(req.params.id || '');
    const data = await markNotificationRead(authUser.id, id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User;
    const data = await markAllNotificationsRead(authUser.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
