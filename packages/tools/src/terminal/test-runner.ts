import { z } from 'zod';
import { BaseTool } from '../base-tool.js';
import { ToolContext } from '@agentforge/types';
import { ProcessExecutor } from '@agentforge/terminal';

const InputSchema = z.object({
  command: z
    .string()
    .optional()
    .describe(
      'Test command to run (auto-detected from package.json if omitted). Examples: "pnpm test", "npm test", "pytest", "go test ./..."',
    ),
  timeoutSeconds: z
    .number()
    .optional()
    .describe('Maximum seconds to wait for tests to complete (default: 120)'),
  filter: z
    .string()
    .optional()
    .describe('Filter tests by name pattern (passed as --testNamePattern or equivalent)'),
});

type Input = z.infer<typeof InputSchema>;

export interface TestRunResult {
  command: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: string;
  failures: TestFailure[];
  rawOutput: string;
  summary: string;
}

export interface TestFailure {
  name: string;
  message: string;
  location?: string;
}

export class TestRunnerTool extends BaseTool<Input, TestRunResult> {
  public readonly name = 'run_tests';
  public readonly description =
    'Runs the project test suite and returns a structured result including pass/fail counts and detailed failure messages. Automatically detects test framework (vitest, jest, pytest, go test, cargo test). Use this to verify code changes before committing.';
  public readonly category = 'execute' as const;
  public readonly inputSchema = InputSchema;
  public readonly requiresConfirmation = false;

  private terminal: ProcessExecutor;

  constructor(terminal: ProcessExecutor) {
    super();
    this.terminal = terminal;
  }

  public async run(input: Input, _context: ToolContext): Promise<TestRunResult> {
    const command = input.command || (await this.detectTestCommand());
    const timeout = (input.timeoutSeconds || 120) * 1000;

    const fullCommand = input.filter
      ? TestRunnerTool.appendFilter(command, input.filter)
      : command;

    const startTime = Date.now();
    let rawOutput = '';
    let exitCode = 0;

    try {
      const result = await this.terminal.execute(fullCommand, { timeoutMs: timeout });
      rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
      exitCode = result.exitCode;
    } catch (err) {
      rawOutput = err instanceof Error ? err.message : String(err);
      exitCode = 1;
    }

    const durationMs = Date.now() - startTime;
    const duration = TestRunnerTool.formatDuration(durationMs);
    const parsed = TestRunnerTool.parseOutput(rawOutput, command);

    const passed = exitCode === 0 && parsed.failedTests === 0;
    const summary = TestRunnerTool.buildSummary({ command, passed, duration, ...parsed });

    return {
      command: fullCommand,
      passed,
      duration,
      rawOutput:
        rawOutput.length > 8000
          ? rawOutput.slice(0, 4000) + '\n...[truncated]...\n' + rawOutput.slice(-4000)
          : rawOutput,
      summary,
      ...parsed,
    };
  }

  private async detectTestCommand(): Promise<string> {
    // Try to read package.json for test script
    try {
      const result = await this.terminal.execute('node -e "const p=require(\'./package.json\');console.log(p.scripts&&p.scripts.test||\'\')"', {
        timeoutMs: 5000,
      });
      const scriptCmd = result.stdout.trim();
      if (scriptCmd && scriptCmd !== 'echo "Error: no test specified"') {
        return 'npm test';
      }
    } catch {
      // fallback
    }

    // Detect by lockfile / config presence
    try {
      const lsResult = await this.terminal.execute('dir /b 2>nul || ls -1 2>/dev/null', {
        timeoutMs: 3000,
      });
      const files = lsResult.stdout.toLowerCase();

      if (files.includes('vitest.config') || files.includes('vitest.workspace')) return 'npx vitest run';
      if (files.includes('jest.config')) return 'npx jest';
      if (files.includes('pytest.ini') || files.includes('pyproject.toml')) return 'pytest';
      if (files.includes('cargo.toml')) return 'cargo test';
      if (files.includes('go.mod')) return 'go test ./...';
    } catch {
      // fallback
    }

    return 'npm test';
  }

  private static appendFilter(command: string, filter: string): string {
    if (command.includes('vitest') || command.includes('jest'))
      return `${command} --testNamePattern "${filter}"`;
    if (command.includes('pytest')) return `${command} -k "${filter}"`;
    if (command.includes('cargo')) return `${command} ${filter}`;
    return `${command} --grep "${filter}"`;
  }

