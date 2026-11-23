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
  cacheTtlSeconds: z.coerce.number().int().nonnegative().default(86400)
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
  cacheTtlSeconds: process.env.CACHE_TTL_SECONDS || 86400
});
