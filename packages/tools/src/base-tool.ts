import { z } from 'zod';
import {
  ToolDefinition,
  ToolPermissionCategory,
  ToolResult,
  ToolContext,
  SecurityVerdict,
} from '@agentforge/types';

export abstract class BaseTool<TInput = unknown, TOutput = unknown> implements ToolDefinition<
  TInput,
  TOutput
> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: ToolPermissionCategory;
  abstract readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  readonly requiresConfirmation: boolean = false;

  abstract run(input: TInput, context: ToolContext): Promise<TOutput>;

  public async execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>> {
    const startTime = Date.now();
    try {
      // Validate input schema
      const parsed = this.inputSchema.parse(input);
      const data = await this.run(parsed, context);
      return {
        success: true,
        data,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message || String(err),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  public async validateSecurity(
    _input: TInput,
    _context: ToolContext,
  ): Promise<{ verdict: SecurityVerdict; reason?: string }> {
    return { verdict: 'allow' };
  }
}
