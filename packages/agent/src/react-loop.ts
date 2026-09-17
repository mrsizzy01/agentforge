import {
  LLMProvider,
  LLMCompletionResponse,
  ToolCall,
  ToolDefinition as LLMToolDefinition,
} from '@agentforge/llm';
import { AgentForgeRuntime } from '@agentforge/core';
import { ToolContext, ToolResult } from '@agentforge/types';
import { ContextManager } from './context.js';
import { SystemPromptBuilder } from './prompt.js';

export interface AgentStepEvent {
  step: number;
  maxSteps: number;
  thought?: string;
  token?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    name: string;
    success: boolean;
    output: string;
  };
}

export interface ReActLoopOptions {
  maxSteps?: number;
  temperature?: number;
  onEvent?: (event: AgentStepEvent) => void;
  onToken?: (token: string) => void;
  confirmAction?: (prompt: string, details?: Record<string, unknown>) => Promise<boolean>;
  abortSignal?: AbortSignal;
}

export interface ReActLoopResult {
  success: boolean;
  stepsExecuted: number;
  finalAnswer: string;
  error?: string;
}

export class ReActAgent {
  private runtime: AgentForgeRuntime;
  private llm: LLMProvider;
  private context: ContextManager;

  constructor(runtime: AgentForgeRuntime, llm: LLMProvider) {
    this.runtime = runtime;
    this.llm = llm;
    this.context = new ContextManager();
  }

  public async initialize(instructions?: string | null): Promise<void> {
    let gitStatus;
    try {
      gitStatus = await this.runtime.git.status();
    } catch {
      // Non-fatal if git is not initialized
    }

    const descriptors = this.runtime.tools.getDescriptors();
    const toolsSummary = descriptors.map((d) => `${d.name} (${d.category}): ${d.description}`);

    const systemPrompt = SystemPromptBuilder.build({
      workspaceRoot: this.runtime.workspaceRoot,
      gitStatus,
      projectInstructions: instructions,
      toolsSummary,
    });

    this.context.setSystemPrompt(systemPrompt);
  }

  public async runTask(task: string, options: ReActLoopOptions = {}): Promise<ReActLoopResult> {
    const maxSteps = options.maxSteps || 25;
    this.context.addUserMessage(task);

    // Prepare tool definitions in OpenAI format
    const descriptors = this.runtime.tools.getDescriptors();
    const llmTools: LLMToolDefinition[] = descriptors.map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.inputSchemaJson as any,
    }));

    let stepsExecuted = 0;
    let finalAnswer = '';

    while (stepsExecuted < maxSteps) {
      if (options.abortSignal?.aborted) {
        return {
          success: false,
          stepsExecuted,
          finalAnswer: 'Task aborted by user.',
          error: 'AbortSignal triggered',
        };
      }

      stepsExecuted++;

      options.onEvent?.({
        step: stepsExecuted,
        maxSteps,
      });

      if (this.context.estimateTokenCount() > 60000) {
        this.context.compactHistory(10);
      }

      let response: LLMCompletionResponse;
      try {
        response = await this.llm.complete({
          messages: this.context.getMessages(),
          tools: llmTools.length > 0 ? llmTools : undefined,
          temperature: options.temperature ?? 0.2,
          abortSignal: options.abortSignal,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          stepsExecuted,
          finalAnswer: '',
          error: `LLM generation error: ${message}`,
        };
      }

      const hasToolCalls = response.toolCalls && response.toolCalls.length > 0;

      if (response.content) {
        options.onEvent?.({
          step: stepsExecuted,
          maxSteps,
          thought: response.content,
        });

        if (options.onToken) {
          options.onToken(response.content);
        }
      }

      // Add assistant response to history
      this.context.addAssistantMessage(response.content, response.toolCalls);

      if (!hasToolCalls) {
        // Model didn't call any tools, task completed
        finalAnswer = response.content;
        return {
          success: true,
          stepsExecuted,
          finalAnswer,
        };
      }

      // Execute each tool call
      for (const toolCall of response.toolCalls!) {
        options.onEvent?.({
          step: stepsExecuted,
          maxSteps,
          toolCall: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        });

        const toolResult = await this.executeTool(toolCall, options);

        const outputStr = toolResult.success
          ? typeof toolResult.data === 'string'
            ? toolResult.data
            : JSON.stringify(toolResult.data, null, 2)
          : `[FAIL] Tool execution failed: ${toolResult.error}`;

        options.onEvent?.({
          step: stepsExecuted,
          maxSteps,
          toolResult: {
            name: toolCall.name,
            success: toolResult.success,
            output: outputStr,
          },
        });

        this.context.addToolResult(toolCall.id, toolCall.name, outputStr);
      }
    }

    return {
      success: false,
      stepsExecuted,
      finalAnswer: 'Reached maximum reasoning steps without task completion.',
      error: `Max steps (${maxSteps}) exceeded`,
    };
  }

  private async executeTool(toolCall: ToolCall, options: ReActLoopOptions): Promise<ToolResult> {
    const tool = this.runtime.tools.get(toolCall.name);
    if (!tool) {
      return {
        success: false,
        error: `Tool "${toolCall.name}" is not registered in AgentForge.`,
        executionTimeMs: 0,
      };
    }

    const toolContext: ToolContext = {
      workspaceRoot: this.runtime.workspaceRoot,
      isInteractive: this.runtime.isInteractive,
      abortSignal: options.abortSignal,
      confirmAction: options.confirmAction,
    };

    // Permission evaluation
    const permission = this.runtime.permissions.evaluate({
      category: tool.category,
      toolName: tool.name,
      requiresConfirmation: tool.requiresConfirmation,
    });

    if (permission.verdict === 'block') {
      this.runtime.audit.log({
        action: `tool:${tool.name}`,
        category: tool.category,
        verdict: 'block',
        reason: permission.reason,
      });

      return {
        success: false,
        error: `Security policy blocked execution of ${tool.name}: ${permission.reason}`,
        executionTimeMs: 0,
      };
    }

    if (permission.verdict === 'require_confirmation' && options.confirmAction) {
      const confirmed = await options.confirmAction(
        `AgentForge requests permission to execute ${tool.name}`,
        toolCall.arguments,
      );

      if (!confirmed) {
        this.runtime.audit.log({
          action: `tool:${tool.name}`,
          category: tool.category,
          verdict: 'block',
          reason: 'User declined action confirmation',
        });

        return {
          success: false,
          error: 'Execution cancelled: user denied confirmation.',
          executionTimeMs: 0,
        };
      }
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(toolCall.arguments, toolContext);
      result.executionTimeMs = Date.now() - startTime;

      this.runtime.audit.log({
        action: `tool:${tool.name}`,
        category: tool.category,
        verdict: 'allow',
        metadata: { arguments: toolCall.arguments },
        executionTimeMs: result.executionTimeMs,
        success: result.success,
      });

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.runtime.audit.log({
        action: `tool:${tool.name}`,
        category: tool.category,
        verdict: 'block',
        reason: msg,
        success: false,
      });

      return {
        success: false,
        error: msg,
        executionTimeMs: 0,
      };
    }
  }

  public getContext(): ContextManager {
    return this.context;
  }
}
