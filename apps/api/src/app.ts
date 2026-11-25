import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AiServiceError } from './ai-gateway/index.js';
import { HttpError } from './services/exercise.service.js';
import { attachAuthMiddleware } from './middleware/auth.middleware.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import enrollmentsRoutes from './routes/enrollments.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import exercisesRoutes from './routes/exercises.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import adminRoutes from './routes/admin.routes.js';

function resolveCorsOptions(): cors.CorsOptions {
  if (!env.corsOrigin || env.corsOrigin === '*') {
    return { origin: true, credentials: true };
  }
  const origins = env.corsOrigin
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return {
    origin: origins.length === 1 ? origins[0] : origins,
    credentials: true
  };
}

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors(resolveCorsOptions()));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(attachAuthMiddleware);

  // Routes
  app.use('/', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/enrollments', enrollmentsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/exercises', exercisesRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/admin', adminRoutes);

  // 404 handler
  app.use((req: Request, res: Response): void => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      error: `Route ${req.method} ${req.originalUrl} not found.`
    });
  });

  // Unified error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AiServiceError) {
      const statusCode = err.isQuotaError || err.code === 'QUOTA_EXCEEDED' ? 429 : err.statusCode;
      res.status(statusCode).json({
        success: false,
        code: err.code,
        isQuotaError: err.isQuotaError,
        ...(err.provider ? { provider: err.provider } : {}),
        ...(err.model ? { model: err.model } : {}),
        error: err.message
      });
      return;
    }

    if (err instanceof ZodError) {
      res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: err.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join('; '),
        details: err.errors
      });
      return;
    }

    if (err instanceof multer.MulterError) {
      const statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(statusCode).json({
        success: false,
        code: err.code,
        error: err.message
      });
      return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025') {
        res.status(404).json({
          success: false,
          code: 'NOT_FOUND',
          error: 'Requested record was not found.'
        });
        return;
      }
      if (err.code === 'P2002') {
        res.status(409).json({
          success: false,
          code: 'CONFLICT',
          error: 'A record with that unique identifier already exists.'
        });
        return;
      }
    }

    if (err instanceof HttpError) {
      res.status(err.statusCode).json({
        success: false,
        code: err.code,
        error: err.message
      });
      return;
    }

    const statusCandidate =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? (err as { statusCode?: unknown }).statusCode
        : typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;
    const statusCode =
      typeof statusCandidate === 'number' && statusCandidate >= 400 && statusCandidate < 600
        ? statusCandidate
        : 500;

    logger.error({ err }, 'Unhandled Express error');

    const safeMessage =
      statusCode >= 500 && env.nodeEnv === 'production'
        ? 'Internal server error'
        : err instanceof Error
          ? err.message
          : 'Internal server error';

    res.status(statusCode).json({
      success: false,
      code: statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
      error: safeMessage
    });
  });

  return app;
}

export default createApp;
