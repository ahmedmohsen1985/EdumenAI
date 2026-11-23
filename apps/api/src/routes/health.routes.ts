import { Router, type Request, type Response } from 'express';
import { checkDatabaseHealth } from '../lib/prisma.js';
import { getAiRuntimeSummary } from '../services/ai-settings.service.js';

const router = Router();

router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const [dbHealth, aiSummary] = await Promise.all([
    checkDatabaseHealth(),
    getAiRuntimeSummary()
  ]);

  const statusCode = dbHealth.connected ? 200 : 503;

  res.status(statusCode).json({
    status: dbHealth.connected ? 'ok' : 'degraded',
    db: dbHealth.connected ? 'connected' : 'error',
    dbLatencyMs: dbHealth.latencyMs,
    timestamp: new Date().toISOString(),
    ai: aiSummary
  });
});

export default router;
