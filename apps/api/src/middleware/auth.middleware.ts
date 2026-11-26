import type { NextFunction, Request, Response } from 'express';
import type { User, UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import {
  getSessionContext,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS
} from '../services/auth.service.js';

export function extractCookieValue(cookieHeader: string | undefined, name: string): string {
  if (!cookieHeader) return '';
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    if (key === name) {
      const val = pair.slice(idx + 1).trim();
      try {
        return decodeURIComponent(val);
      } catch {
        return val;
      }
    }
  }
  return '';
}

export function extractSessionToken(req: Request): string {
  const cookieToken = extractCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  if (cookieToken) {
    return cookieToken;
  }

  const authHeader = req.header('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const bearer = match?.[1]?.trim() ?? '';
    const adminKey = env.adminAccessKey.trim();
    if (bearer && (!adminKey || bearer !== adminKey)) {
      return bearer;
    }
  }

  return '';
}

function resolveCookieOptions() {
  const sameSite = env.cookieSameSite;
  const secure = env.nodeEnv === 'production' || sameSite === 'none';
  const domain = env.cookieDomain.trim();

  return {
    httpOnly: true,
    path: '/',
    sameSite,
    secure,
    ...(domain ? { domain } : {})
  };
}

export const TRUSTED_DEVICE_COOKIE_NAME = 'edumenai_trusted_device';
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...resolveCookieOptions(),
    maxAge: SESSION_TTL_MS
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, resolveCookieOptions());
}

export function setTrustedDeviceCookie(res: Response, token: string): void {
  res.cookie(TRUSTED_DEVICE_COOKIE_NAME, token, {
    ...resolveCookieOptions(),
    maxAge: TRUSTED_DEVICE_TTL_MS
  });
}

export function clearTrustedDeviceCookie(res: Response): void {
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, resolveCookieOptions());
}

export async function attachAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractSessionToken(req);
    if (token) {
      const context = await getSessionContext(token);
      if (context) {
        res.locals.authUser = context.user;
        res.locals.authSessionId = context.sessionId;
      }
    }
  } catch (err: unknown) {
    logger.warn({ err }, 'Failed to resolve auth session middleware');
  }

  next();
}

export function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.authUser as User | undefined;

  if (!user) {
    res.status(401).json({
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Authentication is required.'
    });
    return;
  }

  if (user.accountStatus === 'SUSPENDED') {
    res.status(403).json({
      success: false,
      code: 'ACCOUNT_SUSPENDED',
      error: 'Your account has been suspended.'
    });
    return;
  }

  next();
}

export function requireRole(...roles: UserRole[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.authUser as User | undefined;

    if (!user) {
      res.status(401).json({
        success: false,
        code: 'AUTH_REQUIRED',
        error: 'Authentication is required.'
      });
      return;
    }

    if (user.accountStatus === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        error: 'Your account has been suspended.'
      });
      return;
    }

    if (user.accountStatus === 'PENDING_APPROVAL') {
      res.status(403).json({
        success: false,
        code: 'ACCOUNT_PENDING_APPROVAL',
        error: 'Your account is pending administrator approval.'
      });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        error: 'You do not have permission to perform this action.'
      });
      return;
    }

    next();
  };
}
