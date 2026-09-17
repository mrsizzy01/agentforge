import { ProviderType } from '@agentforge/types';
import { LLMProvider } from './types.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { GoogleGeminiProvider } from './providers/gemini.js';

export interface CreateProviderOptions {
  type: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export class LLMProviderFactory {
  public static create(options: CreateProviderOptions): LLMProvider {
    const env = process.env;

    switch (options.type) {
      case 'openai': {
        const apiKey = options.apiKey || env.OPENAI_API_KEY;
        const model = options.model || 'gpt-4o';
        const baseUrl = options.baseUrl || env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

        return new OpenAICompatibleProvider('openai', {
          apiKey,
          baseUrl,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'anthropic': {
        const apiKey = options.apiKey || env.ANTHROPIC_API_KEY;
        const model = options.model || 'claude-3-7-sonnet-20250219';
        const baseUrl = options.baseUrl || env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';

        return new AnthropicProvider({
          apiKey,
          baseUrl,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'google': {
        const apiKey = options.apiKey || env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
        const model = options.model || 'gemini-2.5-flash';
        const baseUrl =
          options.baseUrl ||
          env.GEMINI_BASE_URL ||
          'https://generativelanguage.googleapis.com/v1beta';

        return new GoogleGeminiProvider({
          apiKey,
          baseUrl,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'mistral': {
        const apiKey = options.apiKey || env.MISTRAL_API_KEY;
        const model = options.model || 'mistral-large-latest';
        const baseUrl = options.baseUrl || 'https://api.mistral.ai/v1';

        return new OpenAICompatibleProvider('mistral', {
          apiKey,
          baseUrl,
          model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'ollama': {
        const model = options.model || 'llama3.3:latest';
        const baseUrl = options.baseUrl || env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';

        return new OpenAICompatibleProvider('ollama', {
          baseUrl,
          model,
          apiKey: options.apiKey || 'ollama', // Ollama doesn't require a real key
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'lmstudio': {
        const model = options.model || 'local-model';
        const baseUrl = options.baseUrl || 'http://localhost:1234/v1';

        return new OpenAICompatibleProvider('lmstudio', {
          baseUrl,
          model,
          apiKey: options.apiKey || 'lmstudio',
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      case 'custom': {
        if (!options.baseUrl) {
          throw new Error('Custom provider requires baseUrl to be set.');
        }

        return new OpenAICompatibleProvider('custom', {
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
          model: options.model || 'default',
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          timeoutMs: options.timeoutMs,
        });
      }

      default:
        throw new Error(`Unsupported provider type: ${options.type}`);
    }
  }
}
