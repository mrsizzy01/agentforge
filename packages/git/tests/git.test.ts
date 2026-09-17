import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { GitClient } from '../src/index.js';

describe('GitClient', () => {
  let tempDir: string;
  let git: GitClient;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-git-test-'));
    // Initialize git repository with user config for commit
    execSync('git init -b main', { cwd: tempDir });
    execSync('git config user.name "AgentForge Tester"', { cwd: tempDir });
    execSync('git config user.email "tester@agentforge.dev"', { cwd: tempDir });
    git = new GitClient({ workspaceRoot: tempDir });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('detects a valid git repository', async () => {
    expect(await git.isGitRepo()).toBe(true);
  });

  it('parses repository status correctly', async () => {
    fs.writeFileSync(path.join(tempDir, 'test.txt'), 'hello world');

    const statusBefore = await git.status();
    expect(statusBefore.clean).toBe(false);
    expect(statusBefore.untrackedFiles).toContain('test.txt');

    await git.stage(['test.txt']);
    const statusStaged = await git.status();
    expect(statusStaged.stagedFiles).toContain('test.txt');
  });

  it('commits changes and reads commit history', async () => {
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'initial commit content');
    await git.stage('.');
    await git.commit({ message: 'feat: initial commit' });

    const status = await git.status();
    expect(status.clean).toBe(true);

    const log = await git.log(5);
    expect(log.length).toBe(1);
    expect(log[0].message).toBe('feat: initial commit');
    expect(log[0].author).toBe('AgentForge Tester');
  });

  it('generates diff for modified files', async () => {
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'version 1');
    await git.stage('.');
    await git.commit({ message: 'feat: add file' });

    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'version 2');
    const diff = await git.diff();
    expect(diff).toContain('-version 1');
    expect(diff).toContain('+version 2');
  });

  it('creates, lists, and removes a shadow worktree', async () => {
    fs.writeFileSync(path.join(tempDir, 'base.txt'), 'base');
    await git.stage('.');
    await git.commit({ message: 'feat: base' });

    const worktreePath = path.join(tempDir, 'shadow-workspace');
    const res = await git.createWorktree(worktreePath, 'agentforge-shadow-test');

    expect(res.branch).toBe('agentforge-shadow-test');
    expect(fs.existsSync(worktreePath)).toBe(true);

    const worktrees = await git.listWorktrees();
    expect(worktrees.length).toBeGreaterThanOrEqual(2);

    await git.removeWorktree(worktreePath, true);
    expect(fs.existsSync(worktreePath)).toBe(false);
  });
});
