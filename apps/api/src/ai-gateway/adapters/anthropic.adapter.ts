import {
  postJsonRequest,
  type AiAdapterParams,
  type AiAdapterResult
} from '../errors/ai-gateway.error.js';

interface AnthropicBlock {
  type?: string;
  text?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  content?: AnthropicBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export async function callAnthropicAdapter({
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userPrompt,
  file,
  files,
  jsonSchema,
  schemaName,
  temperature,
  maxOutputTokens,
  timeoutMs
}: AiAdapterParams): Promise<AiAdapterResult> {
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/messages`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const resolvedFiles =
    Array.isArray(files) && files.length > 0 ? files : file ? [file] : [];
  const contentBlocks: Array<Record<string, unknown>> = [];
  for (const f of resolvedFiles) {
    if (f.mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: f.base64
        }
      });
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: f.mimeType,
          data: f.base64
        }
      });
    }
  }
  contentBlocks.push({ type: 'text', text: userPrompt });

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxOutputTokens || 8192,
    temperature,
    messages: [{ role: 'user', content: contentBlocks }]
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  // Forced tool use guarantees schema-compliant JSON output on Anthropic models
  if (jsonSchema) {
    const toolName = schemaName || 'submit_marking_report';
    body.tools = [
      {
        name: toolName,
        description: 'Submit the complete assessment marking report matching the schema.',
        input_schema: jsonSchema
      }
    ];
    body.tool_choice = { type: 'tool', name: toolName };
  }

  const raw = await postJsonRequest(url, headers, body, timeoutMs);
  const data = raw as unknown as AnthropicResponse;
  const blocks = Array.isArray(data.content) ? data.content : [];
  const finishReason = data.stop_reason || 'end_turn';

  const promptTokens =
    typeof data.usage?.input_tokens === 'number' ? data.usage.input_tokens : null;
  const completionTokens =
    typeof data.usage?.output_tokens === 'number' ? data.usage.output_tokens : null;
  const totalTokens =
    promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null;

  if (jsonSchema) {
    const toolBlock = blocks.find((b) => b.type === 'tool_use' && b.input);
    if (toolBlock?.input) {
      return {
        text: JSON.stringify(toolBlock.input),
        finishReason,
        promptTokens,
        completionTokens,
        totalTokens
      };
    }
  }

  return {
    text: blocks
      .filter((b): b is AnthropicBlock & { text: string } => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim(),
    finishReason,
    promptTokens,
    completionTokens,
    totalTokens
  };
}
