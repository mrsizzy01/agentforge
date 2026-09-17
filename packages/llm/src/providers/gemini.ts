import {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  ProviderConfig,
  ToolCall,
} from '../types.js';

export class GoogleGeminiProvider implements LLMProvider {
  public readonly id = 'google';
  public readonly defaultModel: string;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: ProviderConfig) {
    this.defaultModel = config.model || 'gemini-2.5-flash';
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
      /\/+$/,
      '',
    );
    this.timeoutMs = config.timeoutMs || 60000;
  }

  public async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (!this.apiKey) {
      throw new Error(
        '[google] API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable.',
      );
    }

    const url = `${this.baseUrl}/models/${this.defaultModel}:generateContent?key=${this.apiKey}`;

    // Extract system instructions
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const systemInstruction =
      systemMessages.length > 0
        ? {
            parts: systemMessages.map((m) => ({ text: m.content })),
          }
        : undefined;

    // Convert contents
    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<Record<string, unknown>>;
    }> = [];

    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    for (const msg of nonSystemMessages) {
      if (msg.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: msg.name || 'tool',
                response: {
                  content: msg.content,
                },
              },
            },
          ],
        });
      } else if (msg.role === 'assistant') {
        const parts: Array<Record<string, unknown>> = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        contents.push({
          role: 'model',
          parts: parts.length > 0 ? parts : [{ text: '' }],
        });
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (request.temperature !== undefined) {
      body.generationConfig = {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      };
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = request.abortSignal || controller.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `[google] API error (${response.status} ${response.statusText}): ${errorText}`,
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content: {
            parts: Array<{
              text?: string;
              functionCall?: {
                name: string;
                args: Record<string, unknown>;
              };
            }>;
            role: string;
          };
          finishReason: string;
        }>;
        usageMetadata?: {
          promptTokenCount: number;
          candidatesTokenCount: number;
          totalTokenCount: number;
        };
      };

      const candidate = data.candidates?.[0];
      if (!candidate) {
        throw new Error('[google] No candidate returned in response');
      }

      let textContent = '';
      const toolCalls: ToolCall[] = [];

      for (const part of candidate.content.parts || []) {
        if (part.text) {
          textContent += part.text;
        }
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          });
        }
      }

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
        usage: data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount,
              completionTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            }
          : undefined,
        model: this.defaultModel,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
