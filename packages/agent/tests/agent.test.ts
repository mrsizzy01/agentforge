import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { SystemPromptBuilder, ContextManager, ReActAgent } from '../src/index.js';
import { AgentForgeRuntime } from '@agentforge/core';
import { LLMProvider, LLMCompletionRequest, LLMCompletionResponse } from '@agentforge/llm';

describe('@agentforge/agent', () => {
  describe('SystemPromptBuilder', () => {
    it('constructs detailed system prompt with workspace and instructions', () => {
      const prompt = SystemPromptBuilder.build({
        workspaceRoot: 'C:\\test\\workspace',
        gitStatus: {
          isRepo: true,
          branch: 'feature-agent',
          ahead: 0,
          behind: 0,
          dirty: false,
          stagedFiles: [],
          unstagedFiles: [],
          untrackedFiles: [],
        },
        projectInstructions: 'Must follow Clean Architecture principles.',
        toolsSummary: ['read_file: reads a file', 'write_file: writes a file'],
      });

      expect(prompt).toContain('AgentForge');
      expect(prompt).toContain('C:\\test\\workspace');
      expect(prompt).toContain('feature-agent');
      expect(prompt).toContain('Must follow Clean Architecture principles.');
      expect(prompt).toContain('read_file: reads a file');
      expect(prompt).toContain('ENGINEERING GUIDELINES');
    });
  });

  describe('ContextManager', () => {
    it('truncates oversized tool output to prevent context overflow', () => {
      const context = new ContextManager({ maxToolOutputLength: 100 });
      const hugeOutput = 'A'.repeat(500);

      context.addToolResult('call_1', 'read_file', hugeOutput);
      const messages = context.getMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('tool');
      expect(messages[0].content).toContain('[INFO] Output truncated');
      expect(messages[0].content.length).toBeLessThan(300);
    });

    it('preserves system prompt while trimming excess message history', () => {
      const context = new ContextManager({ maxHistoryMessages: 3 });
      context.setSystemPrompt('System prompt instruction');

      context.addUserMessage('Message 1');
      context.addAssistantMessage('Message 2');
      context.addUserMessage('Message 3');
      context.addAssistantMessage('Message 4');

      const messages = context.getMessages();
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('System prompt instruction');
      // Pruned to keep only last 3 non-system messages + system
      expect(messages.length).toBe(4);
    });

    it('estimates token usage and compacts intermediate history', () => {
      const context = new ContextManager({ maxHistoryMessages: 30 });
      context.setSystemPrompt('You are AgentForge.');
      context.addUserMessage('Primary goal: build authentication');

      // Add 10 intermediate tool steps
      for (let i = 1; i <= 10; i++) {
        context.addAssistantMessage(`Thinking step ${i}`, [
          { id: `call_${i}`, name: 'read_file', arguments: { path: `file_${i}.ts` } },
        ]);
        context.addToolResult(`call_${i}`, 'read_file', `Content of file ${i}`);
      }

      const tokenEstimate = context.estimateTokenCount();
      expect(tokenEstimate).toBeGreaterThan(50);

      const beforeCount = context.getMessages().length;
      const { compacted, removedCount } = context.compactHistory(4);

      expect(compacted).toBe(true);
      expect(removedCount).toBeGreaterThan(0);

      const messages = context.getMessages();
      expect(messages.length).toBeLessThan(beforeCount);
      // System prompt and primary goal are strictly preserved
      expect(messages[0].role).toBe('system');
      expect(messages[1].content).toContain('Primary goal: build authentication');
      // A checkpoint summary is inserted
      expect(messages[2].content).toContain('[CONTEXT CHECKPOINT]');
    });
  });

  describe('ReActAgent Autonomous Loop', () => {
    it('executes tool calling cycle and terminates on final answer', async () => {
      const tempDir = os.tmpdir();
      const runtime = new AgentForgeRuntime({
        workspaceRoot: tempDir,
        permissionLevel: 'autonomous',
      });

      let turn = 0;
      const mockLLM: LLMProvider = {
        id: 'mock-llm',
        defaultModel: 'mock-model',
        complete: vi.fn(async (req: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
          turn++;
          if (turn === 1) {
            // First turn: model decides to list directory
            return {
              content: 'I will list the directory first.',
              finishReason: 'tool_calls',
              model: 'mock-model',
              toolCalls: [
                {
                  id: 'call_1',
                  name: 'list_dir',
                  arguments: { path: '.' },
                },
              ],
            };
          } else {
            // Second turn: model answers task
            return {
              content: 'The directory has been examined and the task is complete.',
              finishReason: 'stop',
              model: 'mock-model',
            };
          }
        }),
      };

      const agent = new ReActAgent(runtime, mockLLM);
      await agent.initialize();

      const events: any[] = [];
      const result = await agent.runTask('Check the project workspace', {
        onEvent: (e) => events.push(e),
      });

      expect(result.success).toBe(true);
      expect(result.stepsExecuted).toBe(2);
      expect(result.finalAnswer).toBe('The directory has been examined and the task is complete.');
      expect(events.length).toBeGreaterThan(0);
    });
  });
});
