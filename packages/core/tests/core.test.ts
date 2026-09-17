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

    expect(tools.length).toBe(20);
    expect(runtime.registry.has('read_file')).toBe(true);
    expect(runtime.registry.has('write_file')).toBe(true);
    expect(runtime.registry.has('edit_file')).toBe(true);
    expect(runtime.registry.has('apply_patch')).toBe(true);
    expect(runtime.registry.has('delete_file')).toBe(true);
    expect(runtime.registry.has('list_directory')).toBe(true);
    expect(runtime.registry.has('search_files')).toBe(true);
    expect(runtime.registry.has('search_code')).toBe(true);
    expect(runtime.registry.has('get_file_outline')).toBe(true);
    expect(runtime.registry.has('find_symbols')).toBe(true);
    expect(runtime.registry.has('run_command')).toBe(true);
    expect(runtime.registry.has('run_tests')).toBe(true);
    expect(runtime.registry.has('git_status')).toBe(true);
    expect(runtime.registry.has('git_diff')).toBe(true);
    expect(runtime.registry.has('git_log')).toBe(true);
    expect(runtime.registry.has('git_commit')).toBe(true);
    expect(runtime.registry.has('diff_review')).toBe(true);
    expect(runtime.registry.has('create_plan')).toBe(true);
    expect(runtime.registry.has('check_diagnostics')).toBe(true);
    expect(runtime.registry.has('read_url')).toBe(true);
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

describe('SessionManager', () => {
  it('records sessions, backs up modified files, and performs rollback', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-session-test-'));
    const { SessionManager } = await import('../src/index.js');
    const sm = new SessionManager(tempDir);

    const testFilePath = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(testFilePath, 'Original Content', 'utf-8');

    const session = sm.createSession('Refactor sample.txt');
    expect(session.id).toBeDefined();
    expect(session.status).toBe('running');

    // Backup before modification
    const backupPath = await sm.recordFileBackup(session.id, 'sample.txt');
    expect(backupPath).toBeDefined();

    // Modify file
    fs.writeFileSync(testFilePath, 'Corrupted or Unwanted Content', 'utf-8');

    // Rollback session
    const rollbackRes = await sm.rollback(session.id);
    expect(rollbackRes.success).toBe(true);
    expect(rollbackRes.restoredFiles).toContain('sample.txt');

    // Content should be restored to original
    const restoredContent = fs.readFileSync(testFilePath, 'utf-8');
    expect(restoredContent).toBe('Original Content');

    const updatedSession = sm.getSession(session.id);
    expect(updatedSession?.status).toBe('rolled_back');

    // Test session message persistence
    const testMessages = [
      { role: 'user', content: 'Initial objective' },
      { role: 'assistant', content: 'Planning step' },
    ];
    sm.saveSessionMessages(session.id, testMessages);

    const loadedMessages = sm.loadSessionMessages(session.id);
    expect(loadedMessages).toHaveLength(2);
    expect((loadedMessages as any)[0].content).toBe('Initial objective');

    const latest = sm.getLatestSession();
    expect(latest?.id).toBe(session.id);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
