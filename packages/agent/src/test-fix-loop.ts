import { ReActAgent, AgentStepEvent } from './react-loop.js';
import { AgentForgeRuntime } from '@agentforge/core';

export interface TestFixOptions {
  testCommand?: string;
  maxRetries?: number;
  onEvent?: (event: AgentStepEvent) => void;
  onStatusUpdate?: (status: string) => void;
}

export interface TestFixResult {
  success: boolean;
  retriesAttempted: number;
  initialOutput: string;
  finalOutput: string;
  repairedFiles: string[];
}

export class TestFixEngine {
  private runtime: AgentForgeRuntime;
  private agent: ReActAgent;

  constructor(runtime: AgentForgeRuntime, agent: ReActAgent) {
    this.runtime = runtime;
    this.agent = agent;
  }

  public async runAndFix(options: TestFixOptions = {}): Promise<TestFixResult> {
    const testCommand = options.testCommand || 'npm test';
    const maxRetries = options.maxRetries || 3;

    options.onStatusUpdate?.(`Running test command: ${testCommand}`);

    let runResult = await this.runtime.terminal.execute(testCommand, {
      cwd: this.runtime.workspaceRoot,
    });

    const initialOutput = `${runResult.stdout}\n${runResult.stderr}`.trim();

    if (runResult.exitCode === 0) {
      options.onStatusUpdate?.('[OK] All tests are already passing!');
      return {
        success: true,
        retriesAttempted: 0,
        initialOutput,
        finalOutput: initialOutput,
        repairedFiles: [],
      };
    }

    options.onStatusUpdate?.(
      `[FAIL] Tests failed with exit code ${runResult.exitCode}. Initiating autonomous repair loop...`,
    );

    let retries = 0;
    let currentOutput = initialOutput;

    while (retries < maxRetries) {
      retries++;
      options.onStatusUpdate?.(`[STEP] Autonomous repair attempt ${retries}/${maxRetries}...`);

      const repairTask = `The automated test suite failed when executing "${testCommand}".
Here is the failure log:
\`\`\`
${currentOutput.slice(-3000)}
\`\`\`

YOUR OBJECTIVE:
1. Locate the failing tests and underlying source code causing this failure.
2. Read the files and understand the root cause.
3. Edit the files to fix the error.
4. Verify by running the tests again using run_command.
5. Report what you fixed.`;

      const agentResult = await this.agent.runTask(repairTask, {
        onEvent: options.onEvent,
        maxSteps: 15,
      });

      if (!agentResult.success && agentResult.error) {
        options.onStatusUpdate?.(
          `[WARN] Agent repair step encountered error: ${agentResult.error}`,
        );
      }

      // Re-run test command to verify fix
      options.onStatusUpdate?.(`Verifying test suite: ${testCommand}`);
      runResult = await this.runtime.terminal.execute(testCommand, {
        cwd: this.runtime.workspaceRoot,
      });

      currentOutput = `${runResult.stdout}\n${runResult.stderr}`.trim();

      if (runResult.exitCode === 0) {
        options.onStatusUpdate?.(
          `[OK] Tests successfully passing after ${retries} repair iterations!`,
        );
        return {
          success: true,
          retriesAttempted: retries,
          initialOutput,
          finalOutput: currentOutput,
          repairedFiles: [],
        };
      }
    }

    options.onStatusUpdate?.(
      `[FAIL] Could not automatically pass tests within ${maxRetries} attempts.`,
    );

    return {
      success: false,
      retriesAttempted: retries,
      initialOutput,
      finalOutput: currentOutput,
      repairedFiles: [],
    };
  }
}
