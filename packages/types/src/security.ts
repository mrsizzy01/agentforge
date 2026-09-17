import { z } from 'zod';

export type PermissionLevel = 'readonly' | 'safe' | 'interactive' | 'autonomous';

export const PermissionLevelSchema = z.enum(['readonly', 'safe', 'interactive', 'autonomous']);

export type ToolPermissionCategory = 'read' | 'write' | 'execute' | 'git' | 'network' | 'system';

export type SecurityVerdict = 'allow' | 'require_confirmation' | 'block';

export interface SecurityCheckResult {
  verdict: SecurityVerdict;
  reason?: string;
  category?: ToolPermissionCategory;
  suggestedAction?: string;
}

export interface SecretMatch {
  type: string;
  preview: string;
  index: number;
  length: number;
}

export interface AuditRecord {
  id: string;
  timestamp: number;
  action: string;
  category: ToolPermissionCategory;
  target?: string;
  verdict: SecurityVerdict;
  reason?: string;
  actor: 'agent' | 'user' | 'system';
  executionTimeMs?: number;
  success?: boolean;
  metadata?: Record<string, unknown>;
}
