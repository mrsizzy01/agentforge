import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SchemaConverter,
  LLMProviderFactory,
  OpenAICompatibleProvider,
  AnthropicProvider,
} from '../src/index.js';
import { ToolDescriptor } from '@agentforge/types';

describe('@agentforge/llm', () => {
  const sampleDescriptor: ToolDescriptor = {
    name: 'read_file',
    description: 'Read the contents of a file',
    category: 'read',
    requiresConfirmation: false,
    inputSchemaJson: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        lineStart: { type: 'number' },
      },
      required: ['path'],
    },
  };

  describe('SchemaConverter', () => {
    it('converts tool descriptors to OpenAI tools format', () => {
      const tools = SchemaConverter.toOpenAITools([sampleDescriptor]);
      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe('function');
      expect(tools[0].function.name).toBe('read_file');
      expect(tools[0].function.description).toBe('Read the contents of a file');
      expect(tools[0].function.parameters.type).toBe('object');
      expect(tools[0].function.parameters.required).toEqual(['path']);
    });

    it('converts tool descriptors to Anthropic tools format', () => {
      const tools = SchemaConverter.toAnthropicTools([sampleDescriptor]);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('read_file');
      expect(tools[0].input_schema.type).toBe('object');
      expect(tools[0].input_schema.required).toEqual(['path']);
    });

    it('converts tool descriptors to Gemini tools format', () => {
      const result = SchemaConverter.toGeminiTools([sampleDescriptor]);
      expect(result.functionDeclarations).toHaveLength(1);
      expect(result.functionDeclarations[0].name).toBe('read_file');
      expect(result.functionDeclarations[0].parameters.type).toBe('object');
    });
  });

  describe('LLMProviderFactory', () => {
    it('creates an OpenAI provider with default settings', () => {
      const provider = LLMProviderFactory.create({
        type: 'openai',
        apiKey: 'test-key',
      });
      expect(provider.id).toBe('openai');
      expect(provider.defaultModel).toBe('gpt-4o');
    });

    it('creates an Ollama provider with local base URL', () => {
      const provider = LLMProviderFactory.create({
        type: 'ollama',
        model: 'qwen2.5-coder:7b',
      });
      expect(provider.id).toBe('ollama');
      expect(provider.defaultModel).toBe('qwen2.5-coder:7b');
    });

    it('creates an Anthropic provider', () => {
      const provider = LLMProviderFactory.create({
        type: 'anthropic',
        apiKey: 'test-anthropic-key',
      });
      expect(provider.id).toBe('anthropic');
      expect(provider.defaultModel).toContain('claude');
    });

    it('creates a Google Gemini provider', () => {
      const provider = LLMProviderFactory.create({
        type: 'google',
        apiKey: 'test-gemini-key',
      });
      expect(provider.id).toBe('google');
      expect(provider.defaultModel).toContain('gemini');
    });

    it('throws when creating custom provider without baseUrl', () => {
      expect(() =>
        LLMProviderFactory.create({
          type: 'custom',
        }),
      ).toThrow('Custom provider requires baseUrl');
    });
  });

  describe('OpenAICompatibleProvider with Mock API', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('handles standard text completion and tool calling response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          model: 'gpt-4o',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: 'I need to check the file.',
                tool_calls: [
                  {
                    id: 'call_abc123',
                    type: 'function',
                    function: {
                      name: 'read_file',
                      arguments: '{"path":"package.json"}',
                    },
                  },
                ],
              },
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25,
            total_tokens: 40,
          },
        }),
      });

      global.fetch = mockFetch as any;

      const provider = new OpenAICompatibleProvider('openai', {
        apiKey: 'sk-test',
        model: 'gpt-4o',
      });

      const response = await provider.complete({
        messages: [{ role: 'user', content: 'What dependencies do we have?' }],
      });

      expect(response.content).toBe('I need to check the file.');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0].name).toBe('read_file');
      expect(response.toolCalls?.[0].arguments).toEqual({ path: 'package.json' });
      expect(response.finishReason).toBe('tool_calls');
      expect(response.usage?.totalTokens).toBe(40);
    });
  });
});
