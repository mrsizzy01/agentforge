import {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  ProviderConfig,
  ToolCall,
} from '../types.js';

export class AnthropicProvider implements LLMProvider {
  public readonly id = 'anthropic';
  public readonly defaultModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.defaultModel = config.model || 'claude-3-7-sonnet-20250219';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.apiKey) {
      throw new Error(
        '[anthropic] API key is required. Set ANTHROPIC_API_KEY environment variable.',
      );
    }

    const url = `${this.baseUrl}/messages`;

    // Extract system message
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const systemPrompt = systemMessages.map((m) => m.content).join('\n\n');

    // Filter non-system messages
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    // Format messages for Anthropic
    const formattedMessages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = [];

    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId || 'call_0',
              content: msg.content,
            },
          ],
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const contentBlocks: Array<Record<string, unknown>> = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks,
        });
      } else {
        formattedMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages: formattedMessages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = request.abortSignal || controller.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `[anthropic] API error (${response.status} ${response.statusText}): ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        id: string;
        model: string;
        role: string;
        content: Array<{
          type: 'text' | 'tool_use';
          text?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
        stop_reason: string;
        usage?: {
          input_tokens: number;
          output_tokens: number;
        };
      };

      let textContent = '';
      const toolCalls: ToolCall[] = [];

      for (const block of data.content) {
        if (block.type === 'text' && block.text) {
          textContent += block.text;
        } else if (block.type === 'tool_use' && block.id && block.name) {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input || {},
          });
        }
      }

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
        model: data.model || this.defaultModel,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
