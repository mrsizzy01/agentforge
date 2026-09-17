import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createCli } from '../src/cli.js';

describe('AgentForge CLI', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-cli-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('configures program name and version', () => {
    const program = createCli();
    expect(program.name()).toBe('agentforge');
    expect(program.version()).toBe('0.1.0');
  });

  it('defines all required core commands', () => {
    const program = createCli();
    const commandNames = program.commands.map((c) => c.name());

    expect(commandNames).toContain('doctor');
    expect(commandNames).toContain('init');
    expect(commandNames).toContain('config');
    expect(commandNames).toContain('tools');
    expect(commandNames).toContain('git');
    expect(commandNames).toContain('run');
    expect(commandNames).toContain('analyze');
    expect(commandNames).toContain('chat');
  });

  it('runs init command successfully in a workspace', async () => {
    const program = createCli();
    program.exitOverride(); // Prevent process.exit during test

    await program.parseAsync(['node', 'agentforge', 'init', '--cwd', tempDir, '--non-interactive']);

    expect(fs.existsSync(path.join(tempDir, '.agentforge', 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'AGENTFORGE.md'))).toBe(true);
  });
});