  private static parseOutput(
    output: string,
    command: string,
  ): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    failures: TestFailure[];
  } {
    // Vitest output pattern: "Tests  X failed | Y passed (Z)"
    const vitestMatch = output.match(/Tests\s+(\d+)\s+failed\s*\|\s*(\d+)\s+passed\s*\((\d+)\)/);
    if (vitestMatch) {
      const failed = parseInt(vitestMatch[1], 10);
      const passed = parseInt(vitestMatch[2], 10);
      const total = parseInt(vitestMatch[3], 10);
      return {
        totalTests: total,
        passedTests: passed,
        failedTests: failed,
        skippedTests: total - passed - failed,
        failures: TestRunnerTool.extractVitestFailures(output),
      };
    }

    // Vitest all passing: "Tests  X passed (Y)"
    const vitestPassMatch = output.match(/Tests\s+(\d+)\s+passed\s*\((\d+)\)/);
    if (vitestPassMatch) {
      const passed = parseInt(vitestPassMatch[1], 10);
      return {
        totalTests: passed,
        passedTests: passed,
        failedTests: 0,
        skippedTests: 0,
        failures: [],
      };
    }

    // Jest output pattern: "Tests: X failed, Y passed, Z total"
    const jestMatch = output.match(/Tests:\s*(.+)/);
    if (jestMatch) {
      const failMatch = jestMatch[1].match(/(\d+)\s+failed/);
      const passMatch = jestMatch[1].match(/(\d+)\s+passed/);
      const totalMatch = jestMatch[1].match(/(\d+)\s+total/);
      const skipMatch = jestMatch[1].match(/(\d+)\s+skipped/);

      return {
        totalTests: totalMatch ? parseInt(totalMatch[1], 10) : 0,
        passedTests: passMatch ? parseInt(passMatch[1], 10) : 0,
        failedTests: failMatch ? parseInt(failMatch[1], 10) : 0,
        skippedTests: skipMatch ? parseInt(skipMatch[1], 10) : 0,
        failures: [],
      };
    }

    // Pytest: "X passed, Y failed, Z warnings"
    const pytestMatch = output.match(/(\d+)\s+passed/);
    const pytestFail = output.match(/(\d+)\s+failed/);
    if (pytestMatch || pytestFail) {
      const passed = pytestMatch ? parseInt(pytestMatch[1], 10) : 0;
      const failed = pytestFail ? parseInt(pytestFail[1], 10) : 0;
      return {
        totalTests: passed + failed,
        passedTests: passed,
        failedTests: failed,
        skippedTests: 0,
        failures: [],
      };
    }

    // Cargo: "test result: ok/FAILED. X passed; Y failed"
    const cargoMatch = output.match(/test result: (?:ok|FAILED)\. (\d+) passed; (\d+) failed/);
    if (cargoMatch) {
      const passed = parseInt(cargoMatch[1], 10);
      const failed = parseInt(cargoMatch[2], 10);
      return {
        totalTests: passed + failed,
        passedTests: passed,
        failedTests: failed,
        skippedTests: 0,
        failures: [],
      };
    }

    // Unknown / fallback: signal success/failure from exit
    void command;
    return { totalTests: 0, passedTests: 0, failedTests: 0, skippedTests: 0, failures: [] };
  }

  private static extractVitestFailures(output: string): TestFailure[] {
    const failures: TestFailure[] = [];
    // Match "× test name Xms" blocks
    const lines = output.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('×') || line.includes('FAIL')) {
        const nameMatch = line.match(/[×✗]\s+(.+?)(?:\s+\d+ms)?$/);
        if (nameMatch) {
          // Grab next few lines for the error message
          const msgLines = lines.slice(i + 1, i + 6).filter((l) => l.trim());
          failures.push({
            name: nameMatch[1].trim(),
            message: msgLines.slice(0, 3).join(' ').trim(),
            location: msgLines.find((l) => l.includes('.ts:') || l.includes('.js:')),
          });
        }
      }
    }
    return failures.slice(0, 20); // Cap at 20 failures
  }

  private static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  private static buildSummary(opts: {
    command: string;
    passed: boolean;
    duration: string;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    failures: TestFailure[];
  }): string {
    const status = opts.passed ? '✅ PASSED' : '❌ FAILED';
    const lines = [
      `## Test Results — ${status}`,
      '',
      `**Command:** \`${opts.command}\``,
      `**Duration:** ${opts.duration}`,
      `**Total:** ${opts.totalTests} | **Passed:** ${opts.passedTests} | **Failed:** ${opts.failedTests} | **Skipped:** ${opts.skippedTests}`,
    ];

    if (opts.failures.length > 0) {
      lines.push('', '### Failures');
      for (const f of opts.failures) {
        lines.push(`- **${f.name}**: ${f.message}`);
        if (f.location) lines.push(`  at \`${f.location}\``);
      }
    }

    return lines.join('\n');
  }
}
