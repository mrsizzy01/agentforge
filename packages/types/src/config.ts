import { z } from 'zod';
import { PermissionLevelSchema } from './security.js';

export const ProviderTypeSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'mistral',
  'ollama',
  'lmstudio',
  'custom',
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const SecurityConfigSchema = z.object({
  permissionLevel: PermissionLevelSchema.default('interactive'),
  allowedDirectories: z.array(z.string()).default([]),
  blockedCommands: z.array(z.string()).default([]),
  sensitiveFilePatterns: z
    .array(z.string())
    .default(['**/.env*', '**/id_rsa*', '**/*.pem', '**/*.key', '**/credentials*', '**/secrets*']),
  maxFileSizeBytes: z
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024), // 5MB
  commandTimeoutMs: z.number().int().positive().default(60000), // 60s
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const ProviderConfigSchema = z.object({
  type: ProviderTypeSchema.default('openai'),
  model: z.string().default('gpt-4o'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().positive().optional(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const McpServerConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  cwd: z.string().optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const AgentForgeConfigSchema = z.object({
  version: z.string().default('0.1.0'),
  telemetry: z.boolean().default(false),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  security: SecurityConfigSchema.default({}),
  provider: ProviderConfigSchema.default({}),
  mcpServers: z.record(McpServerConfigSchema).default({}),
  customInstructionsFile: z.string().default('AGENTFORGE.md'),
});
export type AgentForgeConfig = z.infer<typeof AgentForgeConfigSchema>;

