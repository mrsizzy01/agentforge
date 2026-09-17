import { describe, it, expect } from 'vitest';
import { DelegateTaskTool } from '../src/intelligence/delegate.js';
import { ToolContext } from '@agentforge/types';

describe('DelegateTaskTool', () => {
  const context: ToolContext = {
    workspaceRoot: '/test',
    isInteractive: false,
  };

  it('reports failure if runner is not configured', async () => {
    const tool = new DelegateTaskTool();
    const res = await tool.execute({ task: 'Explore something' }, context);
    expect(res.success).toBe(true);
    expect(res.data?.success).toBe(false);
    expect(res.data?.summary).toContain('runner is not configured');
  });

  it('delegates to child sub-agent runner and returns summary', async () => {
    const tool = new DelegateTaskTool(async (task, maxSteps) => {
      return {
        success: true,
        stepsExecuted: 3,
        answer: `Completed sub-task: ${task} in ${maxSteps} steps. Found 2 files.`,
      };
    });

    const res = await tool.execute({ task: 'Find database models', maxSteps: 5 }, context);
    expect(res.success).toBe(true);
    expect(res.data?.success).toBe(true);
    expect(res.data?.stepsExecuted).toBe(3);
    expect(res.data?.summary).toContain('Found 2 files');
  });
});
