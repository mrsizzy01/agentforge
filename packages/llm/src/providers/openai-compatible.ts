import {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  ProviderConfig,
  ToolCall,
} from '../types.js';

export class OpenAICompatibleProvider implements LLMProvider {
  public readonly id: string;
  public readonly defaultModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(id: string, config: ProviderConfig) {
    this.id = id;
    this.defaultModel = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Convert messages
    const formattedMessages = request.messages.map((m) => {
      const msg: Record<string, unknown> = {
        role: m.role,
        content: m.content || '',
      };

      if (m.name) {
        msg.name = m.name;
      }

      if (m.toolCallId) {
        msg.tool_call_id = m.toolCallId;
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      return msg;
    });

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: formattedMessages,
      temperature: request.temperature ?? 0.2,
    };

    if (request.maxTokens) {
      body.max_tokens = request.maxTokens;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      if (request.toolChoice) {
        body.tool_choice = request.toolChoice;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = request.abortSignal || controller.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `[${this.id}] API error (${response.status} ${response.statusText}): ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        id: string;
        model: string;
        choices: Array<{
          finish_reason: string;
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: {
                name: string;
                arguments: string;
              };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error(`[${this.id}] Empty response received from model`);
      }

      const toolCalls: ToolCall[] = [];
      if (choice.message.tool_calls && Array.isArray(choice.message.tool_calls)) {
        for (const tc of choice.message.tool_calls) {
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch {
            parsedArgs = { raw: tc.function.arguments };
          }

          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs,
          });
        }
      }

      return {
        content: choice.message.content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: (choice.finish_reason as any) || 'stop',
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
        model: data.model || this.defaultModel,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
