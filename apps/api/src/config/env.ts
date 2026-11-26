import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { API_ROOT_DIR, MONOREPO_ROOT_DIR } from '../lib/paths.js';

// Load apps/api/.env first, then monorepo root .env (earlier values take precedence in dotenv)
dotenv.config({ path: path.join(API_ROOT_DIR, '.env') });
dotenv.config({ path: path.join(MONOREPO_ROOT_DIR, '.env') });

const EnvSchema = z.object({
  port: z.coerce.number().int().positive().default(4000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().default(''),
  aiTimeoutMs: z.coerce.number().int().positive().default(120000),
  adminAccessKey: z.string().default(''),
  appEncryptionKey: z.string().default(''),
  corsOrigin: z.string().default('*'),
  cacheTtlSeconds: z.coerce.number().int().nonnegative().default(86400),
  appBaseUrl: z.string().default('http://localhost:3000'),
  mailProvider: z.enum(['console', 'resend', 'smtp']).default('console'),
  mailFrom: z.string().default('EdumenAI <no-reply@edumenai.local>'),
  resendApiKey: z.string().default(''),
  smtpHost: z.string().default(''),
  smtpPort: z.coerce.number().int().positive().default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().default(''),
  smtpPass: z.string().default(''),
  twoFactorIssuer: z.string().default('EdumenAI'),
  cookieSameSite: z.enum(['lax', 'none', 'strict']).default('lax'),
  cookieDomain: z.string().default(''),
  adminBootstrapEmail: z.string().default(''),
  adminBootstrapPassword: z.string().default(''),
  adminBootstrapName: z.string().default('Platform Admin')
});

export type AppEnv = z.infer<typeof EnvSchema>;

export const env: AppEnv = EnvSchema.parse({
  port: process.env.PORT || process.env.API_PORT || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  aiTimeoutMs: process.env.AI_TIMEOUT_MS || 120000,
  adminAccessKey: process.env.ADMIN_ACCESS_KEY || '',
  appEncryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  cacheTtlSeconds: process.env.CACHE_TTL_SECONDS || 86400,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  mailProvider: process.env.MAIL_PROVIDER || 'console',
  mailFrom: process.env.MAIL_FROM || 'EdumenAI <no-reply@edumenai.local>',
  resendApiKey: process.env.RESEND_API_KEY || '',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: process.env.SMTP_PORT || 587,
  smtpSecure: (process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  twoFactorIssuer: process.env.TWO_FACTOR_ISSUER || 'EdumenAI',
  cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax',
  cookieDomain: process.env.COOKIE_DOMAIN || '',
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL || '',
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD || '',
  adminBootstrapName: process.env.ADMIN_BOOTSTRAP_NAME || 'Platform Admin'
});
