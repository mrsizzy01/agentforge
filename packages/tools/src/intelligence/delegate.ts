import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';

const InputSchema = z.object({
  task: z
    .string()
    .describe('Detailed objective for the sub-agent (e.g. "Find where user authentication tokens are validated in packages/security")'),
  maxSteps: z
    .number()
    .int()
    .positive()
    .optional()
    .default(8)
    .describe('Maximum reasoning steps allowed for the sub-agent (default: 8)'),
});

type Input = z.infer<typeof InputSchema>;

export type SubAgentRunner = (
  task: string,
  maxSteps: number,
  context: ToolContext,
) => Promise<{ success: boolean; answer: string; stepsExecuted: number }>;

export interface DelegateTaskOutput {
  task: string;
  success: boolean;
  stepsExecuted: number;
  summary: string;
}

export class DelegateTaskTool extends BaseTool<Input, DelegateTaskOutput> {
  public readonly name = 'delegate_task';
  public readonly description =
    'Spawn an ephemeral child sub-agent in an isolated context window to execute an exploration, research, or sub-task. Prevents polluting the supervisor agent context with excessive file contents.';
  public readonly category = 'execute' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private runner?: SubAgentRunner;

  constructor(runner?: SubAgentRunner) {
    super();
    this.runner = runner;
  }

  public setRunner(runner: SubAgentRunner): void {
    this.runner = runner;
  }

  public async run(input: Input, context: ToolContext): Promise<DelegateTaskOutput> {
    const maxSteps = input.maxSteps || 8;

    if (!this.runner) {
      return {
        task: input.task,
        success: false,
        stepsExecuted: 0,
        summary: `Sub-agent runner is not configured. Direct task execution was not possible.`,
      };
    }

    try {
      const result = await this.runner(input.task, maxSteps, context);
      return {
        task: input.task,
        success: result.success,
        stepsExecuted: result.stepsExecuted,
        summary: result.answer || (result.success ? 'Sub-task completed.' : 'Sub-task failed without explanation.'),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        task: input.task,
        success: false,
        stepsExecuted: 0,
        summary: `Sub-agent error: ${msg}`,
      };
    }
  }
}
