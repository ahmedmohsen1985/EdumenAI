import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

const ADMIN_COOKIE_NAME = 'edumenai_admin_key';

function extractCookieValue(cookieHeader: string | undefined, name: string): string {
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

export function isAdminAuthorized(req: Request): boolean {
  const configuredKey = env.adminAccessKey.trim();
  if (!configuredKey) {
    return env.nodeEnv !== 'production';
  }

  const presented = extractPresentedAdminKey(req);
  if (!presented) {
    return false;
  }

  return crypto.timingSafeEqual(sha256Digest(presented), sha256Digest(configuredKey));
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const configuredKey = env.adminAccessKey.trim();

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

  if (!isAdminAuthorized(req)) {
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
