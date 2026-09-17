import { z } from 'zod';
import { ToolPermissionCategory, SecurityVerdict } from './security.js';

export interface ToolContext {
  workspaceRoot: string;
  isInteractive: boolean;
  abortSignal?: AbortSignal;
  confirmAction?: (prompt: string, details?: Record<string, unknown>) => Promise<boolean>;
  log?: (message: string, level?: 'debug' | 'info' | 'warn' | 'error') => void;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTimeMs: number;
  auditMetadata?: Record<string, unknown>;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly category: ToolPermissionCategory;
  readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  readonly requiresConfirmation?: boolean;
  execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
  validateSecurity?(
    input: TInput,
    context: ToolContext,
  ): Promise<{
    verdict: SecurityVerdict;
    reason?: string;
  }>;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  category: ToolPermissionCategory;
  inputSchemaJson: Record<string, unknown>;
  requiresConfirmation: boolean;
}
