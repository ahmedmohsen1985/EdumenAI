import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getMyCreditsPayload } from '../services/credits.service.js';

const router = Router();

router.use(requireAuth);

router.get('/my', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User;
    const rawLimit =
      typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 30;
    const limit = Number.isFinite(rawLimit) ? rawLimit : 30;
    const data = await getMyCreditsPayload(authUser.id, limit);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
