import type { AiAdapterParams, AiAdapterResult } from '../errors/ai-gateway.error.js';
import { callOpenAiCompatibleAdapter } from './openai.adapter.js';

export async function callOpenRouterAdapter(params: AiAdapterParams): Promise<AiAdapterResult> {
  return callOpenAiCompatibleAdapter({ ...params, provider: 'openrouter' });
}
