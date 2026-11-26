import { Router, type NextFunction, type Request, type Response } from 'express';
import type { User } from '@prisma/client';
import {
  clearSessionCookie,
  clearTrustedDeviceCookie,
  extractCookieValue,
  extractSessionToken,
  requireAuth,
  setSessionCookie,
  setTrustedDeviceCookie,
  TRUSTED_DEVICE_COOKIE_NAME
} from '../middleware/auth.middleware.js';
import {
  beginTotpSetup,
  changeMyPassword,
  confirmTotpSetup,
  disableTotp,
  getMePayload,
  listPublicInstructors,
  loginUser,
  logoutByToken,
  registerUser,
  requestPasswordReset,
  resendAuthOtp,
  resetPasswordWithToken,
  revokeTrustedDevices,
  updateMyProfile,
  verifyLogin2fa,
  verifyRegistrationOtp
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
          unreadNotificationCount: 0,
          lowCreditThreshold: 10,
          enforceCredits: false,
          isLowCredit: false
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
    const result = await registerUser(req.body);
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-registration', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, sessionToken, trustedDeviceToken } = await verifyRegistrationOtp(
      req.body,
      getClientMeta(req)
    );
    setSessionCookie(res, sessionToken);
    if (trustedDeviceToken) {
      setTrustedDeviceCookie(res, trustedDeviceToken);
    }
    res.json({
      success: true,
      data: { user }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const trustedDeviceToken = extractCookieValue(
      req.headers.cookie,
      TRUSTED_DEVICE_COOKIE_NAME
    );
    const result = await loginUser(req.body, {
      ...getClientMeta(req),
      trustedDeviceToken
    });

    if (result.requiresTwoFactor) {
      res.json({
        success: true,
        data: result
      });
      return;
    }

    setSessionCookie(res, result.sessionToken);
    res.json({
      success: true,
      data: {
        requiresTwoFactor: false,
        user: result.user
      }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-2fa', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { user, sessionToken, trustedDeviceToken } = await verifyLogin2fa(
      req.body,
      getClientMeta(req)
    );
    setSessionCookie(res, sessionToken);
    if (trustedDeviceToken) {
      setTrustedDeviceCookie(res, trustedDeviceToken);
    }
    res.json({
      success: true,
      data: { user }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-otp', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await resendAuthOtp(req.body);
    res.json({
      success: true,
      data: result
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
    clearTrustedDeviceCookie(res);
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

router.post(
  '/2fa/totp/setup',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const data = await beginTotpSetup(authUser.id);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/2fa/totp/verify',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const data = await confirmTotpSetup(authUser.id, req.body);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/2fa/totp/disable',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const data = await disableTotp(authUser.id, req.body);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/trusted-devices',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authUser = res.locals.authUser as User;
      const data = await revokeTrustedDevices(authUser.id);
      clearTrustedDeviceCookie(res);
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
