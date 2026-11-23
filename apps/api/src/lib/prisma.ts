import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis as typeof globalThis & {
  __edumenaiPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__edumenaiPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__edumenaiPrisma = prisma;
}

export const TX_OPTIONS = {
  maxWait: 15000,
  timeout: 30000
} as const;

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start
    };
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: 'Database connection failed'
    };
  }
}
