import { z } from 'zod';
import { AiTaskTypeSchema } from './template.schema.js';
import { TelegramGroupChatIdSchema } from './validation.js';

export const AiProviderIdSchema = z.enum(['google', 'openai', 'anthropic', 'openrouter']);

export const UpsertAiProviderConfigSchema = z.object({
  provider: AiProviderIdSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  extraConfig: z.record(z.unknown()).nullable().optional()
});

export const AiProviderConfigViewSchema = z.object({
  id: z.string().optional(),
  provider: AiProviderIdSchema,
  hasApiKey: z.boolean(),
  apiKeyMasked: z.string().nullable(),
  baseUrl: z.string().nullable(),
  model: z.string().nullable(),
  isDefault: z.boolean(),
  isEnabled: z.boolean(),
  extraConfig: z.record(z.unknown()).nullable(),
  source: z.enum(['database', 'env', 'none']),
  updatedAt: z.string().datetime().nullable().optional()
});

export const UpsertAiTaskRouteSchema = z.object({
  taskType: AiTaskTypeSchema,
  provider: AiProviderIdSchema,
  model: z.string().min(1),
  maxTokens: z.number().int().positive().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  reasoningConfig: z.record(z.unknown()).nullable().optional(),
  isActive: z.boolean().optional()
});

export const AiTaskRouteViewSchema = UpsertAiTaskRouteSchema.extend({
  id: z.string().optional(),
  isActive: z.boolean(),
  source: z.enum(['database', 'env', 'default']),
  updatedAt: z.string().datetime().nullable().optional()
});

export const UpsertTelegramConfigSchema = z.object({
  botToken: z.string().optional(),
  isEnabled: z.boolean()
});

export const TelegramConfigViewSchema = z.object({
  hasBotToken: z.boolean(),
  botTokenMasked: z.string().nullable(),
  isEnabled: z.boolean(),
  source: z.enum(['database', 'env', 'none']),
  updatedAt: z.string().datetime().nullable().optional()
});

export const CreateTelegramTargetSchema = z.object({
  name: z.string().min(1),
  chatId: TelegramGroupChatIdSchema,
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const UpdateTelegramTargetSchema = CreateTelegramTargetSchema.partial();

export const TelegramTargetViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  chatId: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type AiProviderId = z.infer<typeof AiProviderIdSchema>;
export type UpsertAiProviderConfig = z.infer<typeof UpsertAiProviderConfigSchema>;
export type AiProviderConfigView = z.infer<typeof AiProviderConfigViewSchema>;
export type UpsertAiTaskRoute = z.infer<typeof UpsertAiTaskRouteSchema>;
export type AiTaskRouteView = z.infer<typeof AiTaskRouteViewSchema>;
export type UpsertTelegramConfig = z.infer<typeof UpsertTelegramConfigSchema>;
export type TelegramConfigView = z.infer<typeof TelegramConfigViewSchema>;
export type CreateTelegramTarget = z.infer<typeof CreateTelegramTargetSchema>;
export type UpdateTelegramTarget = z.infer<typeof UpdateTelegramTargetSchema>;
export type TelegramTargetView = z.infer<typeof TelegramTargetViewSchema>;
