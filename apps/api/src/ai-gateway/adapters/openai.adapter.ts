import { logger } from '../../lib/logger.js';
import {
  HttpJsonError,
  postJsonRequest,
  type AiAdapterParams,
  type AiAdapterResult
} from '../errors/ai-gateway.error.js';

function extractOpenAiMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter(
        (part): part is { text: string } =>
          Boolean(part) && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
      )
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return '';
}

interface OpenAiChatResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export async function callOpenAiCompatibleAdapter({
  provider,
  taskType,
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userPrompt,
  file,
  jsonSchema,
  schemaName,
  temperature,
  maxOutputTokens,
  timeoutMs,
  reasoningConfig,
  extraConfig
}: AiAdapterParams): Promise<AiAdapterResult> {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  };

  if (provider === 'openrouter') {
    const siteUrl =
      typeof extraConfig?.siteUrl === 'string' && extraConfig.siteUrl.trim()
        ? extraConfig.siteUrl.trim()
        : process.env.OPENROUTER_SITE_URL || 'https://edumenai.the-amaj.com';
    const appName =
      typeof extraConfig?.appName === 'string' && extraConfig.appName.trim()
        ? extraConfig.appName.trim()
        : process.env.OPENROUTER_APP_NAME || 'EdumenAI';

    headers['HTTP-Referer'] = siteUrl;
    headers['X-Title'] = appName;
  }

  let userContent: string | Array<Record<string, unknown>> = userPrompt;
  if (file) {
    const fileBlock: Record<string, unknown> =
      file.mimeType === 'application/pdf'
        ? {
            type: 'file',
            file: {
              filename: file.filename || 'document.pdf',
              file_data: `data:application/pdf;base64,${file.base64}`
            }
          }
        : {
            type: 'image_url',
            image_url: {
              url: `data:${file.mimeType};base64,${file.base64}`,
              detail: 'high'
            }
          };

    userContent = [fileBlock, { type: 'text', text: userPrompt }];
  }

  const messages: Array<Record<string, unknown>> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userContent });

  const isOpenAiReasoningModel = provider === 'openai' && /^(o[134]|gpt-5)/i.test(model);

  const buildPayload = (responseFormatMode: 'json_schema' | 'json_object' | 'none'): Record<string, unknown> => {
    const payload: Record<string, unknown> = { model, messages };

    if (!isOpenAiReasoningModel) {
      payload.temperature = temperature;
    }

    if (provider === 'openai') {
      payload.max_completion_tokens = maxOutputTokens;
    } else {
      payload.max_tokens = maxOutputTokens;
    }

    if (provider === 'openrouter') {
      const configuredEffort =
        typeof reasoningConfig?.effort === 'string'
          ? reasoningConfig.effort
          : typeof reasoningConfig?.thinkingLevel === 'string'
            ? reasoningConfig.thinkingLevel
            : (taskType === 'vision'
                ? process.env.OPENROUTER_VISION_REASONING
                : process.env.OPENROUTER_EVAL_REASONING) || '';
      const effort = configuredEffort.trim().toLowerCase();
      if (effort) {
        payload.reasoning = { effort };
      }
    }

    if (provider === 'openai' && isOpenAiReasoningModel) {
      const configuredEffort =
        typeof reasoningConfig?.effort === 'string'
          ? reasoningConfig.effort
          : typeof reasoningConfig?.thinkingLevel === 'string'
            ? reasoningConfig.thinkingLevel
            : (taskType === 'vision'
                ? process.env.OPENAI_VISION_REASONING
                : process.env.OPENAI_EVAL_REASONING) || '';
      const effort = configuredEffort.trim().toLowerCase();
      if (['minimal', 'low', 'medium', 'high'].includes(effort)) {
        payload.reasoning_effort = effort;
      }
    }

    if (provider === 'openrouter' && file?.mimeType === 'application/pdf') {
      const configuredPdfEngine =
        typeof extraConfig?.pdfEngine === 'string'
          ? extraConfig.pdfEngine
          : process.env.OPENROUTER_PDF_ENGINE || '';
      const pdfEngine = configuredPdfEngine.trim();
      if (pdfEngine) {
        payload.plugins = [{ id: 'file-parser', pdf: { engine: pdfEngine } }];
      }
    }

    if (jsonSchema && responseFormatMode === 'json_schema') {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: schemaName || 'marking_report',
          strict: true,
          schema: jsonSchema
        }
      };
    } else if (jsonSchema && responseFormatMode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  };

  const logAndExtract = (raw: Record<string, unknown>): AiAdapterResult => {
    const data = raw as unknown as OpenAiChatResponse;
    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason || 'stop';
    const usage = data.usage;
    const promptTokens = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : null;
    const completionTokens =
      typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : null;
    const totalTokens =
      typeof usage?.total_tokens === 'number'
        ? usage.total_tokens
        : promptTokens !== null && completionTokens !== null
          ? promptTokens + completionTokens
          : null;

    if (usage || finishReason !== 'stop') {
      logger.info(
        { provider, model, finishReason, promptTokens, completionTokens },
        `[${provider} Adapter] Model '${model}' finish=${finishReason}`
      );
    }

    return {
      text: extractOpenAiMessageText(choice?.message?.content),
      finishReason,
      promptTokens,
      completionTokens,
      totalTokens
    };
  };

  try {
    const data = await postJsonRequest(
      url,
      headers,
      buildPayload(jsonSchema ? 'json_schema' : 'none'),
      timeoutMs
    );
    return logAndExtract(data);
  } catch (err) {
    // Some OpenRouter third-party models reject strict json_schema (400) while supporting json_object or plain JSON prompt.
    // Retry on the exact same model with relaxed format header without altering model quality.
    const msgLower = String(err instanceof Error ? err.message : '').toLowerCase();
    const statusCode = err instanceof HttpJsonError ? err.statusCode : undefined;
    const isSchemaHeaderRejected =
      provider === 'openrouter' &&
      Boolean(jsonSchema) &&
      statusCode === 400 &&
      (msgLower.includes('response_format') ||
        msgLower.includes('json_schema') ||
        msgLower.includes('structured'));

    if (!isSchemaHeaderRejected) throw err;

    try {
      const data = await postJsonRequest(url, headers, buildPayload('json_object'), timeoutMs);
      return logAndExtract(data);
    } catch (secondErr) {
      const secondStatus = secondErr instanceof HttpJsonError ? secondErr.statusCode : undefined;
      if (secondStatus === 400) {
        const data = await postJsonRequest(url, headers, buildPayload('none'), timeoutMs);
        return logAndExtract(data);
      }
      throw secondErr;
    }
  }
}

export async function callOpenAiAdapter(params: AiAdapterParams): Promise<AiAdapterResult> {
  return callOpenAiCompatibleAdapter({ ...params, provider: 'openai' });
}
