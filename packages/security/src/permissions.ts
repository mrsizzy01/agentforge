import {
  PermissionLevel,
  ToolPermissionCategory,
  SecurityCheckResult,
} from '@agentforge/types';

export interface PermissionEvaluationInput {
  category: ToolPermissionCategory;
  toolName: string;
  isDangerous?: boolean;
  requiresConfirmation?: boolean;
}

export class PermissionManager {
  private level: PermissionLevel;

  constructor(initialLevel: PermissionLevel = 'interactive') {
    this.level = initialLevel;
  }

  public getLevel(): PermissionLevel {
    return this.level;
  }

  public setLevel(level: PermissionLevel): void {
    this.level = level;
  }

  public evaluate(input: PermissionEvaluationInput): SecurityCheckResult {
    const { category, toolName, isDangerous, requiresConfirmation } = input;

    // Hard block if flagged as dangerous/malicious regardless of level
    if (isDangerous) {
      return {
        verdict: 'block',
        category,
        reason: `Operation is classified as dangerous and cannot be executed automatically.`,
      };
    }

    // 1. Readonly level: only read operations are permitted
    if (this.level === 'readonly') {
      if (category === 'read' || (category === 'git' && ['git_status', 'git_diff', 'git_log'].includes(toolName))) {
        return { verdict: 'allow', category };
      }
      return {
        verdict: 'block',
        category,
        reason: `AgentForge is running in "readonly" mode. Modification or execution tool "${toolName}" (${category}) is blocked.`,
      };
    }

    // 2. Safe level: read operations allowed, writes & commands require confirmation
    if (this.level === 'safe') {
      if (category === 'read') {
        return { verdict: 'allow', category };
      }
      return {
        verdict: 'require_confirmation',
        category,
        reason: `Safe mode requires human confirmation for "${toolName}" (${category}).`,
        suggestedAction: `Confirm execution of ${toolName}`,
      };
    }

    // 3. Interactive level (default): reads are allowed; tool-specific confirmation is respected
    if (this.level === 'interactive') {
      if (requiresConfirmation || category === 'execute' || category === 'system') {
        return {
          verdict: 'require_confirmation',
          category,
          reason: `Interactive mode requires confirmation for ${toolName}.`,
        };
      }
      return { verdict: 'allow', category };
    }

    // 4. Autonomous level: allowed unless explicitly marked as dangerous
    if (this.level === 'autonomous') {
      if (requiresConfirmation) {
        // Even in autonomous, critical tools can specify confirmation if needed
        return {
          verdict: 'require_confirmation',
          category,
          reason: `Tool "${toolName}" specifies mandatory confirmation.`,
        };
      }
      return { verdict: 'allow', category };
    }

    return {
      verdict: 'require_confirmation',
      category,
      reason: `Unknown permission level "${this.level}". Fallback to confirmation.`,
    };
  }
}
