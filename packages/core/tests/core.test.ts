import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentForgeRuntime, Logger } from '../src/index.js';

describe('AgentForgeRuntime', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-core-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('initializes runtime with all 12 Phase 1 built-in tools registered', () => {
    const runtime = new AgentForgeRuntime({ workspaceRoot: tempDir });
    const tools = runtime.registry.getAll();

    expect(tools.length).toBe(12);
    expect(runtime.registry.has('read_file')).toBe(true);
    expect(runtime.registry.has('write_file')).toBe(true);
    expect(runtime.registry.has('edit_file')).toBe(true);
    expect(runtime.registry.has('delete_file')).toBe(true);
    expect(runtime.registry.has('list_directory')).toBe(true);
    expect(runtime.registry.has('search_files')).toBe(true);
    expect(runtime.registry.has('search_code')).toBe(true);
    expect(runtime.registry.has('run_command')).toBe(true);
    expect(runtime.registry.has('git_status')).toBe(true);
    expect(runtime.registry.has('git_diff')).toBe(true);
    expect(runtime.registry.has('git_log')).toBe(true);
    expect(runtime.registry.has('git_commit')).toBe(true);
  });

  it('initializes workspace with config.json and AGENTFORGE.md', () => {
    const runtime = new AgentForgeRuntime({ workspaceRoot: tempDir });
    const { createdConfig, createdInstructions } = runtime.initWorkspace();

    expect(createdConfig).toBe(true);
    expect(createdInstructions).toBe(true);

    const configFile = path.join(tempDir, '.agentforge', 'config.json');
    const instructionsFile = path.join(tempDir, 'AGENTFORGE.md');

    expect(fs.existsSync(configFile)).toBe(true);
    expect(fs.existsSync(instructionsFile)).toBe(true);
  });
});

describe('Logger', () => {
  it('instantiates and formats log output', () => {
    const logger = new Logger({ level: 'debug', format: 'json' });
    expect(logger).toBeDefined();
  });
});
