import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';

const PlanStepSchema = z.object({
  step: z.number().describe('Step number (1-based)'),
  action: z.string().describe('What action will be taken'),
  tool: z.string().optional().describe('Tool that will be used (if applicable)'),
  rationale: z.string().describe('Why this step is necessary'),
  risk: z.enum(['low', 'medium', 'high']).default('low').describe('Risk level of this step'),
});

const InputSchema = z.object({
  title: z.string().describe('Short title summarizing the overall plan (max 80 chars)'),
  objective: z.string().describe('Clear description of the goal to achieve'),
  steps: z.array(PlanStepSchema).min(1).describe('Ordered list of execution steps'),
  estimatedDuration: z
    .string()
    .optional()
    .describe('Rough time estimate (e.g. "2 minutes", "5-10 steps")'),
  risks: z.string().optional().describe('Known risks or potential side effects'),
});

type Input = z.infer<typeof InputSchema>;

export interface PlanOutput {
  approved: boolean;
  planMarkdown: string;
  stepCount: number;
  highRiskSteps: number;
}

export class PlanTool extends BaseTool<Input, PlanOutput> {
  public readonly name = 'create_plan';
  public readonly description =
    'Creates a structured execution plan before performing complex multi-step operations. Shows the plan to the user in interactive mode and logs it in non-interactive mode. Use this before any task with 3+ file modifications or irreversible operations.';
  public readonly category = 'read' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  public async run(input: Input, _context: ToolContext): Promise<PlanOutput> {
    const highRiskSteps = input.steps.filter((s) => s.risk === 'high').length;
    const planMarkdown = PlanTool.formatPlan(input);

    // Always emit the plan to stdout so the user sees it
    process.stdout.write(`\n${planMarkdown}\n`);

    return {
      approved: true, // Plan is recorded; agent proceeds
      planMarkdown,
      stepCount: input.steps.length,
      highRiskSteps,
    };
  }

  public static formatPlan(input: Input): string {
    const riskIcon = (r: string) =>
      r === 'high' ? '🔴' : r === 'medium' ? '🟡' : '🟢';

    const lines: string[] = [
      `## Plan: ${input.title}`,
      '',
      `**Objective:** ${input.objective}`,
    ];

    if (input.estimatedDuration) {
      lines.push(`**Estimated duration:** ${input.estimatedDuration}`);
    }

    lines.push('');
    lines.push('### Steps');
    lines.push('');

    for (const step of input.steps) {
      const toolNote = step.tool ? ` _(tool: \`${step.tool}\`)_` : '';
      lines.push(`**${step.step}.** ${step.action}${toolNote}`);
      lines.push(`   - Rationale: ${step.rationale}`);
      lines.push(`   - Risk: ${riskIcon(step.risk)} ${step.risk}`);
      lines.push('');
    }

    if (input.risks) {
      lines.push('### Known Risks');
      lines.push('');
      lines.push(input.risks);
      lines.push('');
    }

    return lines.join('\n');
  }
}
