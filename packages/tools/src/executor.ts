import { ToolResult, ToolContext } from '@agentforge/types';
import { PermissionManager, AuditLogger, SecretDetector } from '@agentforge/security';
import { ToolRegistry } from './registry.js';

export interface ToolExecutorOptions {
  registry: ToolRegistry;
  permissionManager: PermissionManager;
  auditLogger: AuditLogger;
  secretDetector?: SecretDetector;
}

export class ToolExecutor {
  private registry: ToolRegistry;
  private permissionManager: PermissionManager;
  private auditLogger: AuditLogger;
  private secretDetector: SecretDetector;

  constructor(options: ToolExecutorOptions) {
    this.registry = options.registry;
    this.permissionManager = options.permissionManager;
    this.auditLogger = options.auditLogger;
    this.secretDetector = options.secretDetector || new SecretDetector();
  }

  public async execute(
    toolName: string,
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const tool = this.registry.get(toolName);

    if (!tool) {
      const err = `Tool "${toolName}" not found in registry.`;
      this.auditLogger.log({
        action: toolName,
        category: 'system',
        verdict: 'block',
        reason: err,
        success: false,
      });
      return {
        success: false,
        error: err,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 1. Tool-level security validation hook
    if (tool.validateSecurity) {
      const secCheck = await tool.validateSecurity(input, context);
      if (secCheck.verdict === 'block') {
        this.auditLogger.log({
          action: toolName,
          category: tool.category,
          verdict: 'block',
          reason: secCheck.reason,
          success: false,
        });
        return {
          success: false,
          error: `Execution blocked by tool security validation: ${secCheck.reason}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    // 2. Permission manager evaluation
    const permVerdict = this.permissionManager.evaluate({
      category: tool.category,
      toolName: tool.name,
      requiresConfirmation: tool.requiresConfirmation,
    });

    if (permVerdict.verdict === 'block') {
      this.auditLogger.log({
        action: toolName,
        category: tool.category,
        verdict: 'block',
        reason: permVerdict.reason,
        success: false,
      });
      return {
        success: false,
        error: permVerdict.reason || `Execution of "${toolName}" blocked by permission policy.`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 3. Confirmation flow if needed
    if (permVerdict.verdict === 'require_confirmation') {
      if (!context.confirmAction) {
        return {
          success: false,
          error: `Operation "${toolName}" requires user confirmation, but no confirmation handler is available in current context.`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const prompt = `Allow tool "${toolName}" (${tool.category}) to execute?`;
      const confirmed = await context.confirmAction(prompt, { tool: toolName, input });

      if (!confirmed) {
        this.auditLogger.log({
          action: toolName,
          category: tool.category,
          verdict: 'require_confirmation',
          reason: 'User declined action',
          success: false,
        });
        return {
          success: false,
          error: `Execution of "${toolName}" cancelled by user.`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    // 4. Run the tool
    const result = await tool.execute(input, context);

    // 5. Redact secrets in output if string
    let sanitizedData = result.data;
    if (typeof sanitizedData === 'string') {
      sanitizedData = this.secretDetector.redactSecrets(sanitizedData);
    }

    const duration = Date.now() - startTime;

    // 6. Audit log
    this.auditLogger.log({
      action: toolName,
      category: tool.category,
      verdict: 'allow',
      executionTimeMs: duration,
      success: result.success,
      reason: result.error,
    });

    return {
      ...result,
      data: sanitizedData,
      executionTimeMs: duration,
    };
  }
}
