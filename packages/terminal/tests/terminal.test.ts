import { describe, it, expect } from 'vitest';
import { ProcessExecutor } from '../src/index.js';

describe('ProcessExecutor', () => {
  const executor = new ProcessExecutor({
    workspaceRoot: process.cwd(),
    defaultTimeoutMs: 10000,
  });

  it('executes safe commands and captures stdout', async () => {
    const result = await executor.execute('node -e "console.log(\'agentforge terminal ok\')"');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('agentforge terminal ok');
    expect(result.timedOut).toBe(false);
  });

  it('blocks dangerous commands before spawning', async () => {
    await expect(executor.execute('rm -rf /')).rejects.toThrow('Command blocked by security policy');
  });

  it('redacts detected secrets from process output', async () => {
    const result = await executor.execute(
      'node -e "console.log(\'token=sk-12345678901234567890abcdef\')"',
    );
    expect(result.stdout).not.toContain('sk-12345678901234567890abcdef');
    expect(result.stdout).toContain('[REDACTED_SECRET]');
  });

  it('enforces command execution timeout', async () => {
    // 500ms timeout on a script that sleeps for 3 seconds
    const result = await executor.execute(
      'node -e "setTimeout(() => {}, 3000)"',
      { timeoutMs: 500 },
    );
    expect(result.timedOut).toBe(true);
  });
});
