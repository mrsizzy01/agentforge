import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { GitClient } from '../src/index.js';

describe('GitClient Checkpoint & Rollback', () => {
  let tempDir: string;
  let git: GitClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-cp-test-'));
    execSync('git init -b main', { cwd: tempDir });
    execSync('git config user.name "AgentForge Tester"', { cwd: tempDir });
    execSync('git config user.email "tester@agentforge.dev"', { cwd: tempDir });
    fs.writeFileSync(path.join(tempDir, 'initial.txt'), 'base content');
    execSync('git add . && git commit -m "initial"', { cwd: tempDir });
    git = new GitClient({ workspaceRoot: tempDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('creates and lists checkpoints correctly', async () => {
    // Modify a file
    fs.writeFileSync(path.join(tempDir, 'feature.txt'), 'new work');

    const cp = await git.createCheckpoint('before_refactor');
    expect(cp.id).toBeDefined();
    expect(cp.label).toBe('before_refactor');

    // Working directory should still have the file
    expect(fs.existsSync(path.join(tempDir, 'feature.txt'))).toBe(true);

    const list = await git.listCheckpoints();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].id).toBe(cp.id);
    expect(list[0].label).toBe('before_refactor');
  });

  it('restores workspace state to a checkpoint', async () => {
    fs.writeFileSync(path.join(tempDir, 'original.txt'), 'original');
    const cp = await git.createCheckpoint('state_1');

    // Cause some chaos / bad edits
    fs.writeFileSync(path.join(tempDir, 'original.txt'), 'corrupted content');
    fs.writeFileSync(path.join(tempDir, 'unwanted.txt'), 'bad file');

    // Rollback to checkpoint
    await git.restoreCheckpoint(cp.id);

    expect(fs.readFileSync(path.join(tempDir, 'original.txt'), 'utf-8')).toBe('original');
    expect(fs.existsSync(path.join(tempDir, 'unwanted.txt'))).toBe(false);
  });
});
