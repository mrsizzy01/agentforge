import { ProcessExecutor } from '@agentforge/terminal';
import {
  GitStatus,
  GitFileStatus,
  GitLogEntry,
  GitCommitOptions,
  GitDiffOptions,
} from '@agentforge/types';

export interface GitClientOptions {
  workspaceRoot: string;
  processExecutor?: ProcessExecutor;
}

export class GitClient {
  private workspaceRoot: string;
  private executor: ProcessExecutor;

  constructor(options: GitClientOptions) {
    this.workspaceRoot = options.workspaceRoot;
    this.executor =
      options.processExecutor ||
      new ProcessExecutor({ workspaceRoot: this.workspaceRoot });
  }

  public async isGitRepo(): Promise<boolean> {
    try {
      const res = await this.executor.execute('git rev-parse --is-inside-work-tree', {
        cwd: this.workspaceRoot,
      });
      return res.exitCode === 0 && res.stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  public async status(): Promise<GitStatus> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        clean: true,
        files: [],
        stagedFiles: [],
        modifiedFiles: [],
        untrackedFiles: [],
        conflictedFiles: [],
      };
    }

    const res = await this.executor.execute('git status --porcelain=v1 -b', {
      cwd: this.workspaceRoot,
    });

    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    let branch = 'unknown';
    let ahead = 0;
    let behind = 0;
    const files: GitFileStatus[] = [];
    const stagedFiles: string[] = [];
    const modifiedFiles: string[] = [];
    const untrackedFiles: string[] = [];
    const conflictedFiles: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        const branchLine = line.substring(3).trim();
        const noCommitMatch = branchLine.match(/No commits yet on ([^\s]+)/i);
        if (noCommitMatch) {
          branch = noCommitMatch[1];
        } else {
          const branchMatch = branchLine.match(/^([^.\s]+)/);
          if (branchMatch) {
            branch = branchMatch[1];
          }
        }
        const aheadMatch = branchLine.match(/ahead (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        const behindMatch = branchLine.match(/behind (\d+)/);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
        continue;
      }

      if (line.length >= 3) {
        const indexStatus = line[0] as GitFileStatus['index'];
        const workingTreeStatus = line[1] as GitFileStatus['workingTree'];
        const filePath = line.substring(3).trim();

        const isStaged = indexStatus !== ' ' && indexStatus !== '?';
        const fileStatus: GitFileStatus = {
          path: filePath,
          index: indexStatus,
          workingTree: workingTreeStatus,
          staged: isStaged,
        };
        files.push(fileStatus);

        if (indexStatus === '?' && workingTreeStatus === '?') {
          untrackedFiles.push(filePath);
        } else {
          if (isStaged) stagedFiles.push(filePath);
          if (workingTreeStatus === 'M' || workingTreeStatus === 'D') {
            modifiedFiles.push(filePath);
          }
          if (indexStatus === 'U' || workingTreeStatus === 'U') {
            conflictedFiles.push(filePath);
          }
        }
      }
    }

    return {
      isRepo: true,
      branch,
      ahead,
      behind,
      clean: files.length === 0,
      files,
      stagedFiles,
      modifiedFiles,
      untrackedFiles,
      conflictedFiles,
    };
  }

  public async diff(options: GitDiffOptions = {}): Promise<string> {
    let cmd = 'git diff';
    if (options.staged) {
      cmd += ' --staged';
    }
    if (options.commit) {
      cmd += ` ${options.commit}`;
    }
    if (options.file) {
      cmd += ` -- "${options.file}"`;
    }

    const res = await this.executor.execute(cmd, { cwd: this.workspaceRoot });
    return res.stdout;
  }

  public async log(maxCount: number = 10): Promise<GitLogEntry[]> {
    const separator = '---GIT-LOG-SEPARATOR---';
    const format = `%H%n%h%n%an%n%ae%n%ad%n%s${separator}`;
    const cmd = `git log -n ${maxCount} --format="${format}"`;

    const res = await this.executor.execute(cmd, { cwd: this.workspaceRoot });
    if (res.exitCode !== 0) {
      return [];
    }

    const blocks = res.stdout.split(separator).filter((b: string) => b.trim().length > 0);
    const entries: GitLogEntry[] = [];

    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/);
      if (lines.length >= 6) {
        entries.push({
          hash: lines[0],
          shortHash: lines[1],
          author: lines[2],
          email: lines[3],
          date: lines[4],
          message: lines.slice(5).join(' '),
        });
      }
    }

    return entries;
  }

  public async branch(): Promise<{ current: string; all: string[] }> {
    const res = await this.executor.execute('git branch', { cwd: this.workspaceRoot });
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    let current = '';
    const all: string[] = [];

    for (const line of lines) {
      const isCurrent = line.startsWith('*');
      const name = line.replace('*', '').trim();
      all.push(name);
      if (isCurrent) {
        current = name;
      }
    }

    return { current, all };
  }

  public async stage(files: string[] | '.' = '.'): Promise<void> {
    const targets = Array.isArray(files) ? files.map((f) => `"${f}"`).join(' ') : '.';
    const res = await this.executor.execute(`git add ${targets}`, {
      cwd: this.workspaceRoot,
    });
    if (res.exitCode !== 0) {
      throw new Error(`Failed to stage files: ${res.stderr}`);
    }
  }

  public async commit(options: GitCommitOptions): Promise<string> {
    if (!options.message || options.message.trim().length === 0) {
      throw new Error('Commit message cannot be empty.');
    }

    if (options.stageAll) {
      await this.stage('.');
    } else if (options.files && options.files.length > 0) {
      await this.stage(options.files);
    }

    // Escape quotes in commit message
    const sanitizedMsg = options.message.replace(/"/g, '\\"');
    const emptyFlag = options.allowEmpty ? '--allow-empty' : '';
    const cmd = `git commit ${emptyFlag} -m "${sanitizedMsg}"`;

    const res = await this.executor.execute(cmd, { cwd: this.workspaceRoot });
    if (res.exitCode !== 0) {
      throw new Error(`Git commit failed: ${res.stderr || res.stdout}`);
    }

    return res.stdout.trim();
  }
}
