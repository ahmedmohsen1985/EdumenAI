import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { User } from '@prisma/client';
import { env } from '../config/env.js';
import { extractCookieValue } from './auth.middleware.js';

const ADMIN_COOKIE_NAME = 'edumenai_admin_key';

function extractPresentedAdminKey(req: Request): string {
  const headerKey = req.header('x-admin-key');
  if (headerKey && headerKey.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.header('authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  return extractCookieValue(req.headers.cookie, ADMIN_COOKIE_NAME);
}

function sha256Digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function hasValidPresentedAdminKey(req: Request): boolean {
  const configuredKey = env.adminAccessKey.trim();
  if (!configuredKey) return false;

  const presented = extractPresentedAdminKey(req);
  if (!presented) return false;

  return crypto.timingSafeEqual(sha256Digest(presented), sha256Digest(configuredKey));
}

export function isExplicitAdminAuthorized(req: Request, res?: Response): boolean {
  const authUser = res?.locals.authUser as User | undefined;
  if (authUser?.role === 'ADMIN' && authUser.accountStatus === 'ACTIVE') {
    return true;
  }

  return hasValidPresentedAdminKey(req);
}

export function isAdminAuthorized(req: Request, res?: Response): boolean {
  if (isExplicitAdminAuthorized(req, res)) {
    return true;
  }

  const authUser = res?.locals.authUser as User | undefined;
  const configuredKey = env.adminAccessKey.trim();
  if (authUser) {
    // Non-admin (or inactive admin) users must never inherit open_dev bypass; require explicit key.
    return Boolean(configuredKey) && hasValidPresentedAdminKey(req);
  }

  if (!configuredKey) {
    return env.nodeEnv !== 'production';
  }

  return hasValidPresentedAdminKey(req);
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authUser = res.locals.authUser as User | undefined;

  if (authUser?.role === 'ADMIN' && authUser.accountStatus === 'ACTIVE') {
    res.locals.adminAuthMode = 'session';
    next();
    return;
  }

  const configuredKey = env.adminAccessKey.trim();

  if (authUser) {
    if (configuredKey && hasValidPresentedAdminKey(req)) {
      res.locals.adminAuthMode = 'key';
      next();
      return;
    }

    res.status(403).json({
      success: false,
      code: 'FORBIDDEN',
      error: 'Administrator privileges are required.'
    });
    return;
  }

  if (!configuredKey) {
    if (env.nodeEnv === 'production') {
      res.status(503).json({
        success: false,
        code: 'ADMIN_AUTH_UNCONFIGURED',
        error: 'Admin access key is not configured in production.'
      });
      return;
    }

    res.locals.adminAuthMode = 'open_dev';
    next();
    return;
  }

  if (!hasValidPresentedAdminKey(req)) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      error: 'Valid admin credentials are required.'
    });
    return;
  }

  res.locals.adminAuthMode = 'key';
  next();
}
