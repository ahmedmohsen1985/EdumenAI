import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  AiProviderIdSchema,
  AiTaskTypeSchema,
  CreateTelegramTargetSchema,
  UpdateTelegramTargetSchema,
  UpsertAiProviderConfigSchema,
  UpsertAiTaskRouteSchema,
  UpsertTelegramConfigSchema
} from '@edumenai/shared';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware.js';
import {
  createExerciseAdmin,
  deleteExerciseAdmin,
  duplicateExerciseAdmin,
  getExerciseAdmin,
  listAllExercisesAdmin,
  publishExerciseAdmin,
  saveExerciseDraftAdmin
} from '../services/exercise.service.js';
import {
  deleteAiTaskRoute,
  listAiProviderConfigs,
  listAiTaskRoutes,
  testAiProviderConnection,
  upsertAiProviderConfig,
  upsertAiTaskRoute
} from '../services/ai-settings.service.js';
import {
  createTelegramTarget,
  deleteTelegramTarget,
  getTelegramConfigView,
  listTelegramTargets,
  sendTelegramTestMessage,
  updateTelegramTarget,
  upsertTelegramConfig
} from '../services/telegram.service.js';

const router = Router();

router.use(adminAuthMiddleware);

const TelegramTestSchema = z.object({
  chatId: z.string().min(1),
  message: z.string().optional()
});

const PublishExerciseBodySchema = z
  .object({
    versionId: z.string().min(1).optional()
  })
  .optional();

router.get('/auth/check', (_req: Request, res: Response): void => {
  const mode = typeof res.locals.adminAuthMode === 'string' ? res.locals.adminAuthMode : 'key';
  res.json({
    success: true,
    data: {
      authenticated: true,
      mode
    }
  });
});

// Exercise Studio CRUD & Publishing
router.get('/exercises', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await listAllExercisesAdmin();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await createExerciseAdmin(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get('/exercises/:code', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await getExerciseAdmin(String(req.params.code || ''));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/exercises/:code/draft', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    const data = await saveExerciseDraftAdmin(code, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises/:code/publish', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    const parsedBody = PublishExerciseBodySchema.parse(req.body);
    const data = await publishExerciseAdmin(code, parsedBody?.versionId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/exercises/:code', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    const data = await deleteExerciseAdmin(code);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/exercises/:code/duplicate', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = String(req.params.code || '');
    const data = await duplicateExerciseAdmin(code, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// AI Settings
router.get('/settings/ai', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [providers, routes] = await Promise.all([
      listAiProviderConfigs(),
      listAiTaskRoutes()
    ]);
    res.json({
      success: true,
      data: {
        providers,
        routes
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/ai/providers/:provider', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const provider = AiProviderIdSchema.parse(req.params.provider);
    const input = UpsertAiProviderConfigSchema.parse({
      ...(req.body ?? {}),
      provider
    });
    const data = await upsertAiProviderConfig(input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/ai/providers/:provider/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const provider = AiProviderIdSchema.parse(req.params.provider);
    const data = await testAiProviderConnection(provider);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/ai/routes/:taskType', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const taskType = AiTaskTypeSchema.parse(req.params.taskType);
    const input = UpsertAiTaskRouteSchema.parse({
      ...(req.body ?? {}),
      taskType
    });
    const data = await upsertAiTaskRoute(input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/settings/ai/routes/:taskType', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const taskType = AiTaskTypeSchema.parse(req.params.taskType);
    await deleteAiTaskRoute(taskType);
    res.json({ success: true, data: { deleted: true, taskType } });
  } catch (err) {
    next(err);
  }
});

// Telegram Settings
router.get('/settings/telegram', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [config, targets] = await Promise.all([
      getTelegramConfigView(),
      listTelegramTargets()
    ]);
    res.json({
      success: true,
      data: {
        config,
        targets
      }
    });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/telegram', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = UpsertTelegramConfigSchema.parse(req.body ?? {});
    const data = await upsertTelegramConfig(input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/telegram/targets', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = CreateTelegramTargetSchema.parse(req.body ?? {});
    const data = await createTelegramTarget(input);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.put('/settings/telegram/targets/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id || '');
    const input = UpdateTelegramTargetSchema.parse(req.body ?? {});
    const data = await updateTelegramTarget(id, input);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.delete('/settings/telegram/targets/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = String(req.params.id || '');
    await deleteTelegramTarget(id);
    res.json({ success: true, data: { deleted: true, id } });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/telegram/test', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = TelegramTestSchema.parse(req.body ?? {});
    const data = await sendTelegramTestMessage(input.chatId, input.message);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
