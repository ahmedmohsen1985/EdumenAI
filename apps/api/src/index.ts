import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { getAiRuntimeSummary } from './services/ai-settings.service.js';
import { bootstrapAdminIfConfigured } from './services/auth.service.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info({ port: env.port, nodeEnv: env.nodeEnv }, 'EdumenAI API server started');

  void bootstrapAdminIfConfigured().catch((err: unknown) => {
    logger.warn({ err }, 'Failed to bootstrap admin account at startup');
  });

  void getAiRuntimeSummary()
    .then((aiSummary) => {
      logger.info({ ai: aiSummary }, 'Active AI runtime summary');
    })
    .catch((err: unknown) => {
      logger.warn({ err }, 'Failed to load AI runtime summary at startup');
    });
});

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutdown signal received, closing HTTP server...');

  server.close(() => {
    void prisma
      .$disconnect()
      .then(() => {
        logger.info('HTTP server and Prisma disconnected cleanly');
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Error disconnecting Prisma during shutdown');
        process.exit(1);
      });
  });
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

export default app;
