import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import {
  clearSessionCookie,
  extractSessionToken,
  requireAuth,
  setSessionCookie
} from '../middleware/auth.middleware.js';
import {
  changeMyPassword,
  getMePayload,
  listPublicInstructors,
  loginUser,
  logoutByToken,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  updateMyProfile
} from '../services/auth.service.js';

const router = Router();

function getClientMeta(req: Request) {
  return {
    userAgent: req.get('user-agent'),
    ipAddress: req.ip
  };
}

router.get('/me', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authUser = res.locals.authUser as User | undefined;
    if (!authUser) {
      res.json({
        success: true,
        data: {
          user: null,
          approvedInstructors: [],
          pendingInstructorCount: 0,
          unreadNotificationCount: 0
        }
      });
      return;
    }

    const payload = await getMePayload(authUser.id);
    res.json({
      success: true,
      data: payload
    });
  } catch (err) {
    next(err);
  }
});

router.get('/instructors', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const instructors = await listPublicInstructors();
    res.json({
      success: true,
      data: instructors
    });
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, sessionToken } = await registerUser(req.body, getClientMeta(req));
    setSessionCookie(res, sessionToken);
    res.status(201).json({
      success: true,
      data: { user }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, sessionToken } = await loginUser(req.body, getClientMeta(req));
    setSessionCookie(res, sessionToken);
    res.json({
      success: true,
      data: { user }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = extractSessionToken(req);
    if (token) {
      await logoutByToken(token);
    }
    clearSessionCookie(res);
    res.json({
      success: true,
      data: { loggedOut: true }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await requestPasswordReset(req.body);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await resetPasswordWithToken(req.body);
    clearSessionCookie(res);
    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/profile',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const user = await updateMyProfile(authUser.id, req.body);
      res.json({
        success: true,
        data: { user }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/change-password',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const sessionId =
        typeof res.locals.authSessionId === 'string' ? res.locals.authSessionId : undefined;
      await changeMyPassword(authUser.id, req.body, sessionId);
      res.json({
        success: true,
        data: { changed: true }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
