import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext, CommandResult, SecurityVerdict } from '@agentforge/types';
import { ProcessExecutor } from '@agentforge/terminal';
import { CommandSafetyValidator } from '@agentforge/security';

const RunCommandInputSchema = z.object({
  command: z.string().min(1).describe('Shell command to execute'),
  cwd: z.string().optional().describe('Working directory relative to workspace root'),
  timeoutMs: z.number().int().positive().optional().describe('Timeout in milliseconds'),
});

type RunCommandInput = z.infer<typeof RunCommandInputSchema>;

export class RunCommandTool extends BaseTool<RunCommandInput, CommandResult> {
  readonly name = 'run_command';
  readonly description =
    'Executes a shell command safely inside the workspace with timeout and security checks.';
  readonly category = 'execute' as const;
  readonly inputSchema = RunCommandInputSchema;
  override readonly requiresConfirmation = true;

  private executor: ProcessExecutor;
  private safetyValidator: CommandSafetyValidator;

  constructor(executor: ProcessExecutor, safetyValidator?: CommandSafetyValidator) {
    super();
    this.executor = executor;
    this.safetyValidator = safetyValidator || new CommandSafetyValidator();
  }

  override async validateSecurity(
    input: RunCommandInput,
    _context: ToolContext,
  ): Promise<{ verdict: SecurityVerdict; reason?: string }> {
    const analysis = this.safetyValidator.analyze(input.command);
    if (analysis.isBlocked) {
      return {
        verdict: 'block',
        reason: `Command blocked: ${analysis.reasons.join('; ')}`,
      };
    }
    if (analysis.requiresConfirmation) {
      return {
        verdict: 'require_confirmation',
        reason: `Command requires confirmation: ${analysis.reasons.join('; ')}`,
      };
    }
    return { verdict: 'allow' };
  }

  async run(input: RunCommandInput, context: ToolContext): Promise<CommandResult> {
    return this.executor.execute(
      input.command,
      {
        cwd: input.cwd,
        timeoutMs: input.timeoutMs,
      },
      context.abortSignal,
    );
  }
}
